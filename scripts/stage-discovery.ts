/**
 * scripts/stage-discovery.ts
 * ──────────────────────────
 * The discovery-report staging adapter: files the candidates in ONE report
 * written by scripts/discover.ts (#220) into the review queue, through
 * public.stage_discovery_candidate(). It does not run discovery, and it never
 * publishes or changes a catalogue entry.
 *
 *   Dry run (the default; no database contact of any kind):
 *     npx tsx scripts/stage-discovery.ts reports/discovery-<stamp>.json
 *     npx tsx scripts/stage-discovery.ts <report> --compare-sync candidates.json
 *
 *   Write (both flags required; nothing is read from .env or .env.local):
 *     SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/stage-discovery.ts <report> --write --target <supabase-url>
 *     … plus --allow-remote-target when the target is not a loopback address.
 *
 *   --out <file>         also write every item's outcome as JSON (with its run
 *                        id, report position and identity key, for reconciling).
 *   --timeout-ms <n>     per-request limit in write mode, headers AND body
 *                        (default 30000; 1000–300000).
 *
 * ─── WHAT IS SUBMITTED ─────────────────────────────────────────────────────
 *
 *   * Candidates of the three discovery classes (NEW_GUIDELINE,
 *     POSSIBLE_NEW_EDITION, EDITION_TOKEN_CHANGED) from a provider whose run
 *     outcome was 'ok' and whose staging owner is discovery
 *     (scripts/lib/staging-ownership.ts). BOFAS belongs to sync-providers; its
 *     transition to discovery awaits approval, so BOFAS is only ever shown as a
 *     dry-run comparison.
 *   * Each as the producer wrote it: discoveredUrl verbatim, urlAlternatives,
 *     statedLabels, softMatch / tokenChange, notes. The database derives the
 *     keys, validates the evidence against its catalogue, honours the staging
 *     holds (UK-FALCON), and decides staged / existing / already_open / held.
 *   * Never: publisher retirement assertions (report-only, printed), a class
 *     outside the three, or anything from a provider whose run failed or was
 *     skipped. Each of these is LISTED with its reason, never dropped silently.
 *
 * ─── RUN IDENTITY (retry safety) ────────────────────────────────────────────
 *
 *   run id = "discover:" + first 32 hex of sha256 over the canonical JSON
 *   (object keys sorted, candidates sorted by discoveryId) of the report's
 *   schemaVersion and the exact payloads submitted — which include each
 *   candidate's own `discoveredAt` (the sweep time).
 *
 *   NOT in it: the report's top-level `generatedAt`, its `note`, provider
 *   coverage and fetch metadata, file formatting and key order. So re-stamping
 *   or re-saving a report gives the SAME run id, and evidence is recorded once
 *   per (queue row, run, candidate): a retry adds nothing. A genuinely new
 *   sweep stamps new `discoveredAt` values on its candidates, so it is a new
 *   run, and its sightings are recorded as new evidence on the existing rows —
 *   never as new rows.
 *
 * ─── OUTCOMES ──────────────────────────────────────────────────────────────
 *
 *   staged | existing | already_open | held      from the database
 *   invalid       failed validation BEFORE any database contact: not an
 *                 object, a missing or mistyped field, a bad timestamp or URL,
 *                 or evidence that does not fit its class. Not retryable: the
 *                 report must be fixed.
 *   duplicate     a repeat of an earlier entry with the same discoveryId and
 *                 an IDENTICAL payload; submitted once, each repeat listed
 *   conflict      the same discoveryId with DIFFERENT content: none of those
 *                 entries is submitted. Not retryable.
 *   unsupported   refused as unsupported/contradictory (database 22023), or a
 *                 class the adapter does not stage. Not retryable.
 *   failed        the database answered with an error; that call's
 *                 transaction rolled back, so nothing was written for it.
 *                 Retryable: re-run the same report.
 *   unconfirmed   no answer: the request timed out or the connection failed
 *                 after it may have been sent. The database MAY have committed
 *                 it. Never retried automatically; the run stops there.
 *                 Re-running the same report reconciles it safely: a committed
 *                 item comes back existing / already_recorded.
 *   not-attempted after the run stopped (unconfirmed, or an error no later
 *                 call could survive). Retryable.
 *   not-owner     the provider is staged by the other producer
 *   unowned       the provider has no staging owner (fails the run)
 *   provider-not-ok  the provider's discovery run failed or was skipped
 *   would-submit  dry run only
 *
 * Exit 1 when anything is invalid, conflict, unsupported, failed,
 * unconfirmed, not-attempted or unowned, or the report is unreadable; 2 for a
 * usage error (missing flag, key or target check); 0 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { ALL_DISCOVERY_CLASSES, DISCOVERY_SCHEMA_VERSION, type DiscoveryCandidate } from './lib/discovery-classification';
import { documentIdentityKey } from './lib/ingestion';
import { checkOwnership, STAGING_OWNERSHIP } from './lib/staging-ownership';

// ── Report shape (the parts this adapter reads) ──────────────────────────

export interface DiscoveryReportFile {
  schemaVersion: number;
  generatedAt?: string;
  reports: Array<{
    provider: string;
    providerName?: string;
    outcome: 'ok' | 'failed' | 'skipped';
    outcomeReason?: string;
    /** Validated entry by entry before use: anything may arrive here. */
    candidates: unknown[];
    surfaces?: Array<{ url: string; retirementAssertions?: Array<{ url: string; topic: string; guidelineId: string; statement: string }> }>;
  }>;
}

