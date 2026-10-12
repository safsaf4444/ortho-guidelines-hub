/**
 * Stage 1 of the changed-guidance pipeline: offline assertions.
 *
 * These are SOURCE and UNIT assertions. The behaviour of the staging RPC, the
 * supersession rules, the concurrency guards and the approval block are
 * database-level and are verified by executing them against a disposable
 * Postgres stack, not here — see the PR for that evidence. What this file
 * guards is that the invariants those tests rely on cannot be edited out of
 * the migration or the detector without a test failing.
 */
import { readFileSync } from 'node:fs';
import { makeRevisionCandidateId, makeCandidateId } from '../lib/ingestion.js';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] makeRevisionCandidateId: identity IS the content state');

const base = {
  guidelineId: 'girft-bunions',
  changedUrl: 'https://example.invalid/doc',
  observedHash: 'aaaaaaaaaaaa',
  provider: 'GIRFT',
};

check('deterministic across calls',
  makeRevisionCandidateId(base) === makeRevisionCandidateId(base));

check('a different observed hash is a DIFFERENT candidate',
  makeRevisionCandidateId(base) !== makeRevisionCandidateId({ ...base, observedHash: 'bbbbbbbbbbbb' }),
  'otherwise a genuinely newer change would be dropped by ON CONFLICT DO NOTHING');

check('the same URL tracked by a different guideline is a DIFFERENT candidate',
  makeRevisionCandidateId(base) !== makeRevisionCandidateId({ ...base, guidelineId: 'boa-bunions' }),
  'cross-listed URLs would otherwise collide and one entry would lose its candidate');

check('a different URL is a different candidate',
  makeRevisionCandidateId(base) !== makeRevisionCandidateId({ ...base, changedUrl: 'https://example.invalid/other' }));

check('provider label differences that are only case or punctuation do not change it',
  makeRevisionCandidateId(base) === makeRevisionCandidateId({ ...base, provider: 'g.i.r.f.t.' }),
  'reuses canonicalProviderKey, like makeCandidateId');

check('it carries no timestamp, so a retried run computes the same id',
  makeRevisionCandidateId(base) === makeRevisionCandidateId({ ...base }));

check('it is NOT the same id as the new-guideline helper for the same url',
  makeRevisionCandidateId(base) !== makeCandidateId({
    pipeline: 'sync-providers',
    provider: 'GIRFT',
    changeReason: 'CONTENT_DRIFT',
    primaryUrl: base.changedUrl,
  }),
  'makeCandidateId excludes content, which is exactly why revisions need their own helper');

check('the readable prefix names the provider and the reason',
  /^girft-content-drift-[0-9a-f]{12}$/.test(makeRevisionCandidateId(base)),
  makeRevisionCandidateId(base));

console.log('\n[2] The detector holds back the baseline when staging fails');

const det = readFileSync('scripts/detect-changes.ts', 'utf8');

check('the baseline advance is gated on a flag, not unconditional',
  det.includes('let mayAdvance = true;') && det.includes('if (mayAdvance) {'),
  'the previous code ran newHashes[url] = newHash on every success path');
