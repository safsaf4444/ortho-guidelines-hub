/**
 * scripts/stage-candidates.ts
 * ───────────────────────────
 * Files the candidates discovered by scripts/sync-providers.ts into
 * `public.staged_guidelines`, the editor review queue.
 *
 * This is the ONLY writer of that table. It runs in CI with
 * SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS — necessary because the table
 * deliberately has no INSERT policy for any browser-reachable role, so there is
 * no way for a client to inject into the review queue. See
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql.
 *
 * ── "STAGING ONLY" IS A PROPERTY OF THIS SCRIPT, NOT OF THE CREDENTIAL ───
 * Stated precisely, because the distinction is easy to lose and load-bearing:
 *
 * This script writes nothing to `guidelines` and never calls the approve RPC,
 * so publishing stays a human action. But the key it runs with COULD do both.
 * Verified against the live database: `service_role` has rolbypassrls = true,
 * holds INSERT and UPDATE on `public.guidelines`, UPDATE on
 * `public.staged_guidelines`, and EXECUTE on approve_staged_guideline(). RLS
 * and the editor allowlist do not apply to it at all.
 *
 * The workflow's `permissions: contents: read` does NOT constrain any of that
 * — it is a GitHub token scope and limits only what the job may do to the
 * REPOSITORY. It says nothing about database privileges.
 *
 * So the guarantee is: this code does not publish. It is not: the credential
 * cannot publish. Anyone changing this file is changing a privileged path —
 * review it as one.
 *
 * ─── STAGE THROUGH THE RPC, NEVER OVERWRITE ────────────────────────────────
 * This is the load-bearing decision in this file, and the one thing not to
 * "simplify" later.
 *
 * `candidateId` is deterministic — same pipeline, provider, reason and URL
 * produce the same id every week (see makeCandidateId in lib/ingestion.ts). So
 * every scheduled run rediscovers all the same candidates, and a natural
 * `upsert` would rewrite each existing row back to `review_status = 'pending'`,
 * silently undoing editorial work: a candidate an editor had REJECTED would
 * reappear the following Sunday as if never looked at.
 *
 * So rows are filed by `public.stage_sync_candidates` (migration
 * 20261024_discovery_review_queue.sql), which never modifies an existing row
 * and reports one outcome per candidate:
 *
 *   staged        new row filed (pending); this sighting recorded on it
 *   existing      this candidate id is already queued, in ANY status — left
 *                 exactly as the editor left it; this sighting is appended
 *                 to that row's evidence
 *   already_open  a DIFFERENT candidate (possibly from another producer)
 *                 holds this document's one open queue slot; no row is
 *                 filed, and this sighting is appended to THAT row
 *   held          the document is on the editorial staging-hold list
 *   failed        refused or errored; that candidate alone was rolled back
 *
 * Why an RPC and not INSERT … ON CONFLICT (candidate_id) DO NOTHING: since the
 * one-open-row-per-document index, a candidate whose document is already open
 * under another id raised 23505, which failed the ENTIRE statement and filed
 * nothing — one duplicate discarding every unrelated candidate.
 *
 * ─── PARTIAL SUCCESS, NOT ALL-OR-NOTHING ─────────────────────────────────────
 * This script used to be all-or-nothing per run (one INSERT statement). It is
 * no longer, deliberately. The RPC is one transaction with each candidate in
 * its own subtransaction:
 *   - a candidate that fails — validation, its queue row, or its evidence row —
 *     is rolled back entirely and reported 'failed'; the exit code is 1;
 *   - every other candidate's row and evidence COMMIT;
 *   - if the call itself fails (network, missing function), NOTHING is written.
 *
 * Run identity: the run id is derived from the candidates file itself
 * (generatedAt + content hash). Re-running the SAME file is a RETRY of the
 * same run, not a new discovery run: failed candidates are attempted again,
 * and everything already committed comes back 'existing' with no new row and
 * no new evidence. A new sync-providers report is a new run.
 *
 * ─── DOCUMENT KEYS ───────────────────────────────────────────────────────────
 * `primary_url` is the href exactly as discovered (versions[0].url). The
 * candidate's own `primaryUrl` is the LOOSE match key (lowercased; it also
 * feeds the candidate id) and `sourceUrlKey` is the CONSERVATIVE identity key
 * (documentIdentityKey; path and query case preserved). The database
 * re-derives both and refuses the candidate if either disagrees.
 *
 * Three cases are reported explicitly, never folded into a plain count:
 *   - POSSIBLE_SAME_DOCUMENT candidates (a loose-only match with a catalogue
 *     link): staged for document comparison, naming the entry and the reason.
 *     Never approvable as a new entry.
 *   - matches against rows filed BEFORE the migration, whose stored URL was
 *     already lowercased: the database can only match them by the loose key,
 *     so they are reported as "pre-migration row, original case unknown" —
 *     not as exact matches. The sighting is still recorded.
 *   - candidate-id collisions (two different documents, one id, because ids
 *     come from the loose key): the second document is filed under a derived
 *     id `<id>~<hash>` and reported as a collision — never merged into the
 *     first, and its sighting is never dropped.
 *
 * ─── DEPLOYMENT ORDER ────────────────────────────────────────────────────────
 * Requires supabase/migrations/20261024_discovery_review_queue.sql. Against a
 * database without it, the RPC call fails and nothing is written (exit 1). The
 * old version of this script against a database WITH it fails its whole batch
 * on the first already-open document. Apply the migration, then deploy this
 * script, with no staging run (workflow dispatch or local) in between. Full
 * order and rollback limits: the migration header.
 *
 * Run locally:  npx tsx scripts/stage-candidates.ts
 *               (reads ./candidates.json; needs SUPABASE_URL +
 *                SUPABASE_SERVICE_ROLE_KEY, or the VITE_ equivalents)
 * Dry run:      DRY_RUN=true npx tsx scripts/stage-candidates.ts
 *
 * Provider ownership: only providers whose staging owner is sync-providers
 * (scripts/lib/staging-ownership.ts) are submitted. Others are listed as
 * not-owner; a provider with no owner is listed as unowned and fails the run.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CANDIDATE_SCHEMA_VERSION, documentIdentityKey, type IngestionCandidate } from './lib/ingestion';
import { checkOwnership } from './lib/staging-ownership';

// Local convenience only; in CI these arrive as real environment variables and
// dotenv finds no file to load. .env.local first, matching scripts/seed.ts.
config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Verification mode. Same contract as scripts/detect-changes.ts: the workflow
 * passes `inputs.dry_run`, which does not exist on the schedule trigger and so
 * arrives empty — treated as false, so scheduled runs file candidates as
 * intended. Only a manual dispatch can set it true.
 */