export type Outcome =
  | 'staged' | 'existing' | 'already_open' | 'held'
  | 'invalid' | 'duplicate' | 'conflict' | 'unsupported' | 'failed' | 'unconfirmed' | 'not-attempted'
  | 'not-owner' | 'unowned' | 'provider-not-ok' | 'would-submit';

const RETRYABLE: ReadonlySet<Outcome> = new Set(['failed', 'unconfirmed', 'not-attempted']);
const NOT_RETRYABLE: ReadonlySet<Outcome> = new Set(['invalid', 'conflict', 'unsupported', 'unowned']);
/** Outcomes that make the run exit 1. */
const EXIT_1: ReadonlySet<Outcome> = new Set([...RETRYABLE, ...NOT_RETRYABLE]);

export interface ItemResult {
  /** Where in the report: "<provider report>#<candidate index>". */
  position: string;
  discoveryId: string;
  provider: string;
  classification: string;
  topic: string;
  discoveredUrl: string;
  outcome: Outcome;
  detail?: string;
  stagedId?: string;
  evidence?: string;
  catalogueRelation?: string;
  identityBasis?: string;
  /** documentIdentityKey(discoveredUrl), for reconciling an item against the queue. */
  identityKey?: string;
  /** true: re-running the same report may change the outcome; false: the report must change. */
  retryable?: boolean;
}

/** What the database function takes. Every field is the producer's, verbatim, except the derived key. */
export interface StagePayload {
  discoveryId: string;
  classification: string;
  provider: string;
  providerName: string;
  topic: string;
  surfaceUrl: string;
  discoveredUrl: string;
  sourceUrlKey: string;
  urlAlternatives: unknown[];
  statedLabels: unknown[];
  softMatch?: unknown;
  tokenChange?: unknown;
  matchedGuidelineId: string | null;
  observedAt: string;
  reportSchemaVersion: number;
  notes: string;
}

