/**
 * scripts/tests/changelog-load.test.ts
 * ─────────────────────────────────────
 * Offline tests for the changelog load-state classification in
 * src/lib/changelog-service.ts.
 *
 * Context: the global Changelog tab used to render EVERY failure as
 * "No changelog entries yet" — a real query error shown as a legitimate empty
 * state. The service now returns a discriminated ChangelogLoad, and the UI
 * branches on it. isMissingTableError() is the part that decides whether a
 * failure means "not provisioned yet" (expected, nothing to retry) or "the
 * query genuinely failed" (surfaced with a Retry control), so it is tested
 * directly here.
 *
 * Only the pure classifier is exercised — importing the service module itself
 * would pull in the browser Supabase client.
 *
 * Run:   npx tsx scripts/tests/changelog-load.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { isMissingTableError } from '../../src/lib/changelog-load';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] A missing guideline_changelog table is classified as "not provisioned"');
check('PostgREST schema-cache code PGRST205',
  isMissingTableError('PGRST205', "Could not find the table 'public.guideline_changelog' in the schema cache"));
check('raw Postgres undefined_table code 42P01',
  isMissingTableError('42P01', 'relation "public.guideline_changelog" does not exist'));
check('recognised from the message alone, with no code',
  isMissingTableError(undefined, "Could not find the table 'public.guideline_changelog' in the schema cache"));
check('recognised from a relation-does-not-exist message alone',
  isMissingTableError(undefined, 'relation "public.guideline_changelog" does not exist'));

console.log('\n[2] A genuine query failure is NOT misreported as "not provisioned"');
check('permission denied (RLS) is a real error',
  !isMissingTableError('42501', 'permission denied for table guideline_changelog'));
check('network/fetch failure is a real error',
  !isMissingTableError(undefined, 'TypeError: Failed to fetch'));
check('a JWT problem is a real error',
  !isMissingTableError('PGRST301', 'JWT expired'));
check('an undefined COLUMN is a real error, not a missing table',
  !isMissingTableError('42703', 'column "description" does not exist'));
check('no code and no message is a real error',
  !isMissingTableError(undefined, undefined));
check('an empty message is a real error',
  !isMissingTableError('', ''));

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
