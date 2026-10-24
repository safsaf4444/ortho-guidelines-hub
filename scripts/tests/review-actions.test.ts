/**
 * scripts/tests/review-actions.test.ts
 * ────────────────────────────────────
 * Offline tests for the review-queue dashboard rules:
 *   [1] the action matrix (src/lib/review-actions.ts), every type × status;
 *   [2] labels and wording (nothing implies publication);
 *   [3] schema-compat detection is narrow (src/lib/schema-compat.ts);
 *   [4] the publish path is guarded in the dashboard AND in App;
 *   [5] static checks on supabase/migrations/20261025_reject_open_candidate.sql.
 * Run: npx tsx scripts/tests/review-actions.test.ts   (or: npm run test:offline)
 */
import { readFileSync } from 'node:fs';
import {
  allowedActions,
  groupOpenRows,
  isCollisionFiledId,
  isOpenFollowUp,
  OPEN_FOLLOW_UP_OUTCOMES,
  outcomeLabel,
  RESOLVE_ACTION_META,
  type ResolveAction,
} from '../../src/lib/review-actions';
import {
  CANDIDATE_SCHEMA_VERSION as SRC_SCHEMA_VERSION,
  changeReasonLabel,
  type ChangeReason,
  type ReviewStatus,
} from '../../src/lib/candidates';
import {
  isFeatureUnavailable,
  isMissingSchemaObject,
  markFeatureUnavailable,
  QUEUE_UPGRADE_COLUMNS,
} from '../../src/lib/schema-compat';
import { classifyWriteFailure } from '../../src/lib/write-result';
import { CANDIDATE_SCHEMA_VERSION as SCRIPTS_SCHEMA_VERSION } from '../lib/ingestion';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const REASONS: ChangeReason[] = [
  'NEW_GUIDELINE', 'REVISED', 'WITHDRAWN', 'CONTENT_DRIFT', 'URL_MOVED', 'UNREACHABLE_LINK',
  'POSSIBLE_SAME_DOCUMENT', 'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED',
];
const STATUSES: ReviewStatus[] = ['pending', 'deferred', 'accepted', 'rejected', 'resolved'];
const OUTCOMES: (string | null)[] = [null, ...OPEN_FOLLOW_UP_OUTCOMES, 'same-document', 'no-action', 'acknowledged'];

// The database's resolve_discovery_candidate() mapping (20261024), restated:
// which actions each class accepts at all.
const DB_RESOLVE: Partial<Record<ChangeReason, ResolveAction[]>> = {
  POSSIBLE_SAME_DOCUMENT: ['same-document', 'different-document', 'defer'],
  POSSIBLE_NEW_EDITION: ['same-document', 'no-action', 'different-document', 'new-edition', 'defer'],
  EDITION_TOKEN_CHANGED: ['acknowledged', 'needs-document-check', 'defer'],
};

console.log('\n[1] Action matrix — every type × status × outcome');
for (const r of REASONS) {
  for (const st of STATUSES) {
    for (const o of OUTCOMES) {
      const a = allowedActions(r, st, o);
      const open = st === 'pending' || st === 'deferred';
      const tag = `${r}/${st}/${o ?? '-'}`;
      if (!open) {
        if (a.publish || a.reject || a.resolve.length > 0) check(`closed row offers nothing: ${tag}`, false, JSON.stringify(a));
        continue;
      }
      if (a.publish !== (r === 'NEW_GUIDELINE' && st === 'pending')) check(`publish only for NEW_GUIDELINE pending: ${tag}`, false);
      if (!a.reject) check(`every open row can be rejected: ${tag}`, false);
      if (a.rejectNeedsConfirmation !== isOpenFollowUp(o)) check(`confirmation iff open follow-up: ${tag}`, false);
      const dbAllowed = DB_RESOLVE[r] ?? [];
      if (!a.resolve.every((x) => dbAllowed.includes(x))) check(`resolve offers only DB-valid actions: ${tag}`, false, JSON.stringify(a.resolve));
      if (st === 'deferred' && a.resolve.includes('defer')) check(`deferred row is not offered defer: ${tag}`, false);
    }
  }
}
check('matrix sweep completed with no violations above', true);
for (const r of ['POSSIBLE_SAME_DOCUMENT', 'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED'] as ChangeReason[]) {
  check(`${r}: NEVER offered new-entry publication, in any status or outcome`,
    STATUSES.every((st) => OUTCOMES.every((o) => !allowedActions(r, st, o).publish)));
}
check('deferred NEW_GUIDELINE is not publishable (approve needs pending)', !allowedActions('NEW_GUIDELINE', 'deferred').publish);
check('a held pending NEW_GUIDELINE is not publishable (approval refuses it, RQ002)', !allowedActions('NEW_GUIDELINE', 'pending', null, true).publish);
check('…but it can still be rejected', allowedActions('NEW_GUIDELINE', 'pending', null, true).reject);
eq('a held comparison row keeps its decisions', allowedActions('POSSIBLE_SAME_DOCUMENT', 'pending', null, true).resolve, ['same-document', 'different-document', 'defer']);
check('not held: unchanged (publishable)', allowedActions('NEW_GUIDELINE', 'pending', null, false).publish);
eq('POSSIBLE_SAME_DOCUMENT pending: resolve actions', allowedActions('POSSIBLE_SAME_DOCUMENT', 'pending').resolve, ['same-document', 'different-document', 'defer']);
eq('…with an awaiting-refiling follow-up, different-document is not re-offered', allowedActions('POSSIBLE_SAME_DOCUMENT', 'pending', 'different-document-awaiting-refiling').resolve, ['same-document', 'defer']);
eq('EDITION_TOKEN_CHANGED deferred: acknowledged + needs-document-check', allowedActions('EDITION_TOKEN_CHANGED', 'deferred').resolve, ['acknowledged', 'needs-document-check']);
eq('NEW_GUIDELINE has no resolve actions', allowedActions('NEW_GUIDELINE', 'pending').resolve, []);
eq('reserved classes (e.g. CONTENT_DRIFT) can be rejected but not published or resolved',
  allowedActions('CONTENT_DRIFT', 'pending'), { publish: false, reject: true, rejectNeedsConfirmation: false, resolve: [] });