export function parseReport(raw: string): { ok: true; report: DiscoveryReportFile } | { ok: false; error: string } {
  let json: unknown;
  try { json = JSON.parse(raw); } catch (e) { return { ok: false, error: `not JSON: ${(e as Error).message}` }; }
  const r = json as Partial<DiscoveryReportFile>;
  if (!r || typeof r !== 'object') return { ok: false, error: 'not an object' };
  if (r.schemaVersion !== DISCOVERY_SCHEMA_VERSION) {
    return { ok: false, error: `schemaVersion ${String(r.schemaVersion)}; this adapter reads discovery schema v${DISCOVERY_SCHEMA_VERSION} only` };
  }
  if (!Array.isArray(r.reports)) return { ok: false, error: '`reports` is not an array' };
  for (const p of r.reports as unknown[]) {
    const q = p as { provider?: unknown; candidates?: unknown; surfaces?: unknown } | null;
    if (!q || typeof q !== 'object' || Array.isArray(q) || typeof q.provider !== 'string' || !Array.isArray(q.candidates)) {
      return { ok: false, error: 'a provider report is not an object with `provider` and a `candidates` array' };
    }
    if (q.surfaces !== undefined && !Array.isArray(q.surfaces)) return { ok: false, error: `${q.provider}: \`surfaces\` is not an array` };
  }
  return { ok: true, report: r as DiscoveryReportFile };
}

export function toPayload(c: DiscoveryCandidate, schemaVersion: number): StagePayload {
  return {
    discoveryId: c.discoveryId,
    classification: c.classification,
    provider: c.provider,
    providerName: c.providerName,
    topic: c.topic,
    surfaceUrl: c.surface,
    discoveredUrl: c.discoveredUrl,
    sourceUrlKey: documentIdentityKey(c.discoveredUrl),
    urlAlternatives: c.urlAlternatives,
    statedLabels: c.statedLabels,
    ...(c.softMatch !== undefined ? { softMatch: c.softMatch } : {}),
    ...(c.tokenChange !== undefined ? { tokenChange: c.tokenChange } : {}),
    matchedGuidelineId: c.matchedGuidelineId ?? null,
    observedAt: c.discoveredAt,
    reportSchemaVersion: schemaVersion,
    notes: c.notes ?? '',
  };
}

