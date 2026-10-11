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
 * It writes nothing to `guidelines`. Publishing stays a human action, through
 * approve_staged_guideline() in the app.
 *
 * ─── INSERT-IF-ABSENT, NEVER OVERWRITE ──────────────────────────────────────
 * This is the load-bearing decision in this file, and the one thing not to
 * "simplify" later.
 *
 * `candidateId` is deterministic — same pipeline, provider, reason and URL
 * produce the same id every week (see makeCandidateId in lib/ingestion.ts). So
 * every scheduled run rediscovers all the same candidates, and the natural
 * `upsert` would rewrite each existing row back to `review_status = 'pending'`.
 *
 * That would silently undo editorial work: a candidate an editor had reviewed
 * and REJECTED as out of scope would reappear in the queue the following
 * Sunday, as if it had never been looked at, and an ACCEPTED one would return
 * alongside the guideline it had already become. The reviewer would have no way
 * to tell a genuinely new find from one they had already judged.
 *
 * So the write is ON CONFLICT DO NOTHING (`ignoreDuplicates: true`). New
 * candidates are added; rows that already exist are left exactly as the editor
 * left them. The cost is that a provider silently editing a title under the
 * same URL will not refresh an existing queue row — the right fix for that is a
 * CONTENT_DRIFT candidate with its own id, which is what change detection is
 * for, not a blind overwrite here.
 *
 * Run locally:  npx tsx scripts/stage-candidates.ts
 *               (reads ./candidates.json; needs SUPABASE_URL +
 *                SUPABASE_SERVICE_ROLE_KEY, or the VITE_ equivalents)
 * Dry run:      DRY_RUN=true npx tsx scripts/stage-candidates.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { CANDIDATE_SCHEMA_VERSION, type IngestionCandidate } from './lib/ingestion';

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

/** One row of public.staged_guidelines, as written here. */
interface StagedRow {
  candidate_id: string;
  schema_version: number;
  pipeline: string;
  provider: string;
  provider_name: string;
  topic: string;
  source: string;
  summary: string | null;
  notes: string | null;
  versions: IngestionCandidate['versions'];
  primary_url: string;
  change_reason: string;
  discovered_at: string;
  provider_ref: string | null;
  matched_guideline_id: string | null;
  // review_status is deliberately omitted: the column defaults to 'pending',
  // and naming it here would be the first step towards overwriting it.
}

function toStagedRow(c: IngestionCandidate): StagedRow {
  return {
    candidate_id: c.candidateId,
    schema_version: CANDIDATE_SCHEMA_VERSION,
    pipeline: c.pipeline,
    provider: c.provider,
    provider_name: c.providerName,
    topic: c.topic,
    // The short publisher tag, matching what the catalogue's own `source`
    // column holds (e.g. 'BOA'). provider_name carries the full title; the
    // dashboard prefers that and falls back to this.
    source: c.provider,
    summary: c.summary ?? null,
    notes: c.notes ?? null,
    versions: c.versions,
    primary_url: c.primaryUrl,
    change_reason: c.changeReason,
    discovered_at: c.discoveredAt,
    provider_ref: c.providerRef ?? null,
    matched_guideline_id: c.matchedGuidelineId ?? null,
  };
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

function readCandidates(): IngestionCandidate[] {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[Stage] No candidates file at ${INPUT_PATH}. Run scripts/sync-providers.ts first.`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8')) as CandidatesFile;

  // A schema bump means the column mapping below may no longer be right. Fail
  // rather than write rows shaped by guesswork into a clinical review queue.
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== CANDIDATE_SCHEMA_VERSION) {
    console.error(
      `[Stage] candidates.json is schema v${payload.schemaVersion}, but this script writes `
      + `v${CANDIDATE_SCHEMA_VERSION}. Update toStagedRow() before staging it.`,
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
  // from two adapters; the unique constraint would reject the whole batch.
  const seen = new Set<string>();
  const deduped = out.filter(c => {
    if (seen.has(c.candidateId)) return false;
    seen.add(c.candidateId);
    return true;
  });
  if (deduped.length !== out.length) {
    console.log(`[Stage] Collapsed ${out.length - deduped.length} duplicate candidate id(s) within this run.`);
  }

  return deduped;
}

async function main() {
  console.log('=== Stage candidates into staged_guidelines ===');
  console.log(DRY_RUN ? 'MODE: DRY RUN — no database writes.\n' : 'MODE: LIVE — new candidates will be filed.\n');

  const candidates = readCandidates();

  if (candidates.length === 0) {
    console.log('[Stage] Nothing to file. Exiting cleanly.');
    return;
  }

  const rows = candidates.map(toStagedRow);

  if (DRY_RUN) {
    console.log(`[Stage] Would file ${rows.length} candidate(s):`);
    rows.slice(0, 10).forEach(r => console.log(`   • [${r.candidate_id}] ${r.provider} — "${r.topic}"`));
    if (rows.length > 10) console.log(`   … and ${rows.length - 10} more`);
    console.log('\n[Stage] Dry run complete. No writes performed.');
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '[Stage] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n'
      + 'The service-role key is required: staged_guidelines has no INSERT policy, so an anon '
      + 'or editor client cannot write to it by design.',
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ON CONFLICT DO NOTHING on candidate_id — see the header comment. `select`
  // returns only the rows actually inserted, which is what makes "3 new this
  // week" reportable rather than guessed at.
  const { data, error } = await supabase
    .from('staged_guidelines')
    .upsert(rows, { onConflict: 'candidate_id', ignoreDuplicates: true })
    .select('candidate_id, topic');

  if (error) {
    console.error('[Stage] Insert failed:', error.message, error.details ?? '', error.hint ?? '');
    process.exit(1);
  }

  const inserted = data ?? [];
  console.log(`\n[Stage] Filed ${inserted.length} NEW candidate(s); ${rows.length - inserted.length} already in the queue (left untouched).`);
  inserted.forEach(r => console.log(`   + ${r.topic}`));

  if (inserted.length > 0) {
    console.log('\n[Stage] These are now visible to signed-in editors in Review Staged Guidelines.');
    console.log('[Stage] Nothing has been published — publishing is a human action via the app.');
  }
}

main().catch(err => {
  console.error('[Stage] Unexpected failure:', err);
  process.exit(1);
});