check('a failed queue write clears that flag',
  /if \(queued\) \{[\s\S]{0,120}staged\+\+;[\s\S]{0,200}mayAdvance = false;/.test(det),
  'otherwise the detection is lost: next run sees no difference');
check('the old unconditional assignment is gone',
  !det.includes('newHashes[url] = newHash;'));
check('dry-run advances nothing either',
  /\[dry-run\] change detected[\s\S]{0,400}mayAdvance = false;/.test(det));
check('hashes are MERGED server-side, not written back as a whole object',
  det.includes("supabase.rpc('advance_content_hashes'") && det.includes('hashPatch'),
  'a whole-object write discards another writer’s hash for a different URL');
check('the whole-object update is gone',
  !det.includes('.update({ content_hashes: newHashes'));
check('a failed hash advance is reported and counted, not swallowed',
  det.includes('HASH ADVANCE FAILED') && /if \(advanceError\) \{[\s\S]{0,500}stagingFailures\+\+/.test(det));
check('partial failure makes the run exit non-zero',
  det.includes('process.exitCode = 1') && det.includes('is NOT a clean pass'));
check('evidence is made idempotent by a stable per-run id',
  det.includes('GITHUB_RUN_ID') && det.includes('p_run_id: RUN_ID'));

console.log('\n[3] GitHub issue behaviour is unchanged');

check('openIssue is still called on a detected change',
  det.includes('await openIssue(row, url, oldHash, newHash);'));
check('the queue write is separate from the issue, not a replacement',
  det.indexOf('await openIssue(row, url, oldHash, newHash);')
    < det.indexOf('const queued = await stageDetectedChange('),
  'the issue is opened first and independently');
check('the issue body builder was not touched',
  det.includes('async function openIssue(') && det.includes('pending-guideline-update'));

console.log('\n[4] The migration’s security invariants');

const mig = readFileSync('supabase/migrations/20261013_stage_detected_changes.sql', 'utf8');

check('the staging RPC is SECURITY INVOKER, not DEFINER',
  /create or replace function public\.stage_detected_change[\s\S]*?security invoker/.test(mig),
  'a DEFINER function would hand detector-write capability to whoever holds EXECUTE');
check('the hash-merge RPC is SECURITY INVOKER too',
  /create or replace function public\.advance_content_hashes[\s\S]*?security invoker/.test(mig));
check('EXECUTE on the staging RPC is revoked from authenticated',
  /revoke all on function public\.stage_detected_change\([^)]*\) from authenticated/.test(mig),
  'editors must not gain detector-write permissions');
check('EXECUTE on the staging RPC is revoked from public and anon',
  /revoke all on function public\.stage_detected_change\([^)]*\) from public/.test(mig)
  && /revoke all on function public\.stage_detected_change\([^)]*\) from anon/.test(mig));
check('EXECUTE on the staging RPC is granted to service_role only',
  /grant execute on function public\.stage_detected_change\([^)]*\) to service_role/.test(mig)
  && !/grant execute on function public\.stage_detected_change\([^)]*\) to authenticated/.test(mig));
check('the hash-merge RPC is equally restricted',
  /revoke all on function public\.advance_content_hashes\([^)]*\) from authenticated/.test(mig)
  && /grant execute on function public\.advance_content_hashes\([^)]*\) to service_role/.test(mig));
{
  // Scope to the statements that actually name staged_detections. A whole-file
  // negative lookahead spans unrelated policy statements and always matches.
  const detectionPolicies = mig
    .split(';')
    .filter(stmt => /create policy/i.test(stmt) && /public\.staged_detections/.test(stmt));
  check('staged_detections gets RLS and exactly one policy, SELECT-only',
    mig.includes('alter table public.staged_detections enable row level security')
    && detectionPolicies.length === 1
    && /for\s+select/i.test(detectionPolicies[0])
    && !/for\s+(insert|update|delete|all)/i.test(detectionPolicies[0]),
    `policies naming staged_detections: ${detectionPolicies.length}`);
}
check('the one-pending-revision slot is a partial unique index on real columns',
  /create unique index staged_guidelines_one_pending_revision\s+on public\.staged_guidelines \(matched_guideline_id, changed_url\)\s+where review_status = 'pending'/.test(mig),
  'not a JSON path: the invariant should be legible and indexable');
check('evidence is idempotent per run at the database layer',
  mig.includes('constraint staged_detections_run_once unique (staged_id, detection_run_id)'));
check('supersession records its own timestamp and never a reviewer',
  mig.includes('staged_guidelines_superseded_is_machine')
  && /review_status <> 'superseded'\s*\n\s*or \(superseded_at is not null and reviewed_by is null\)/.test(mig),
  'reviewed_at must not imply a human reviewed an automatic supersession');
check('a revision must name both the entry and the URL',
  mig.includes('staged_guidelines_revision_needs_target'));
check('the per-URL transition is serialised with a transaction advisory lock',
  mig.includes('pg_advisory_xact_lock('),
  'two concurrent runs must not interleave read-decide-write on the same URL');
// Queue locking orders the review slot but NOT the baseline write, which
// happens in a separate call after the loop. Without a per-key ordering guard
// an older run finishing late regresses content_hashes — demonstrated end to
// end against PostgREST before it was fixed.
check('the baseline write is ordered per key, not blindly merged',
  mig.includes('content_hash_seen_at')
  && /p_observed_at >= v_prev/.test(mig)
  && mig.includes('rejected_as_stale'),
  'an out-of-order run would otherwise drag a baseline backwards');
