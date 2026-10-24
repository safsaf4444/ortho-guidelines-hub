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
 *   --out <file>   also write every item's outcome as JSON.
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
 *   unsupported   refused as unsupported/contradictory (database 22023), or a
 *                 class the adapter does not stage, or a malformed candidate
 *   failed        anything else went wrong for that candidate; nothing was
 *                 written for it (each call is one transaction). Retry the
 *                 same report.
 *   not-owner     the provider is staged by the other producer
 *   unowned       the provider has no staging owner (fails the run)
 *   provider-not-ok  the provider's discovery run failed or was skipped
 *   would-submit  dry run only
 *
 * Exit 1 when anything is failed, unsupported or unowned, or the report is
 * invalid; 0 otherwise.
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
    candidates: DiscoveryCandidate[];
    surfaces?: Array<{ url: string; retirementAssertions?: Array<{ url: string; topic: string; guidelineId: string; statement: string }> }>;
  }>;
}

export type Outcome =
  | 'staged' | 'existing' | 'already_open' | 'held'
  | 'unsupported' | 'failed' | 'not-owner' | 'unowned' | 'provider-not-ok' | 'would-submit';

export interface ItemResult {
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
  for (const p of r.reports) {
    if (!p || typeof p.provider !== 'string' || !Array.isArray(p.candidates)) {
      return { ok: false, error: 'a provider report lacks `provider` or `candidates`' };
    }
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
    urlAlternatives: c.urlAlternatives ?? [],
    statedLabels: c.statedLabels ?? [],
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

const REQUIRED: Array<keyof DiscoveryCandidate> = ['discoveryId', 'provider', 'providerName', 'surface', 'topic', 'discoveredUrl', 'discoveredAt'];

export interface Plan {
  submit: Array<{ payload: StagePayload; result: ItemResult }>;
  notSubmitted: ItemResult[];
  /** BOFAS-style: owned elsewhere, transition to discovery pending. */
  transitionPreview: Array<{ provider: string; payload: StagePayload }>;
  retirements: Array<{ provider: string; surface: string; url: string; topic: string; guidelineId: string; statement: string }>;
  duplicates: number;
  runId: string;
}

/** Decides, without any database, what would be submitted and why everything else is not. */
export function planReport(report: DiscoveryReportFile): Plan {
  const submit: Plan['submit'] = [];
  const notSubmitted: ItemResult[] = [];
  const transitionPreview: Plan['transitionPreview'] = [];
  const retirements: Plan['retirements'] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  const item = (c: Partial<DiscoveryCandidate>, outcome: Outcome, detail: string): ItemResult => ({
    discoveryId: String(c.discoveryId ?? '(none)'), provider: String(c.provider ?? '(none)'),
    classification: String(c.classification ?? '(none)'), topic: String(c.topic ?? ''),
    discoveredUrl: String(c.discoveredUrl ?? ''), outcome, detail,
  });

  for (const p of report.reports) {
    for (const s of p.surfaces ?? []) {
      for (const a of s.retirementAssertions ?? []) retirements.push({ provider: p.provider, surface: s.url, ...a });
    }
    for (const c of p.candidates) {
      if (p.outcome !== 'ok') {
        notSubmitted.push(item(c, 'provider-not-ok', `the ${p.provider} discovery run was ${p.outcome}${p.outcomeReason ? `: ${p.outcomeReason}` : ''}`));
        continue;
      }
      const missing = REQUIRED.filter((k) => typeof c[k] !== 'string' || (c[k] as string).trim() === '');
      if (missing.length > 0) {
        notSubmitted.push(item(c, 'unsupported', `malformed candidate: missing ${missing.join(', ')}`));
        continue;
      }
      if (!(ALL_DISCOVERY_CLASSES as readonly string[]).includes(c.classification)) {
        notSubmitted.push(item(c, 'unsupported', `class ${c.classification} is not staged (report-only)`));
        continue;
      }
      if (seen.has(c.discoveryId)) { duplicates++; continue; }
      seen.add(c.discoveryId);
      const payload = toPayload(c, report.schemaVersion);
      const own = checkOwnership(c.provider, 'discover');
      if (!own.ok) {
        notSubmitted.push(item(c, own.status, own.message));
        if (own.status === 'not-owner' && own.ownership.pendingTransition?.to === 'discover') {
          transitionPreview.push({ provider: c.provider, payload });
        }
        continue;
      }
      submit.push({ payload, result: item(c, 'would-submit', '') });
    }
  }
  return { submit, notSubmitted, transitionPreview, retirements, duplicates, runId: runIdentity(report.schemaVersion, submit.map((x) => x.payload)) };
}

/** Maps one RPC response to an outcome. 22023 is the database refusing unsupported or contradictory evidence. */
export function classifyResponse(data: unknown, error: { code?: string; message?: string } | null): Pick<ItemResult, 'outcome' | 'detail' | 'stagedId' | 'evidence' | 'catalogueRelation' | 'identityBasis'> {
  if (error) {
    if (error.code === '22023') return { outcome: 'unsupported', detail: `refused by the database: ${error.message ?? ''}` };
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

interface Args { report?: string; write: boolean; target?: string; allowRemote: boolean; compareSync?: string; out?: string; error?: string }
export function parseArgs(argv: string[]): Args {
  const a: Args = { write: false, allowRemote: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--write') a.write = true;
    else if (x === '--allow-remote-target') a.allowRemote = true;
    else if (x === '--target' || x === '--compare-sync' || x === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return { ...a, error: `${x} needs a value` };
      if (x === '--target') a.target = v; else if (x === '--compare-sync') a.compareSync = v; else a.out = v;
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
  const mode = args.write ? 'WRITE' : 'DRY RUN';
  console.log(`=== Stage discovery report ${path.basename(args.report!)} ===`);
  console.log(`MODE: ${mode}${args.write ? ` → ${args.target}` : ' — no database contact; nothing is read from .env files'}`);
  console.log(`run id: ${plan.runId}   (report generatedAt ${parsed.report.generatedAt ?? '(none)'} is not part of it)`);
  if (!args.write && args.target) console.log('(--target is ignored without --write)');
  if (plan.duplicates > 0) console.log(`collapsed ${plan.duplicates} repeated discoveryId(s) within the report`);

  const results: ItemResult[] = [...plan.notSubmitted];
  if (args.write) {
    if (!isLoopback(args.target!) && !args.allowRemote) {
      console.error(`[stage-discovery] ${args.target} is not a loopback address. A remote target needs --allow-remote-target as well. Nothing submitted.`);
      return 2;
    }
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!key) {
      console.error('[stage-discovery] SUPABASE_SERVICE_ROLE_KEY is not set in the environment. No .env file is read. Nothing submitted.');
      return 2;
    }
    const client = createClient(args.target!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    let fatal: string | null = null;
    for (const { payload, result } of plan.submit) {
      if (fatal) { results.push({ ...result, outcome: 'failed', detail: `not attempted: ${fatal}` }); continue; }
      let r: ReturnType<typeof classifyResponse>;
      try {
        const { data, error } = await client.rpc('stage_discovery_candidate', { p_run_id: plan.runId, p_producer: 'discover', p_candidate: payload });
        r = classifyResponse(data, error);
        if (error && FATAL_CODES.has(error.code ?? '')) fatal = `${error.code}: ${error.message}`;
      } catch (e) {
        r = { outcome: 'failed', detail: `request failed: ${(e as Error).message}` };
      }
      results.push({ ...result, ...r });
    }
  } else {
    results.push(...plan.submit.map((s) => ({ ...s.result, detail: 'holds, catalogue checks and queue state are decided by the database in write mode' })));
  }

  const order: Outcome[] = ['staged', 'existing', 'already_open', 'held', 'would-submit', 'unsupported', 'failed', 'not-owner', 'unowned', 'provider-not-ok'];
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log('\nOutcomes:');
  for (const o of order) console.log(`  ${o.padEnd(16)} ${count(o)}`);
  console.log(`  evidence appended ${results.filter((r) => r.evidence === 'appended').length}, already recorded ${results.filter((r) => r.evidence === 'already_recorded').length}`);
  console.log(`  report-only (publisher retirement assertions, never staged): ${plan.retirements.length}`);
  console.log('\nItems:');
  for (const r of results) {
    console.log(`  [${r.outcome}] ${r.provider} ${r.classification} ${r.discoveryId} — "${r.topic}"${r.catalogueRelation ? ` (link vs entry: ${r.catalogueRelation})` : ''}${r.detail ? `\n      ${r.detail}` : ''}`);
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
      generatedAt: parsed.report.generatedAt ?? null, counts: Object.fromEntries(order.map((o) => [o, count(o)])),
      items: results, reportOnly: plan.retirements }, null, 2));
  }
  console.log(args.write
    ? '\nNothing was published and no catalogue entry was changed. Re-running this same report retries only what failed.'
    : '\nDry run: no database contact, nothing written.');
  return ['failed', 'unsupported', 'unowned'].some((o) => count(o as Outcome) > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exitCode, not exit(): see scripts/stage-candidates.ts (Node 24 on Windows).
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    console.error('[stage-discovery] unexpected failure:', err);
    process.exitCode = 1;
  });
}