const DRY_RUN = /^true$/i.test(process.env.DRY_RUN ?? '');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), 'candidates.json');

/** One candidate as stage_sync_candidates() reads it. */
interface StagePayload {
  candidateId: string;
  schemaVersion: number;
  pipeline: string;
  provider: string;
  providerName: string;
  topic: string;
  summary: string | null;
  notes: string | null;
  /** Verbatim hrefs; versions[0].url becomes primary_url. */
  versions: IngestionCandidate['versions'];
  /** LOOSE match key of versions[0].url (also the candidate-id input). Checked by the database. */
  primaryUrl: string;
  /** CONSERVATIVE identity key of versions[0].url. Checked by the database. */
  sourceUrlKey: string;
  /** POSSIBLE_SAME_DOCUMENT only: the matched entry and reason. Verified by the database. */
  documentComparison: IngestionCandidate['documentComparison'] | null;
  changeReason: string;
  discoveredAt: string;
  providerRef: string | null;
  matchedGuidelineId: string | null;
  // reviewStatus is deliberately omitted: new rows are always 'pending', and
  // nothing here may set the status of an existing row.
}

function toPayload(c: IngestionCandidate): StagePayload {
  return {
    candidateId: c.candidateId,
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    pipeline: c.pipeline,
    provider: c.provider,
    providerName: c.providerName,
    topic: c.topic,
    summary: c.summary ?? null,
    notes: c.notes ?? null,
    versions: c.versions,
    primaryUrl: c.primaryUrl,
    sourceUrlKey: documentIdentityKey(c.versions[0]?.url ?? ''),
    changeReason: c.changeReason,
    discoveredAt: c.discoveredAt,
    providerRef: c.providerRef ?? null,
    matchedGuidelineId: c.matchedGuidelineId ?? null,
    documentComparison: c.documentComparison ?? null,
  };
}