/** JSON with object keys sorted at every level, so key order and whitespace never matter. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** See "RUN IDENTITY" in the header. */
export function runIdentity(schemaVersion: number, payloads: StagePayload[]): string {
  const sorted = [...payloads].sort((a, b) => (a.discoveryId < b.discoveryId ? -1 : a.discoveryId > b.discoveryId ? 1 : 0));
  const digest = createHash('sha256').update(canonicalJson({ schemaVersion, candidates: sorted }), 'utf8').digest('hex');
  return `discover:${digest.slice(0, 32)}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const httpUrl = (v: unknown): boolean => {
  if (!nonEmpty(v)) return false;
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
};
/** ISO-8601 with a time and an explicit zone, as discover.ts writes (new Date().toISOString()). */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const LABEL_ORIGINS = ['anchor-text', 'filename', 'page-body'];

/**
 * Every problem with one report entry, checked before any database contact.
 * Mirrors the database's own evidence-shape rules for the three classes, so a
 * bad entry is reported as `invalid` (fix the report) rather than discovered
 * as a refusal or a cast error mid-run. Empty = valid. A class outside the
 * three is NOT an error here; planReport reports it as unsupported.
 */
export function validateCandidate(c: unknown): string[] {
  if (!isObj(c)) return [`entry is not an object (${c === null ? 'null' : Array.isArray(c) ? 'array' : typeof c})`];
  const e: string[] = [];
  for (const k of ['discoveryId', 'provider', 'providerName', 'topic', 'classification']) {
    if (!nonEmpty(c[k])) e.push(`${k} must be a non-empty string`);
  }
  for (const k of ['discoveredUrl', 'surface']) if (!httpUrl(c[k])) e.push(`${k} must be an http(s) URL`);
  if (!(typeof c.discoveredAt === 'string' && ISO_TIMESTAMP.test(c.discoveredAt) && !Number.isNaN(Date.parse(c.discoveredAt)))) {
    e.push('discoveredAt must be an ISO-8601 timestamp with a time zone');
  }
  if (c.notes !== undefined && typeof c.notes !== 'string') e.push('notes must be a string');
  if (c.matchedGuidelineId !== undefined && c.matchedGuidelineId !== null && !nonEmpty(c.matchedGuidelineId)) {
    e.push('matchedGuidelineId must be a non-empty string or null');
  }
  if (!Array.isArray(c.statedLabels)) e.push('statedLabels must be an array');
  else c.statedLabels.forEach((l, i) => {
    if (!isObj(l) || !LABEL_ORIGINS.includes(l.origin as string) || typeof l.value !== 'string' || !nonEmpty(l.readFrom)
      || (l.fieldLabel !== undefined && typeof l.fieldLabel !== 'string')) {
      e.push(`statedLabels[${i}] must be { origin: ${LABEL_ORIGINS.join('|')}, value, readFrom[, fieldLabel] }`);
    }
  });
  if (!Array.isArray(c.urlAlternatives)) e.push('urlAlternatives must be an array');
  else c.urlAlternatives.forEach((a, i) => {
    if (!isObj(a) || !httpUrl(a.url) || !nonEmpty(a.relation) || (a.scope !== 'document' && a.scope !== 'surface')) {
      e.push(`urlAlternatives[${i}] must be { url: http(s), relation, scope: document|surface, … }`);
    }
  });
  const cls = c.classification;
  const matched = c.matchedGuidelineId ?? null;
  const soft = c.softMatch;
  const tok = c.tokenChange;
  if (cls === 'NEW_GUIDELINE') {
    if (matched !== null) e.push('NEW_GUIDELINE must not name a catalogue entry');
    if (soft !== undefined || tok !== undefined) e.push('NEW_GUIDELINE carries no softMatch or tokenChange');
  } else if (cls === 'POSSIBLE_NEW_EDITION') {
    if (!nonEmpty(matched)) e.push('POSSIBLE_NEW_EDITION must name its catalogue entry');
    if (!isObj(soft) || soft.guidelineId !== matched || typeof soft.titleSimilarity !== 'number'
      || !(soft.titleSimilarity >= 0 && soft.titleSimilarity <= 1)) {
      e.push('POSSIBLE_NEW_EDITION needs softMatch { guidelineId: the named entry, titleSimilarity: 0..1, … }');
    }
    if (tok !== undefined) e.push('POSSIBLE_NEW_EDITION carries no tokenChange');
  } else if (cls === 'EDITION_TOKEN_CHANGED') {
    if (!nonEmpty(matched)) e.push('EDITION_TOKEN_CHANGED must name its catalogue entry');
    if (!isObj(tok) || tok.guidelineId !== matched || !nonEmpty(tok.parameter) || typeof tok.previousValue !== 'string'
      || typeof tok.observedValue !== 'string' || tok.previousValue === tok.observedValue) {
      e.push('EDITION_TOKEN_CHANGED needs tokenChange { guidelineId: the named entry, parameter, previousValue ≠ observedValue, … }');
    }
    if (soft !== undefined) e.push('EDITION_TOKEN_CHANGED carries no softMatch');
  }
  return e;
}

export interface Plan {
  submit: Array<{ payload: StagePayload; result: ItemResult }>;
  notSubmitted: ItemResult[];
  /** BOFAS-style: owned elsewhere, transition to discovery pending. */
  transitionPreview: Array<{ provider: string; payload: StagePayload }>;
  retirements: Array<{ provider: string; surface: string; url: string; topic: string; guidelineId: string; statement: string }>;
  runId: string;
}

/** Decides, without any database, what would be submitted and why everything else is not. */
export function planReport(report: DiscoveryReportFile): Plan {
  const submit: Plan['submit'] = [];
  const notSubmitted: ItemResult[] = [];
  const transitionPreview: Plan['transitionPreview'] = [];
  const retirements: Plan['retirements'] = [];
  const describe = (raw: unknown, position: string, outcome: Outcome, detail: string): ItemResult => {
    const c = isObj(raw) ? raw : {};
    const str = (v: unknown, dflt: string) => (typeof v === 'string' ? v : dflt);
    return {
      position, discoveryId: str(c.discoveryId, '(none)'), provider: str(c.provider, '(none)'),
      classification: str(c.classification, '(none)'), topic: str(c.topic, ''), discoveredUrl: str(c.discoveredUrl, ''),
      outcome, detail,
    };
  };

  // 1. Validate every entry, keeping the stageable ones in report order.
  const valid: Array<{ c: DiscoveryCandidate; position: string; payload: StagePayload }> = [];
  report.reports.forEach((p, pi) => {
    for (const s of p.surfaces ?? []) {
      for (const a of (isObj(s) && Array.isArray(s.retirementAssertions) ? s.retirementAssertions : [])) {
        retirements.push({ provider: p.provider, surface: String(s.url), ...a });
      }
    }
    p.candidates.forEach((raw, ci) => {
      const position = `${p.provider}#${ci}`;
      if (p.outcome !== 'ok') {
        notSubmitted.push(describe(raw, position, 'provider-not-ok', `the ${p.provider} discovery run was ${String(p.outcome)}${p.outcomeReason ? `: ${p.outcomeReason}` : ''} (report #${pi})`));
        return;
      }
      const errors = validateCandidate(raw);
      if (errors.length > 0) {
        notSubmitted.push(describe(raw, position, 'invalid', `validation failed: ${errors.join('; ')}`));
        return;
      }
      const c = raw as unknown as DiscoveryCandidate;
      if (!(ALL_DISCOVERY_CLASSES as readonly string[]).includes(c.classification)) {
        notSubmitted.push(describe(raw, position, 'unsupported', `class ${c.classification} is not staged (report-only)`));
        return;
      }
      valid.push({ c, position, payload: toPayload(c, report.schemaVersion) });
    });
  });

  // 2. One entry per discoveryId: identical repeats collapse (each listed);
  //    different content under one id is a conflict and nothing is submitted.
  const byId = new Map<string, typeof valid>();
  for (const v of valid) byId.set(v.c.discoveryId, [...(byId.get(v.c.discoveryId) ?? []), v]);
  const kept: typeof valid = [];
  for (const [id, group] of byId) {
    const forms = new Set(group.map((g) => canonicalJson(g.payload)));
    if (forms.size > 1) {
      for (const g of group) {
        notSubmitted.push({ ...describe(g.c, g.position, 'conflict',
          `discoveryId ${id} appears ${group.length} times (${group.map((x) => x.position).join(', ')}) with different content; none of them is submitted`),
        identityKey: g.payload.sourceUrlKey });
      }
      continue;
    }
    kept.push(group[0]);
    for (const g of group.slice(1)) {
      notSubmitted.push({ ...describe(g.c, g.position, 'duplicate', `identical to ${group[0].position}; submitted once`), identityKey: g.payload.sourceUrlKey });
    }
  }

  // 3. Ownership.
  for (const { c, position, payload } of kept) {
    const own = checkOwnership(c.provider, 'discover');
    if (!own.ok) {
      notSubmitted.push(describe(c, position, own.status, own.message));
      if (own.status === 'not-owner' && own.ownership.pendingTransition?.to === 'discover') {
        transitionPreview.push({ provider: c.provider, payload });
      }
      continue;
    }
    submit.push({ payload, result: { ...describe(c, position, 'would-submit', ''), identityKey: payload.sourceUrlKey } });
  }
  return { submit, notSubmitted, transitionPreview, retirements, runId: runIdentity(report.schemaVersion, submit.map((x) => x.payload)) };
}