check('the baseline write is serialised per guideline as well',
  /pg_advisory_xact_lock\(hashtextextended\('guidelines:' \|\| p_guideline_id/.test(mig));
check('the unordered three-argument form is dropped, not left callable',
  /drop function if exists public\.advance_content_hashes\(text, jsonb, date\)/.test(mig));
check('last_change_check cannot move backwards either',
  /last_change_check\s*=\s*greatest\(/.test(mig));
check('the detector passes the observation time it actually used',
  det.includes('p_observed_at: latestObservedAt') && det.includes('let latestObservedAt'));
check('a stale-rejected hash is reported rather than silently dropped',
  det.includes('rejected_as_stale') && det.includes('rejected as stale'));
check('an older observation cannot displace a newer state',
  mig.includes('stale_observation_ignored')
  && /p_observed_at < v_pending\.state_observed_at/.test(mig));
check('the lock key uses a legal separator, not a NUL',
  mig.includes('chr(31)') && !/pg_advisory_xact_lock\([\s\S]{0,80}u0000/.test(mig),
  'PostgreSQL rejects a null character in text');
check('a human-decided state is never reopened by recurrence',
  mig.includes('decided_state_recurred'));
check('an automatically superseded state CAN be reclaimed',
  mig.includes("v_action := 'reclaimed'"));
check('the detector never emits an interpreted reason',
  mig.includes("'CONTENT_DRIFT', 'pending', p_observed_at")
  && !/p_change_reason/.test(mig),
  'REVISED/WITHDRAWN are editorial judgements a hash cannot supply');

console.log('\n[5] Revisions cannot use the new-entry approval path');

check('approve_staged_guideline refuses a non-NEW_GUIDELINE candidate',
  /if v_staged\.change_reason <> 'NEW_GUIDELINE' then[\s\S]{0,400}errcode = '42809'/.test(mig),
  'insert-only path would publish a duplicate entry under a second id');
check('the refusal is server-side, inside the DEFINER function',
  mig.indexOf("errcode = '42809'") > mig.indexOf('create or replace function public.approve_staged_guideline'),
  'UI gating alone is bypassed by a direct PostgREST caller');
{
  const approveStart = mig.indexOf('create or replace function public.approve_staged_guideline');
  const approveFn = approveStart < 0 ? '' : mig.slice(approveStart);
  check('the refusal comes AFTER the row lock and the pending test',
    approveFn.length > 0
    && approveFn.indexOf('for update') < approveFn.indexOf("review_status <> 'pending'")
    && approveFn.indexOf("review_status <> 'pending'") < approveFn.indexOf("change_reason <> 'NEW_GUIDELINE'"),
    'so error precedence is unchanged for existing callers');
}
check('the null-safe authorisation guard is preserved exactly',
  mig.includes('if public.is_editor() is not true then')
  && !mig.includes('if not public.is_editor() then'),
  'is_editor() returns NULL with no JWT; a bare `if not` falls through');
check('the approve function is still SECURITY DEFINER with a pinned search_path',
  /create or replace function public\.approve_staged_guideline[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/.test(mig));

console.log('\n[6] The review UI withholds the new-entry path for revisions');

const dash = readFileSync('src/components/ReviewDashboard.tsx', 'utf8');

check('a revision is identified by its matched guideline',
  dash.includes('const isRevision = Boolean(candidate.matchedGuidelineId);'));
check('Review & Edit is not rendered for a revision',
  /\{isRevision \? \([\s\S]{0,700}\) : \(\s*<button\s*\n\s*onClick=\{onEdit\}/.test(dash),
  'that path mints a new id and would publish a duplicate');
check('the card says why, rather than silently hiding the control',
  dash.includes('cannot be published as a new entry'));
check('the evidence panel names the affected entry and the changed URL',
  dash.includes('{candidate.matchedGuidelineId}') && dash.includes('{candidate.changedUrl}'));
check('the panel does not claim to say WHAT changed',
  dash.includes('not') && dash.includes('what changed or whether it matters'),
  'the detector compares hashes and stores no page text');
check('Reject remains available for revisions',
  dash.includes('canReject={Boolean(candidate.stagedId)}'));

console.log('\n──────────────');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