/** One element of stage_sync_candidates()'s result, in input order. */
interface StageOutcome {
  candidateId: string | null;
  status: 'staged' | 'existing' | 'already_open' | 'held' | 'failed';
  evidence: 'appended' | 'already_recorded' | 'none';
  stagedId?: string;
  reviewStatus?: string;
  heldByCandidateId?: string | null;
  heldByProducer?: string | null;
  heldByStatus?: string | null;
  holdStatus?: string;
  code?: string;
  message?: string;
  /** 'identity' = exact; 'legacy-match-key' = pre-migration row, original case unknown. */
  identityBasis?: 'identity' | 'legacy-match-key';
  /** Set when the requested id already named a different document. */
  candidateIdCollision?: { requestedId: string; filedAs: string };
}

interface CandidatesFile {
  schemaVersion?: number;
  generatedAt?: string;
  totalCandidates?: number;
  reports?: Array<{
    adapter: string;
    provider: string;
    error?: string;
    candidates?: IngestionCandidate[];
    /** @deprecated Pre-contract shape. Counted for reporting, never staged. */
    newCandidates?: unknown[];
  }>;
}

function readCandidates(): { candidates: IngestionCandidate[]; runId: string } {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[Stage] No candidates file at ${INPUT_PATH}. Run scripts/sync-providers.ts first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
  const payload = JSON.parse(raw) as CandidatesFile;

  // Evidence is recorded once per (queue row, run). The run id is derived from
  // the file itself, so re-staging the same candidates.json (a retried job)
  // appends nothing twice, while next week's sweep is a new run.
  const runId = `sync-providers:${payload.generatedAt ?? 'undated'}:`
    + createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);

  // A schema bump means the column mapping below may no longer be right. Fail
  // rather than write rows shaped by guesswork into a clinical review queue.
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== CANDIDATE_SCHEMA_VERSION) {
    console.error(
      `[Stage] candidates.json is schema v${payload.schemaVersion}, but this script stages `
      + `v${CANDIDATE_SCHEMA_VERSION}. Nothing was written. Regenerate the file with `
      + '`npx tsx scripts/sync-providers.ts` (the workflow does this in the same job) and stage that.',
    );
    process.exit(1);
  }

  const reports = payload.reports ?? [];
  const failed = reports.filter(r => r.error);
  const out: IngestionCandidate[] = [];

  for (const report of reports) {
    // An adapter that threw has no candidates to file. Counted and reported,
    // never treated as "this provider published nothing this week" — that
    // distinction is the whole reason sync-providers.ts records the error.
    if (report.error) continue;
    out.push(...(report.candidates ?? []));
  }

  console.log(`[Stage] Read ${out.length} candidate(s) from ${reports.length} adapter report(s).`);
  if (failed.length > 0) {
    console.warn(
      `[Stage] ${failed.length} adapter(s) FAILED during discovery and contributed nothing: `
      + failed.map(r => `${r.adapter} (${r.error})`).join('; '),
    );
  }

  // The legacy `newCandidates` array is deliberately NOT staged. Those records
  // predate the ingestion contract and carry no candidateId, so there would be
  // nothing to deduplicate on and every run would file them again as new rows.
  //
  // Said out loud because the alternative is a run that reports "0 candidates"
  // over a file holding 25 discoveries, which reads identically to a week when
  // the providers published nothing. The fix is to regenerate the file with
  // sync-providers.ts, which emits both shapes.
  const legacyOnly = reports.filter(
    r => !r.error && (r.candidates ?? []).length === 0 && (r.newCandidates ?? []).length > 0,
  );
  if (legacyOnly.length > 0) {
    const total = legacyOnly.reduce((n, r) => n + (r.newCandidates ?? []).length, 0);
    console.warn(
      `[Stage] SKIPPED ${total} item(s) across ${legacyOnly.length} adapter report(s) that carry only the `
      + 'legacy `newCandidates` shape and no structured `candidates`. These have no candidate id, so they '
      + 'cannot be staged idempotently. Re-run scripts/sync-providers.ts to regenerate candidates.json.',
    );
  }

  // Deterministic ids mean one run can legitimately rediscover the same URL
  // from two adapters: those exact repeats are collapsed. Collapse ONLY when the
  // document is also the same — the id comes from the LOOSE match key, so two
  // case-distinct documents can share one id. Those are both submitted; the
  // database files the second under a derived id and reports the collision.
  const seen = new Map<string, string>();
  let collisions = 0;
  const deduped = out.filter(c => {
    const identity = documentIdentityKey(c.versions[0]?.url ?? '');
    const prior = seen.get(c.candidateId);
    if (prior === undefined) {
      seen.set(c.candidateId, identity);
      return true;
    }
    if (prior === identity) return false;
    collisions++;
    return true;
  });
  const collapsed = out.length - deduped.length;
  if (collapsed > 0) {
    console.log(`[Stage] Collapsed ${collapsed} duplicate candidate id(s) within this run (same document).`);
  }
  if (collisions > 0) {
    console.warn(
      `[Stage] ${collisions} candidate(s) share a candidate id with a DIFFERENT document in this run `
      + '(case-distinct URLs). Both submitted; the database files each separately and reports the collision.',
    );
  }

  return { candidates: deduped, runId };
}