/** Maps one RPC response to an outcome. 22023 is the database refusing unsupported or contradictory evidence. */
export function classifyResponse(data: unknown, error: { code?: string; message?: string } | null, httpStatus?: number): Pick<ItemResult, 'outcome' | 'detail' | 'stagedId' | 'evidence' | 'catalogueRelation' | 'identityBasis'> {
  if (error) {
    if (error.code === '22023') return { outcome: 'unsupported', detail: `refused by the database: ${error.message ?? ''}` };
    // A 5xx with no SQLSTATE came from something in front of the database (a
    // gateway or proxy). It cannot say whether the call committed.
    if (!error.code && httpStatus !== undefined && httpStatus >= 500) {
      return { outcome: 'unconfirmed', detail: `HTTP ${httpStatus} with no database error code: ${error.message ?? ''}` };
    }
    return { outcome: 'failed', detail: `${error.code ?? 'error'}: ${error.message ?? ''}` };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const status = d.status;
  if (status === 'staged' || status === 'existing' || status === 'already_open' || status === 'held') {
    const detail = status === 'already_open' ? `open as ${String(d.heldByCandidateId)} (${String(d.heldByProducer ?? 'unrecorded producer')}, ${String(d.heldByStatus)})`
      : status === 'held' ? `editorial hold (${String(d.holdStatus)}): ${String(d.reason)}`
        : status === 'existing' ? `already queued (${String(d.reviewStatus)}); not modified`
          : '';
    return {
      outcome: status, detail,
      ...(typeof d.stagedId === 'string' ? { stagedId: d.stagedId } : {}),
      ...(typeof d.evidence === 'string' ? { evidence: d.evidence } : {}),
      ...(typeof d.catalogueRelation === 'string' ? { catalogueRelation: d.catalogueRelation } : {}),
      ...(typeof d.identityBasis === 'string' ? { identityBasis: d.identityBasis } : {}),
    };
  }
  return { outcome: 'failed', detail: `unexpected response: ${JSON.stringify(data)}` };
}

/** Codes after which no further call can succeed: stop, and say so for the rest. */
const FATAL_CODES = new Set(['42501', 'PGRST202', '42883', 'PGRST301', 'PGRST302']);

function isLoopback(url: string): boolean {
  try { return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(url).hostname); } catch { return false; }
}