eq('groupOpenRows keeps order and splits by status',
  groupOpenRows([{ reviewStatus: 'deferred' as ReviewStatus, k: 1 }, { reviewStatus: 'pending' as ReviewStatus, k: 2 }, { reviewStatus: 'deferred' as ReviewStatus, k: 3 }]),
  { pending: [{ reviewStatus: 'pending', k: 2 }], deferred: [{ reviewStatus: 'deferred', k: 1 }, { reviewStatus: 'deferred', k: 3 }] });
check('collision-filed ids are recognised', isCollisionFiledId('bsg-new-guideline-0123456789ab~3d956928c295') && !isCollisionFiledId('bsg-new-guideline-0123456789ab'));

console.log('\n[2] Labels and wording');
for (const r of REASONS) check(`${r} has its own label (not the raw value)`, changeReasonLabel(r) !== r, changeReasonLabel(r));
for (const [a, m] of Object.entries(RESOLVE_ACTION_META)) {
  check(`"${a}" says nothing is published`, /nothing is published/i.test(m.effect), m.effect);
  check(`"${a}" ${m.closes ? 'says it closes' : 'says it stays open'}`, m.closes ? /Closes/.test(m.effect) : /STAYS OPEN|stays open/.test(m.effect));
}
for (const o of OPEN_FOLLOW_UP_OUTCOMES) check(`open outcome ${o} is labelled as an open follow-up`, /Open follow-up/.test(outcomeLabel(o) ?? ''));
eq('dashboard and scripts agree on the candidate-file schema version', SRC_SCHEMA_VERSION, SCRIPTS_SCHEMA_VERSION);

console.log('\n[3] schema-compat is narrow');
check('missing upgrade column → unavailable', isMissingSchemaObject({ code: '42703', message: 'column staged_guidelines.review_outcome does not exist' }, 'column', QUEUE_UPGRADE_COLUMNS));
check('a DIFFERENT missing column is NOT treated as the upgrade gap', !isMissingSchemaObject({ code: '42703', message: 'column staged_guidelines.typo_col does not exist' }, 'column', QUEUE_UPGRADE_COLUMNS));
check('missing reject function (PGRST202) → unavailable', isMissingSchemaObject({ code: 'PGRST202', message: 'Could not find the function public.reject_staged_candidate(p_candidate_id, p_confirm_open_follow_up, p_reason) in the schema cache' }, 'function', ['reject_staged_candidate']));
check('a different missing function is NOT', !isMissingSchemaObject({ code: 'PGRST202', message: 'Could not find the function public.other_fn' }, 'function', ['reject_staged_candidate']));
check('permission denied (42501) is NOT a compatibility gap', !isMissingSchemaObject({ code: '42501', message: 'permission denied for function reject_staged_candidate' }, 'function', ['reject_staged_candidate']));
check('a network failure (no code) is NOT a compatibility gap', !isMissingSchemaObject({ message: 'TypeError: Failed to fetch' }, 'table', ['staged_discovery_evidence']));
const un = markFeatureUnavailable(new Error('x'));
check('feature-unavailable is a confirmed refusal (nothing written), not "unconfirmed"', isFeatureUnavailable(un) && classifyWriteFailure(un) === 'refused');