/** Counts by outcome. Every input candidate lands in exactly one bucket. */
function tallyOutcomes(outcomes: StageOutcome[]): Record<StageOutcome['status'], number> {
  const t = { staged: 0, existing: 0, already_open: 0, held: 0, failed: 0 };
  // An unrecognised status is counted as a failure, never silently dropped.
  for (const o of outcomes) t[o.status in t ? o.status : 'failed']++;
  return t;
}

async function main() {
  console.log('=== Stage candidates into staged_guidelines ===');
  console.log(DRY_RUN ? 'MODE: DRY RUN — no database writes.\n' : 'MODE: LIVE — new candidates will be filed.\n');

  const { candidates: read, runId } = readCandidates();

  // One staging producer per provider (scripts/lib/staging-ownership.ts).
  // Never silently dropped: every candidate not submitted is listed with why.
  // A provider owned by discovery is expected and not an error; a provider
  // with NO owner fails the run (after the owned candidates are filed).
  const candidates: IngestionCandidate[] = [];
  let unowned = 0;
  const notSubmitted: string[] = [];
  for (const c of read) {
    const own = checkOwnership(c.provider, 'sync-providers');
    if (own.ok) { candidates.push(c); continue; }
    if (own.status === 'unowned') unowned++;
    notSubmitted.push(`   ⊘ [${c.candidateId}] ${c.provider} — "${c.topic}": ${own.status}: ${own.message}`);
  }
  if (notSubmitted.length > 0) {
    console.warn(`[Stage] NOT submitted, ${notSubmitted.length} candidate(s) (provider ownership):`);
    notSubmitted.forEach(l => console.warn(l));
  }
  if (unowned > 0) {
    console.error(`[Stage] ${unowned} candidate(s) come from a provider with no staging owner. The run will exit 1.`);
    process.exitCode = 1;
  }

  if (candidates.length === 0) {
    console.log('[Stage] Nothing to file.');
    return;
  }

  const payload = candidates.map(toPayload);

  if (DRY_RUN) {
    // A dry run does not contact the database, so it cannot know which of these
    // are new, already queued, held, or blocked by an open row for the document.
    console.log(`[Stage] Would submit ${payload.length} candidate(s) as run ${runId}:`);
    payload.slice(0, 10).forEach(r => console.log(`   • [${r.candidateId}] ${r.provider} — "${r.topic}"`));
    if (payload.length > 10) console.log(`   … and ${payload.length - 10} more`);
    console.log('\n[Stage] Dry run complete. No writes performed; outcomes are decided by the database.');
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '[Stage] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n'
      + 'The service-role key is required: stage_sync_candidates() is executable by service_role only, '
      + 'and staged_guidelines has no INSERT policy for any client role.',
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // After this call, failures set process.exitCode and RETURN rather than
  // calling process.exit(): on Windows, Node 24 aborts with a libuv assertion
  // (UV_HANDLE_CLOSING, exit 0xC0000409/127 instead of 1) when exit() runs
  // while fetch's socket is still closing. Returning lets it close cleanly.
  //
  // ONE call for every candidate: a single transaction on the server, with
  // each candidate in its own subtransaction — PARTIAL SUCCESS: failed
  // candidates are rolled back alone and the rest commit. If the call itself
  // fails (network, missing function, bad run id) nothing at all is written.
  const { data, error } = await supabase.rpc('stage_sync_candidates', {
    p_run_id: runId,
    p_candidates: payload,
  });

  if (error) {
    console.error('[Stage] stage_sync_candidates failed; NOTHING was filed:', error.code ?? '', error.message,
      error.details ?? '', error.hint ?? '');
    process.exitCode = 1;
    return;
  }

  const outcomes = (data ?? []) as StageOutcome[];
  if (!Array.isArray(outcomes) || outcomes.length !== payload.length) {
    // The function returns one outcome per input, in order. Anything else
    // means the counts below would be guesses, so say so and fail.
    console.error(`[Stage] Expected ${payload.length} outcome(s), received ${Array.isArray(outcomes) ? outcomes.length : typeof outcomes}. Treating the run as failed.`);
    process.exitCode = 1;
    return;
  }

  const t = tallyOutcomes(outcomes);
  const appended = outcomes.filter(o => o.evidence === 'appended').length;
  console.log(`\n[Stage] Run ${runId}: ${payload.length} candidate(s) submitted. Re-running this same file retries only what failed.`);
  console.log(`   staged (new)   ${t.staged}`);
  console.log(`   existing       ${t.existing}   (already queued; editor decisions untouched)`);
  console.log(`   already open   ${t.already_open}   (another candidate holds this document's open slot)`);
  console.log(`   held           ${t.held}   (editorial staging hold)`);
  console.log(`   failed         ${t.failed}`);
  console.log(`   evidence rows appended: ${appended}`);
  const comparisons = outcomes.filter((o, i) => payload[i].changeReason === 'POSSIBLE_SAME_DOCUMENT' && o.status !== 'failed' && o.status !== 'held');
  const legacy = outcomes.filter(o => o.identityBasis === 'legacy-match-key');
  const collided = outcomes.filter(o => o.candidateIdCollision);
  console.log(`   require document comparison: ${comparisons.length}   (loose-only match with a catalogue entry; not approvable as new)`);
  console.log(`   pre-migration row, case unknown: ${legacy.length}   (matched by loose key only — NOT an exact match)`);
  console.log(`   candidate-id collisions: ${collided.length}   (different document, same id — filed separately, not merged)`);

  outcomes.forEach((o, i) => {
    const topic = payload[i].topic;
    const cmp = payload[i].documentComparison;
    if (cmp && o.status !== 'failed' && o.status !== 'held') {
      console.log(`   ≈ ${topic} — ${o.status}; compare with entry ${cmp.guidelineIds.join(', ')}: ${cmp.reason}`);
    }
    if (o.identityBasis === 'legacy-match-key') {
      console.log(`   ? ${topic} — ${o.status} via a pre-migration row matched by LOOSE key only; original URL case unknown, so this is not confirmed as the same document`);
    }
    if (o.candidateIdCollision) {
      console.log(`   ! ${topic} — candidate id ${o.candidateIdCollision.requestedId} already names a different document; filed as ${o.candidateIdCollision.filedAs}`);
    }
    if (o.status === 'staged') console.log(`   + ${topic}`);
    else if (o.status === 'already_open') {
      console.log(`   = ${topic} — open as ${o.heldByCandidateId ?? '?'} (${o.heldByProducer ?? 'unrecorded producer'}, ${o.heldByStatus ?? '?'})`);
    } else if (o.status === 'held') console.log(`   ‖ ${topic} — held (${o.holdStatus ?? '?'})`);
    else if (o.status !== 'existing') console.error(`   ✗ [${payload[i].candidateId}] ${topic} — ${o.code ?? ''} ${o.message ?? o.status}`);
  });

  if (t.staged > 0) {
    console.log('\n[Stage] New candidates are now visible to signed-in editors in Review Staged Guidelines.');
    console.log('[Stage] Nothing has been published — publishing is a human action via the app.');
  }

  if (t.failed > 0) {
    console.error(`\n[Stage] ${t.failed} candidate(s) FAILED and were not filed. The other outcomes above are COMMITTED. `
      + 'Re-run with the same file to retry the failures; nothing committed will be duplicated.');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('[Stage] Unexpected failure:', err);
  process.exitCode = 1;
});