export const DEFAULT_TIMEOUT_MS = 30_000;
interface Args { report?: string; write: boolean; target?: string; allowRemote: boolean; compareSync?: string; out?: string; timeoutMs: number; error?: string }
export function parseArgs(argv: string[]): Args {
  const a: Args = { write: false, allowRemote: false, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--write') a.write = true;
    else if (x === '--allow-remote-target') a.allowRemote = true;
    else if (x === '--target' || x === '--compare-sync' || x === '--out' || x === '--timeout-ms') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return { ...a, error: `${x} needs a value` };
      if (x === '--target') a.target = v;
      else if (x === '--compare-sync') a.compareSync = v;
      else if (x === '--out') a.out = v;
      else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1000 || n > 300_000) return { ...a, error: '--timeout-ms must be an integer from 1000 to 300000' };
        a.timeoutMs = n;
      }
    } else if (x.startsWith('--')) return { ...a, error: `unknown option ${x}` };
    else if (!a.report) a.report = x;
    else return { ...a, error: `unexpected argument ${x}` };
  }
  if (!a.report) return { ...a, error: 'a report path is required' };
  if (a.write && !a.target) return { ...a, error: '--write needs --target <supabase-url>; there is no default target' };
  if (a.write && a.compareSync) return { ...a, error: '--compare-sync is a dry-run comparison; it cannot be combined with --write' };
  return a;
}

