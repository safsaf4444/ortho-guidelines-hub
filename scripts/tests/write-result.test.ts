/**
 * scripts/tests/write-result.test.ts
 * ──────────────────────────────────
 * Offline tests for the "did that write actually change anything?" decision,
 * and for the save path's confirm-before-display ordering.
 *
 * ── THE BUG THIS GUARDS ─────────────────────────────────────────────────────
 * A blocked INSERT returns PostgREST error 42501. A blocked UPDATE returns
 * NOTHING: Row Level Security filters the row out of the statement's scope, so
 * the update succeeds against zero rows with no error at all.
 *
 * Combined with an optimistic UI, that produced the worst available outcome —
 * an editor's clinical change rendered as saved while the database had
 * discarded it. Two things fix it, and both are asserted here: count the
 * affected rows, and do not show the change until the write is confirmed.
 *
 * Run:   npx tsx scripts/tests/write-result.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync } from 'node:fs';
import {
  ALREADY_PROCESSED_CODE,
  UNCONFIRMED_SAVE_MESSAGE,
  classifyWriteFailure,
  describeMergeProgress,
  isAlreadyProcessedWrite,
  isZeroRowWrite,
  markAlreadyProcessed,
  markRefused,
  refusedOrMissingMessage,
} from '../../src/lib/write-result';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

console.log('\n[1] isZeroRowWrite — a refused UPDATE is indistinguishable from success without this');

// What PostgREST returns for an UPDATE that RLS filtered out: success, no error,
// and an empty array. This is the refusal case.
check('an empty array is a zero-row write (RLS refusal)', isZeroRowWrite([]));
// No body at all. The caller cannot prove anything changed, which for a write
// is the same problem as proving nothing did.
check('null is a zero-row write', isZeroRowWrite(null));
check('undefined is a zero-row write', isZeroRowWrite(undefined));

// The success case must not be mistaken for a refusal, or every save would
// report a false failure.
check('one returned row is a real write', !isZeroRowWrite([{ id: 'girft-bunions' }]));
check('several returned rows are a real write', !isZeroRowWrite([{ id: 'a' }, { id: 'b' }]));

console.log('\n[2] refusedOrMissingMessage — names both causes, because the client cannot tell them apart');

const msg = refusedOrMissingMessage('update', 'girft-bunions');
check('names the operation', msg.includes('update'));
check('names the row', msg.includes('girft-bunions'));
check('offers the allowlist/session cause', /allowlist|session/i.test(msg));
check('offers the missing-row cause', /no longer exists/i.test(msg));
// The single most important sentence: the editor must know their work is gone.
check('states plainly that nothing was saved', /nothing was saved/i.test(msg));

console.log('\n[2b] classifyWriteFailure — a refusal is evidence; silence is not');

// Server answered: Postgres SQLSTATEs and PostgREST codes are decisions.
for (const code of ['42501', '23505', '23514', '23502', 'PGRST205']) {
  check(`code ${code} is a confirmed refusal`, classifyWriteFailure({ code }) === 'refused');
}
check('an explicitly marked error is a refusal', classifyWriteFailure(markRefused(new Error('zero rows'))) === 'refused');
check('markRefused returns the same error object', (() => {
  const e = new Error('x');
  return markRefused(e) === e;
})());

// No answer. supabase-js wraps a dropped connection in an error object too,
// but with an EMPTY code — which is why a bare error must never be read as a
// refusal. The committed-then-lost case lives entirely in here.
check('an empty code is NOT a refusal', classifyWriteFailure({ code: '' }) === 'unconfirmed');
check('a missing code is NOT a refusal', classifyWriteFailure({ message: 'boom' }) === 'unconfirmed');
check('a fetch failure is NOT a refusal', classifyWriteFailure({ code: '', message: 'FetchError: Failed to fetch' }) === 'unconfirmed');
check('a TypeError is NOT a refusal', classifyWriteFailure(new TypeError('Failed to fetch')) === 'unconfirmed');
check('a timeout is NOT a refusal', classifyWriteFailure(new Error('timed out after 8000ms')) === 'unconfirmed');
check('an abort is NOT a refusal', classifyWriteFailure({ name: 'AbortError', message: 'aborted' }) === 'unconfirmed');
check('null/undefined are NOT refusals',
  classifyWriteFailure(null) === 'unconfirmed' && classifyWriteFailure(undefined) === 'unconfirmed');
// A code-shaped string that is not a server code must not sneak through.
check('a non-code string is NOT a refusal', classifyWriteFailure({ code: 'oops' }) === 'unconfirmed');

console.log('\n[2c] The unconfirmed message makes no claim about what was written');

check('it says the save could not be confirmed', /could not be confirmed/i.test(UNCONFIRMED_SAVE_MESSAGE));
check('it says the draft is preserved', /draft is preserved/i.test(UNCONFIRMED_SAVE_MESSAGE));
check('it tells the user to check before retrying', /check the stored entry before retrying/i.test(UNCONFIRMED_SAVE_MESSAGE));
// The whole point: it must NOT assert either outcome.
check('it does not claim nothing was written', !/nothing was (written|saved)/i.test(UNCONFIRMED_SAVE_MESSAGE));
check('it does not claim the save succeeded', !/\bsaved\b|\bsuccess/i.test(UNCONFIRMED_SAVE_MESSAGE));

console.log('\n[3] guidelines-service counts rows on every UPDATE path');

const svc = readFileSync('src/lib/guidelines-service.ts', 'utf8');
for (const fn of ['update', 'archive']) {
  const body = new RegExp(`async ${fn}\\([^]*?\\n  \\},`).exec(svc)?.[0] ?? '';
  check(`${fn}() asks for the affected rows via .select('id')`, body.includes(".select('id')"),
    body ? 'found the method but no .select(id)' : 'method body not found — renamed?');
  check(`${fn}() throws when the write changed nothing`, body.includes('isZeroRowWrite('),
    body ? 'no zero-row check' : 'method body not found — renamed?');
}
// create() goes through INSERT, which DOES surface 42501, so it needs no count.
check('create() relies on the INSERT error instead, as it may',
  /async create\([^]*?asPersistError\('create'/.test(svc));

console.log('\n[4] App.tsx shows a change only after the database confirms it');

const app = readFileSync('src/App.tsx', 'utf8');
const persist = /const persistGuideline = async[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('persistGuideline body located', persist.length > 0);

// The ordering invariant, asserted per path. persistGuideline has TWO write
// paths and each renders its own result, so a single indexOf would compare the
// staged path's render against the ordinary path's write and report a false
// failure — which is exactly what it did first time round.
//
// Ordinary path: the awaited update must precede the setGuidelines that renders
// it. Measured by position, so reintroducing an optimistic update fails here.
const ordinaryWriteAt = persist.indexOf('await guidelinesService.update(updated)');
const ordinaryRenderAt = persist.lastIndexOf('setGuidelines(prev =>');
check('ordinary path: the catalogue updates after the awaited write, not before',
  ordinaryWriteAt > 0 && ordinaryRenderAt > 0 && ordinaryWriteAt < ordinaryRenderAt,
  `write at ${ordinaryWriteAt}, render at ${ordinaryRenderAt}`);

// Staged path: same rule, measured against its own RPC call.
const stagedWriteAt = persist.indexOf('await stagedService.approve(');
const stagedRenderAt = persist.indexOf('setGuidelines(prev => [...prev, updated]);');
check('staged path: the catalogue updates after the awaited RPC, not before',
  stagedWriteAt > 0 && stagedRenderAt > 0 && stagedWriteAt < stagedRenderAt,
  `rpc at ${stagedWriteAt}, render at ${stagedRenderAt}`);

// And the two paths must stay in that order relative to each other, or the
// lastIndexOf above would silently start measuring the wrong one.
check('the staged path precedes the ordinary path in the function body',
  stagedRenderAt < ordinaryRenderAt,
  `staged render at ${stagedRenderAt}, ordinary render at ${ordinaryRenderAt}`);

check('a failed write returns false rather than falling through',
  /catch \(err\)[^]*?return false;/.test(persist));
check('persistGuideline reports success as a boolean',
  /Promise<boolean>/.test(persist) && persist.includes('return true;'));
// A refusal must not be dressed up as a partial success.
check('the failure message says the catalogue is unchanged',
  /catalogue is unchanged/i.test(persist));
check('the failure message tells the editor their draft survived',
  /still open/i.test(persist));

// A note failure happens AFTER a confirmed guideline write, so it must not be
// treated as a failed edit — retrying would write the guideline twice.
check('a note-only failure still reports overall success',
  persist.lastIndexOf('return true;') > persist.indexOf('changelogService.create'));
check('a note-only failure is surfaced, not swallowed',
  /SAVED, BUT NOT LOGGED/.test(persist));

console.log('\n[4b] Both save paths distinguish refusal from an unknown outcome');

check('the ordinary path classifies the failure',
  /classifyWriteFailure\(err\) === 'refused'/.test(persist));
check('the ordinary path has a refusal branch and an unconfirmed branch',
  /SAVE REFUSED/.test(persist) && /SAVE NOT CONFIRMED/.test(persist));
check('the staged path also classifies the failure',
  /PUBLISH REFUSED/.test(persist) && /PUBLISH NOT CONFIRMED/.test(persist));
check('both unconfirmed branches use the shared wording',
  (persist.match(/UNCONFIRMED_SAVE_MESSAGE/g) ?? []).length === 2);

// The regression that prompted this: "nothing was written" may only be said
// where the server actually said so. It must appear in refusal branches only.
const refusalClaims = persist.match(/nothing was (written|saved)/gi) ?? [];
const unconfirmedSections = persist.split(/SAVE NOT CONFIRMED|PUBLISH NOT CONFIRMED/).slice(1);
check('an unconfirmed outcome never claims nothing was written',
  unconfirmedSections.every(sec => !/nothing was (written|saved)/i.test(sec.slice(0, 400))),
  'an unconfirmed branch asserts an outcome it cannot know');
check('refusal branches do still state it plainly', refusalClaims.length >= 2,
  `found ${refusalClaims.length}`);
// Retrying is the user's decision, never automatic — a retry loop around an
// unknown outcome is how a single edit becomes three.
check('no automatic retry anywhere in the save path',
  !/setTimeout|retry\(|while \(|for \(/.test(persist));

console.log('\n[4c] describeMergeProgress — never claims more or less than happened');

eq('no steps done', describeMergeProgress({ mergedSaved: false, duplicateArchived: false }),
  'No step completed: the catalogue is unchanged.');
eq('step 1 only', describeMergeProgress({ mergedSaved: true, duplicateArchived: false }),
  'Step 1 of 2 completed: the merged content was saved.');
eq('both steps', describeMergeProgress({ mergedSaved: true, duplicateArchived: true }),
  'Both steps completed.');
// The regression: a partial merge must never be described as nothing happening.
check('a partial merge is not described as "unchanged"',
  !/unchanged/i.test(describeMergeProgress({ mergedSaved: true, duplicateArchived: false })));

console.log('\n[4d] Archive and merge report refusal and uncertainty separately');

const del = /const handleDelete = async[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('handleDelete body located', del.length > 0);
check('archive classifies the failure', /classifyWriteFailure\(err\) === 'refused'/.test(del));
check('archive has both a refused and an unconfirmed branch',
  /REMOVE REFUSED/.test(del) && /REMOVE NOT CONFIRMED/.test(del));
check('the old unprovable archive claim is gone',
  !app.includes('Remove failed — the entry was not archived'));
check('an unconfirmed archive does not assert the row was left alone',
  /Check whether/.test(del));
check('an archived-but-unlogged note failure is surfaced', /ARCHIVED, BUT NOT LOGGED/.test(del));

const merge = /const handleMergeDuplicates = async[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('handleMergeDuplicates body located', merge.length > 0);
check('merge tracks progress per step',
  /MergeProgress/.test(merge) && /mergedSaved = true/.test(merge) && /duplicateArchived = true/.test(merge));
check('merge reports how far it got', (merge.match(/describeMergeProgress\(progress\)/g) ?? []).length >= 3);
check('merge distinguishes refusal from uncertainty at step 2',
  /Step 2 was REFUSED/.test(merge) && /Step 2 could not be confirmed/.test(merge));
// The two claims that were previously false.
check('the old "no changes were made" claim is gone',
  !app.includes('Merge failed — no changes were made'));
check('the false atomicity comment is gone', !app.includes('if update throws,'));
// The doc comment sits ABOVE the declaration, so it is outside `merge` —
// checked against the file, and anchored to the 400 chars preceding the handler
// so it cannot be satisfied by the phrase appearing somewhere unrelated.
const mergeDeclAt = app.indexOf('const handleMergeDuplicates = async');
const mergeDocBlock = mergeDeclAt > 0 ? app.slice(Math.max(0, mergeDeclAt - 1200), mergeDeclAt) : '';
check('merge documents plainly that it is not atomic', /NOT ATOMIC/.test(mergeDocBlock));
check('merge documents that the earlier atomicity claim was wrong',
  /That was wrong/.test(mergeDocBlock));
check('a step-2 failure still reflects the confirmed step 1 locally',
  /setGuidelines\(prev => prev\.map\(g => g\.id === merged\.id \? merged : g\)\);/.test(merge));
check('a step-2 failure tells the editor not to merge again',
  /Do not merge again/.test(merge));
// No retry loops in either handler.
check('no automatic retry in archive or merge',
  !/setTimeout|retry\(|while \(/.test(del) && !/setTimeout|retry\(|while \(/.test(merge));

console.log('\n[4e] Approval: the already-processed guard is reported as done, not retryable');

check('already-processed is a refusal',
  classifyWriteFailure({ code: ALREADY_PROCESSED_CODE }) === 'refused');
check('already-processed is identified',
  isAlreadyProcessedWrite({ code: ALREADY_PROCESSED_CODE })
  && isAlreadyProcessedWrite(markAlreadyProcessed(new Error('x'))));
check('an ordinary refusal is not already-processed', !isAlreadyProcessedWrite({ code: '42501' }));
check('markAlreadyProcessed implies refused',
  classifyWriteFailure(markAlreadyProcessed(new Error('x'))) === 'refused');

// The RPC takes the row lock before testing review_status, so a retry after a
// lost response is refused rather than publishing a second copy. The message
// must therefore NOT tell the editor it is still pending and retryable.
check('the approve path has a dedicated already-processed branch', /ALREADY PROCESSED/.test(persist));
// 55000 means NOT PENDING. It does not mean published — a rejected candidate is
// equally not pending and was never added to the catalogue. The heading must
// therefore not assert publication.
check('the heading does NOT assert publication', !/ALREADY PUBLISHED/.test(persist));
// Scoped to this branch only. A wider window spills into the PUBLISH REFUSED
// branch below, which legitimately DOES say "still pending and can be retried"
// — that is the genuine-rollback case.
const alreadySection = (persist.split('ALREADY PROCESSED')[1] ?? '').split('PUBLISH REFUSED')[0] ?? '';
check('the already-processed branch does not claim the candidate is still pending',
  !/still pending/i.test(alreadySection), alreadySection.slice(0, 120));
check('the already-processed branch claims only that nothing changed',
  /changed nothing/i.test(alreadySection));

// The message body comes from staged-service, which reads the row back rather
// than inferring the outcome from the error code.
const staged = readFileSync('src/lib/staged-service.ts', 'utf8');
check('staged-service reads the queue row back on 55000',
  /describeProcessedState/.test(staged) && /select\('review_status, resulting_guideline_id'\)/.test(staged));
check('an ACCEPTED candidate reports its resulting guideline id',
  /already accepted and published as/.test(staged) && /resulting_guideline_id\s*\n?\s*\?/.test(staged));
check('an accepted candidate with no recorded id says so instead of guessing',
  /no resulting guideline id is recorded/.test(staged));
// A rejected queue row records a decision about THIS candidate and nothing
// more. It is not evidence that the catalogue lacks equivalent guidance, so the
// message must not claim that nothing was published or added.
check('a REJECTED candidate is reported as rejected, with no claim about the catalogue',
  /This candidate is already rejected\. This attempt made no changes\./.test(staged)
  && !/never published/.test(staged)
  && !/nothing has been added to the/.test(staged));
check('a failed read-back says the state is unknown rather than guessing',
  (staged.match(/could not be read back/g) ?? []).length >= 2);
check('the 55000 message no longer asserts publication unconditionally',
  !/published again/.test(staged));
check('a genuine rollback refusal still says it is retryable',
  /still pending and can be retried/.test(persist));

console.log('\n[4f] Persistent rejection: attributed, reasoned, and distinct from Hide');

const sql = readFileSync('supabase/migrations/20261012_reject_staged_candidate.sql', 'utf8');
check('the RPC is SECURITY DEFINER', /create or replace function public\.reject_staged_candidate[^]*?security definer/.test(sql));
check('search_path is pinned', /set search_path = public, pg_temp/.test(sql));
// Null-safe, and that is not pedantry. is_editor() is
// `select auth.uid() = any (array[...])`, so with no JWT it returns NULL, and
// `not NULL` is NULL --- a plain `if not public.is_editor() then` branch never
// fires and the rejection proceeds with reviewed_by = NULL. Confirmed against
// production: auth.uid() null, is_editor() -> NULL.
check('it checks the editor allowlist', /if public\.is_editor\(\) is not true then/.test(sql));
check('the allowlist check is null-safe, not a bare `if not`',
  !/if not public\.is_editor\(\) then/.test(sql),
  'a NULL auth.uid() would fall through the guard and reject unattributed');
// Must use a whitespace-aware test, NOT length(btrim(...)). btrim with no
// second argument strips spaces only, so a tab or newline passes as non-blank —
// the local suite caught exactly that, accepting "   \n\t " as a reason.
// Plain substring matching: the patterns contain backslashes, and escaping
// them through a regex literal is how the first version of this assertion came
// to test for two backslashes instead of one.
check('it requires a non-blank reason', sql.includes("p_reason !~ '\\S'"));
check('the blank test is whitespace-aware, not space-only',
  !sql.includes('length(btrim(p_reason)) = 0'), 'btrim() alone misses tabs and newlines');
check('the stored reason is trimmed of all whitespace',
  sql.includes("btrim(p_reason, E' \\t\\r\\n')"));
// Lock BEFORE the state test is what serialises a concurrent approve+reject.
const lockAt = sql.indexOf('for update');
const stateAt = sql.indexOf("review_status <> 'pending'");
check('it locks the row BEFORE testing state', lockAt > 0 && stateAt > 0 && lockAt < stateAt,
  `lock at ${lockAt}, state test at ${stateAt}`);
check('only a pending candidate may be rejected', /review_status <> 'pending'[^]*?errcode = '55000'/.test(sql));
check('it records status, reason, timestamp and reviewer', /review_status = 'rejected'/.test(sql)
  && /review_note   = btrim\(p_reason, E/.test(sql)
  && /reviewed_at   = now\(\)/.test(sql)
  && /reviewed_by   = auth\.uid\(\)/.test(sql));
// The defining property: a rejection publishes nothing.
const fnBody = /create or replace function public\.reject_staged_candidate[^]*?\n\$\$;/.exec(sql)?.[0] ?? '';
check('the function body never touches public.guidelines', fnBody.length > 0 && !/public\.guidelines\b/.test(fnBody));
check('the function body never touches guideline_changelog', fnBody.length > 0 && !/guideline_changelog/.test(fnBody));
check('database references are schema-qualified', /from public\.staged_guidelines/.test(fnBody)
  && /update public\.staged_guidelines/.test(fnBody));
check('EXECUTE is revoked from public and anon, granted to authenticated only',
  /revoke all on function public\.reject_staged_candidate\(uuid, text\) from public/.test(sql)
  && /revoke all on function public\.reject_staged_candidate\(uuid, text\) from anon/.test(sql)
  && /grant execute on function public\.reject_staged_candidate\(uuid, text\) to authenticated/.test(sql));
check('a reason is required at the DATABASE layer too, not only in the form',
  /staged_guidelines_rejection_needs_note/.test(sql) && /review_status <> 'rejected'\s*\n?\s*or \(review_note is not null/.test(sql));
check('the migration adds no new policy', !/create policy/.test(sql));

const dash = readFileSync('src/components/ReviewDashboard.tsx', 'utf8');
check('the service exposes reject()', /async reject\(stagedId: string, reason: string\)/.test(staged));
check('reject handles the already-processed state via read-back',
  /no longer pending, so it was NOT rejected/.test(staged) && /describeProcessedState/.test(staged));
check('the dashboard confirms the target by name', /Reject <span className="font-semibold">\{candidate\.topic\}<\/span>\?/.test(dash));
check('a reason is required before the confirm button enables',
  /disabled=\{reject\.busy \|\| reject\.reason\.trim\(\)\.length === 0\}/.test(dash));
check('success is shown only after the RPC resolves',
  /await stagedService\.reject\([^]*?setRejected\(/.test(dash));
check('the reason survives a failure', /\.\.\.rejecting,\s*\n\s*busy: false,/.test(dash));
check('an unconfirmed reject is not reported as a refusal',
  /classifyWriteFailure\(err\) !== 'refused'/.test(dash) && /UNCONFIRMED_SAVE_MESSAGE/.test(dash));
// Hide and Reject must not read as the same action.
check('persistent Reject and temporary Hide are separate controls',
  /Reject…/.test(dash) && /Hide\n/.test(dash) && /Writes nothing, and the card returns on reload/.test(dash));
check('Reject is offered only for a candidate with a queue row', /canReject=\{Boolean\(candidate\.stagedId\)\}/.test(dash));
// A re-wrapped error loses `error.code`, and the code is the only proof the
// server answered. Without carrying the refusal across, the dashboard labels a
// flat 42501 "not an approved editor" as "Save could not be confirmed" — i.e.
// reports a decided refusal as an unknown outcome.
const rejectStart = staged.indexOf('async reject(stagedId: string, reason: string)');
const rejectFn = rejectStart < 0 ? '' : staged.slice(rejectStart, rejectStart + 2600);
check('reject re-wraps errors without losing the confirmed-refusal signal',
  rejectFn.length > 0
  && /classifyWriteFailure\(error\) === 'refused' \? markRefused\(thrown\)/.test(rejectFn),
  'a re-wrapped server refusal would be misreported as an unconfirmed write');
check('the not-an-editor refusal is tagged as refused',
  /throw keepRefusal\(new Error\(NOT_AN_EDITOR_MESSAGE\)\)/.test(rejectFn));
check('an answered failure with any other code is tagged as refused too',
  rejectFn.includes('throw keepRefusal(') && rejectFn.includes('new Error(`Reject failed'));

console.log('\n[5] The editor’s unsaved draft survives a failure');

const handleSave = /const handleSave = async[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('handleSave body located', handleSave.length > 0);
check('the modal is closed only when the write succeeded',
  /if \(saved\) setEditingGuideline\(null\);/.test(handleSave));
check('the modal is no longer closed before persisting',
  !/setEditingGuideline\(null\);[\s\S]{0,80}persistGuideline/.test(handleSave));
check('Save is blocked while a write is in flight (no double submit)',
  app.includes('&& !submitting;') && app.includes('setSubmitting(true)'));

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
