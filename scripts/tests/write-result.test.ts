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
  UNCONFIRMED_SAVE_MESSAGE,
  classifyWriteFailure,
  isZeroRowWrite,
  markRefused,
  refusedOrMissingMessage,
} from '../../src/lib/write-result';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
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