console.log('\n[4] The publish path is guarded twice');
const dash = readFileSync('src/components/ReviewDashboard.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const svc = readFileSync('src/lib/staged-service.ts', 'utf8');
check('the dashboard renders "Review & publish" only under canPublish', /\{canPublish && \(\s*<button\s*onClick=\{onEdit\}/.test(dash));
check('canPublish comes from the shared matrix, with the hold', /canPublish=\{actions\.publish\}/.test(dash) && /allowedActions\(candidate\.changeReason, candidate\.reviewStatus, candidate\.reviewOutcome, candidate\.hold != null\)/.test(dash));
check('the dashboard never calls approve itself', !/stagedService\.approve/.test(dash));
const reviewHandler = /const handleReviewCandidate = \(candidate: DisplayCandidate\) => \{[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('App refuses to open the publish form unless the matrix (with the hold) allows publish',
  /allowedActions\(candidate\.changeReason, candidate\.reviewStatus, candidate\.reviewOutcome, candidate\.hold != null\)\.publish/.test(reviewHandler)
  && reviewHandler.indexOf('.publish') < reviewHandler.indexOf('setEditingGuideline'), reviewHandler.slice(0, 200));
check('the queue loads pending AND deferred', /\.in\('review_status', \['pending', 'deferred'\]\)/.test(svc));
check('a missing upgrade column is reported as unavailable, not as an empty queue', /reason: 'unavailable', message: QUEUE_UPGRADE_UNAVAILABLE_MESSAGE/.test(svc));
check('the queue view distinguishes empty from unavailable', /Review queue feature unavailable/.test(dash) && /has no open items/.test(dash));
check('a resolution is never described as publishing', /Nothing was published/.test(dash) && !/was published\b(?! and)/.test(dash.replace(/Nothing was published/g, '')));
check('approve maps 42809 to a refusal that says nothing was changed', /error\.code === '42809'[^]*?Nothing was changed/.test(svc));

console.log('\n[5] 20261025_reject_open_candidate.sql');
const sql = readFileSync('supabase/migrations/20261025_reject_open_candidate.sql', 'utf8');
const fn = /create or replace function public\.reject_staged_candidate[^]*?\n\$\$;/.exec(sql)?.[0] ?? '';
check('function body located', fn.length > 0);
check('SECURITY DEFINER with a pinned search_path', /security definer\s*\n\s*set search_path = public, pg_temp/.test(fn));
check('null-safe editor check', /if public\.is_editor\(\) is not true then/.test(fn) && !/if not public\.is_editor\(\) then/.test(fn));
check('whitespace-aware reason check', fn.includes("p_reason !~ '\\S'"));
const lockAt = fn.indexOf('for update');
const stateAt = fn.indexOf("review_status not in ('pending', 'deferred')");
check('locks the row BEFORE testing state', lockAt > 0 && stateAt > lockAt);
check('accepts pending OR deferred, refuses others with 55000', /review_status not in \('pending', 'deferred'\)[^]*?errcode = '55000'/.test(fn));
check('an open follow-up needs explicit confirmation (RQ001)', /p_confirm_open_follow_up is not true[^]*?errcode = 'RQ001'/.test(fn)
  && OPEN_FOLLOW_UP_OUTCOMES.every((o) => fn.includes(`'${o}'`)));
check('records actor, time, reason, previous status and outcome in the decision log',
  /insert into public\.staged_discovery_decisions\s*\(staged_id, action, from_status, to_status, from_outcome, note, decided_by\)/.test(fn)
  && /'reject', v_staged\.review_status, 'rejected', v_staged\.review_outcome/.test(fn) && /auth\.uid\(\)\);/.test(fn));
check('reviewer, time and reason recorded on the row', /review_status  = 'rejected'/.test(fn) && /reviewed_by    = auth\.uid\(\)/.test(fn) && /reviewed_at    = now\(\)/.test(fn));
check('never touches guidelines or guideline_changelog', !/public\.guidelines\b/.test(fn) && !/guideline_changelog/.test(fn));
check('EXECUTE: revoked from public and anon, granted to authenticated',
  /revoke all on function public\.reject_staged_candidate\(uuid, text, boolean\) from public;/.test(sql)
  && /revoke all on function public\.reject_staged_candidate\(uuid, text, boolean\) from anon;/.test(sql)
  && /grant execute on function public\.reject_staged_candidate\(uuid, text, boolean\) to authenticated;/.test(sql));
check('the old two-argument function is dropped (one definition only)', /drop function if exists public\.reject_staged_candidate\(uuid, text\);/.test(sql));
check('refuses to run without 20261024', /20261024_discovery_review_queue\.sql is not applied/.test(sql));
check('adds no policy', !/create policy/.test(sql));

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