/** Dry-run comparison for a provider whose transition to discovery is pending. */
function compareWithSync(preview: Plan['transitionPreview'], syncFile: string): string[] {
  const raw = JSON.parse(fs.readFileSync(syncFile, 'utf-8')) as { reports?: Array<{ error?: string; candidates?: Array<{ provider: string; topic: string; versions?: Array<{ url: string }>; changeReason: string }> }> };
  const lines: string[] = [];
  for (const provider of [...new Set(preview.map((p) => p.provider))]) {
    const disc = new Map(preview.filter((p) => p.provider === provider).map((p) => [p.payload.sourceUrlKey, p.payload]));
    const sync = new Map<string, { topic: string; changeReason: string }>();
    for (const r of raw.reports ?? []) for (const c of r.candidates ?? []) {
      if (c.provider === provider && c.versions?.[0]?.url) sync.set(documentIdentityKey(c.versions[0].url), c);
    }
    const both = [...disc.keys()].filter((k) => sync.has(k));
    const discOnly = [...disc.keys()].filter((k) => !sync.has(k));
    const syncOnly = [...sync.keys()].filter((k) => !disc.has(k));
    lines.push(`  ${provider}: discovery would file ${disc.size}, sync-providers files ${sync.size}; same document in both: ${both.length}; discovery only: ${discOnly.length}; sync only: ${syncOnly.length}`);
    for (const k of both) lines.push(`    = ${disc.get(k)!.classification} (discovery) vs ${sync.get(k)!.changeReason} (sync): ${k}`);
    for (const k of discOnly) lines.push(`    + discovery only, ${disc.get(k)!.classification}: ${k}`);
    for (const k of syncOnly) lines.push(`    - sync only, ${sync.get(k)!.changeReason}: ${k}`);
  }
  return lines;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.error) { console.error(`[stage-discovery] ${args.error}`); return 2; }
  const parsed = parseReport(fs.readFileSync(path.resolve(args.report!), 'utf-8'));
  if (!parsed.ok) { console.error(`[stage-discovery] invalid report: ${parsed.error}. Nothing submitted.`); return 1; }
  const plan = planReport(parsed.report);

  // Write-mode checks come BEFORE any banner: a refused run must not print "MODE: WRITE".
  let key = '';
  if (args.write) {
    if (!isLoopback(args.target!) && !args.allowRemote) {
      console.error(`[stage-discovery] ${args.target} is not a loopback address. A remote target needs --allow-remote-target as well. Nothing submitted.`);
      return 2;
    }
    key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!key) {
      console.error('[stage-discovery] SUPABASE_SERVICE_ROLE_KEY is not set in the environment. No .env file is read. Nothing submitted.');
      return 2;
    }
  }
  console.log(`=== Stage discovery report ${path.basename(args.report!)} ===`);
  console.log(args.write
    ? `MODE: WRITE → ${args.target}   (timeout ${args.timeoutMs} ms per request; no automatic retry)`
    : 'MODE: DRY RUN — no database contact; nothing is read from .env files');
  console.log(`run id: ${plan.runId}   (report generatedAt ${parsed.report.generatedAt ?? '(none)'} is not part of it)`);
  if (!args.write && args.target) console.log('(--target is ignored without --write)');

  const results: ItemResult[] = [...plan.notSubmitted];
  if (args.write) {
    // Every request is bounded, headers AND body. When the bound is hit, or the
    // connection fails, the request may already have reached the database and
    // committed, so the outcome is UNCONFIRMED, never "nothing written".
    const transport: { last: { kind: 'timeout' | 'network'; message: string } | null } = { last: null };
    const boundedFetch: typeof fetch = async (input, init) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), args.timeoutMs);
      try {
        const res = await fetch(input, { ...init, signal: ac.signal });
        const body = await res.text();
        return new Response([101, 204, 205, 304].includes(res.status) ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) {
        transport.last = { kind: ac.signal.aborted ? 'timeout' : 'network', message: e instanceof Error ? e.message : String(e) };
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };
    const client = createClient(args.target!, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch } });
    const unconfirmed = (why: string): ReturnType<typeof classifyResponse> => ({
      outcome: 'unconfirmed',
      detail: `${why}. The database may or may not have committed this item. Not retried. To reconcile, re-run this same report `
        + `(run id ${plan.runId}): a committed item comes back existing / already_recorded, and nothing is filed twice.`,
    });
    let stop: string | null = null;
    for (const { payload, result } of plan.submit) {
      if (stop) { results.push({ ...result, outcome: 'not-attempted', detail: `not attempted: ${stop}` }); continue; }
      transport.last = null;
      let r: ReturnType<typeof classifyResponse>;
      try {
        const { data, error, status } = await client.rpc('stage_discovery_candidate', { p_run_id: plan.runId, p_producer: 'discover', p_candidate: payload });
        const t = transport.last as { kind: 'timeout' | 'network'; message: string } | null;
        r = t ? unconfirmed(t.kind === 'timeout' ? `no response within ${args.timeoutMs} ms` : `connection failed (${t.message})`)
          : classifyResponse(data, error, status);
        if (error && FATAL_CODES.has(error.code ?? '')) stop = `${error.code}: ${error.message}`;
      } catch (e) {
        r = unconfirmed(`request failed (${e instanceof Error ? e.message : String(e)})`);
      }
      if (r.outcome === 'unconfirmed') stop = `the run stopped after an unconfirmed request (${result.discoveryId})`;
      results.push({ ...result, ...r });
    }
  } else {
    results.push(...plan.submit.map((s) => ({ ...s.result, detail: 'holds, catalogue checks and queue state are decided by the database in write mode' })));
  }

  for (const r of results) {
    if (RETRYABLE.has(r.outcome)) r.retryable = true;
    else if (NOT_RETRYABLE.has(r.outcome)) r.retryable = false;
  }
  const order: Outcome[] = ['staged', 'existing', 'already_open', 'held', 'would-submit', 'duplicate', 'invalid', 'conflict',
    'unsupported', 'failed', 'unconfirmed', 'not-attempted', 'not-owner', 'unowned', 'provider-not-ok'];
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log('\nOutcomes:');
  for (const o of order) console.log(`  ${o.padEnd(16)} ${count(o)}`);
  console.log(`  evidence appended ${results.filter((r) => r.evidence === 'appended').length}, already recorded ${results.filter((r) => r.evidence === 'already_recorded').length}`);
  console.log(`  report-only (publisher retirement assertions, never staged): ${plan.retirements.length}`);
  console.log('\nItems:');
  for (const r of results) {
    console.log(`  [${r.outcome}] ${r.position} ${r.provider} ${r.classification} ${r.discoveryId} — "${r.topic}"${r.catalogueRelation ? ` (link vs entry: ${r.catalogueRelation})` : ''}${r.detail ? `\n      ${r.detail}` : ''}`);
  }
  for (const a of plan.retirements) console.log(`  [report-only] ${a.provider} retirement of ${a.guidelineId}: ${a.url} (read from ${a.surface})`);

  if (plan.transitionPreview.length > 0) {
    const providers = [...new Set(plan.transitionPreview.map((p) => p.provider))];
    console.log(`\nPending ownership transition (NOT active): ${providers.map((p) => `${p} → discover (${STAGING_OWNERSHIP[p]?.pendingTransition?.status})`).join(', ')}`);
    if (args.compareSync) {
      if (args.write) console.log('  (comparison is dry-run only)');
      else compareWithSync(plan.transitionPreview, path.resolve(args.compareSync)).forEach((l) => console.log(l));
    } else {
      console.log('  Dry run with --compare-sync <candidates.json> to compare with what sync-providers files for it.');
    }
  }

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), JSON.stringify({ mode: args.write ? 'write' : 'dry-run', runId: plan.runId,
      report: path.resolve(args.report!), generatedAt: parsed.report.generatedAt ?? null,
      ...(args.write ? { target: args.target, timeoutMs: args.timeoutMs } : {}),
      counts: Object.fromEntries(order.map((o) => [o, count(o)])),
      items: results, reportOnly: plan.retirements }, null, 2));
  }
  if (count('unconfirmed') > 0) {
    console.log(`\nUNCONFIRMED: ${count('unconfirmed')} request(s) got no answer and may have been committed. Nothing was retried. `
      + `Re-run this same report to reconcile (run id ${plan.runId}); committed items return existing / already_recorded.`);
  }
  console.log(args.write
    ? '\nNothing was published and no catalogue entry was changed. Re-running this same report retries only what is retryable.'
    : '\nDry run: no database contact, nothing written.');
  return results.some((r) => EXIT_1.has(r.outcome)) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exitCode, not exit(): see scripts/stage-candidates.ts (Node 24 on Windows).
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    console.error('[stage-discovery] unexpected failure:', err);
    process.exitCode = 1;
  });
}
