/**
 * scripts/tests/change-note.test.ts
 * ─────────────────────────────────
 * Offline tests for the two safeguards that sit on top of public editing:
 *
 *   1. Mandatory change notes  — src/lib/change-note.ts
 *   2. Soft delete             — archived rows must never reach the app
 *
 * Editing on this site is public and unauthenticated, so there is no account
 * to attribute a change to. The note is the entire audit trail, and the
 * archive flag is what makes vandalism recoverable. See SECURITY.md.
 *
 * The validation rule here must stay identical to the database's
 * guideline_changelog_description_not_blank CHECK constraint
 * (`length(btrim(description)) > 0`), or the form and the constraint will
 * disagree about what counts as empty. Section [4] pins that.
 *
 * Run:   npx tsx scripts/tests/change-note.test.ts   (or: npm run test:offline)
 */
import { readFileSync } from 'node:fs';
import {
  prepareChangeNote, isValidChangeNote, MAX_NOTE_LENGTH,
  archiveNote, linkStatusNote, mergeNote, isAutomaticNote,
} from '../../src/lib/change-note';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

console.log('\n[1] prepareChangeNote — a blank note can never be accepted');

eq('empty string is rejected', prepareChangeNote(''), { ok: false, error: 'Describe what you changed — a note is required.' });
eq('whitespace-only is rejected, matching the DB btrim check', prepareChangeNote('    '), { ok: false, error: 'Describe what you changed — a note is required.' });
eq('tabs and newlines only are rejected', prepareChangeNote('\t\n  '), { ok: false, error: 'Describe what you changed — a note is required.' });
eq('null is rejected', prepareChangeNote(null), { ok: false, error: 'Describe what you changed — a note is required.' });
eq('undefined is rejected', prepareChangeNote(undefined), { ok: false, error: 'Describe what you changed — a note is required.' });
eq('a real note is accepted and trimmed', prepareChangeNote('  fixed the NICE link  '), { ok: true, note: 'fixed the NICE link' });
check('a note at the length limit is accepted', prepareChangeNote('x'.repeat(MAX_NOTE_LENGTH)).ok);
check('a note over the limit is rejected', !prepareChangeNote('x'.repeat(MAX_NOTE_LENGTH + 1)).ok);
check('length is measured after trimming, not before',
  prepareChangeNote('  ' + 'x'.repeat(MAX_NOTE_LENGTH) + '  ').ok);

console.log('\n[2] isValidChangeNote — the predicate the Save button is gated on');

check('blank is not valid', !isValidChangeNote(''));
check('whitespace is not valid', !isValidChangeNote('   '));
check('a real note is valid', isValidChangeNote('corrected the publication date'));

console.log('\n[3] Automatic notes — single-click writes still leave a trail');

const auto = [
  ['archive', archiveNote('Management of patients with pelvic fractures')],
  ['link status', linkStatusNote('Link checked', '2026-09-09')],
  ['merge', mergeNote('Kept entry', 'Duplicate entry')],
] as const;
for (const [label, note] of auto) {
  check(`${label} note is non-empty`, note.trim().length > 0);
  check(`${label} note is marked automatic`, isAutomaticNote(note));
}
check('archive note names the entry it archived', archiveNote('Pelvic fractures').includes('Pelvic fractures'));
check('archive note says the entry is recoverable, not deleted', /not deleted|restored/.test(archiveNote('x')));
check('merge note names both sides', mergeNote('Kept', 'Losing').includes('Kept') && mergeNote('Kept', 'Losing').includes('Losing'));
check('merge note says the losing row was archived, not deleted', mergeNote('a', 'b').includes('archived'));
check('link status note records the status and the date', linkStatusNote('Broken link', '2026-01-02').includes('Broken link') && linkStatusNote('Broken link', '2026-01-02').includes('2026-01-02'));
check('a human note is NOT flagged as automatic', !isAutomaticNote('I fixed the link'));

console.log('\n[4] Every automatic note passes the same gate a typed note must');

for (const [label, note] of auto) {
  check(`${label} note would be accepted by prepareChangeNote`, prepareChangeNote(note).ok);
  check(`${label} note is within the DB-safe length`, note.length <= MAX_NOTE_LENGTH);
}

console.log('\n[5] Soft delete — no hard-delete path, archived rows excluded');

const svc = readFileSync('src/lib/guidelines-service.ts', 'utf8');
check('guidelines-service exposes archive(), not remove()',
  svc.includes('async archive(') && !svc.includes('async remove('));
check('guidelines-service issues no .delete() against guidelines',
  !svc.includes('.delete()'));
check('archive writes only the archived flag, not the whole row',
  svc.includes("update({ archived: true })"));
check('the live query excludes archived rows',
  svc.includes("eq('archived', false)"));
check('the static fallback excludes archived rows too',
  svc.includes('GUIDELINES_DATA.filter(g => !g.archived)') && !svc.includes('[...GUIDELINES_DATA]'));

const app = readFileSync('src/App.tsx', 'utf8');
check('App.tsx archives instead of removing', app.includes('guidelinesService.archive(') && !app.includes('guidelinesService.remove('));
check('the merge path archives the losing row rather than deleting it', app.includes('archive(duplicate.id)'));
check('every persist supplies a note (persistGuideline takes one)', /persistGuideline = async \(updated: Guideline, isNew: boolean, note: string\)/.test(app));
check('the Save button is gated on a valid note', app.includes('disabled={!noteOk}'));

// The archived predicate itself, against a fixture (the live dataset has no
// archived rows, so asserting on it would pass vacuously).
type Row = { id: string; archived?: boolean };
const rows: Row[] = [{ id: 'a' }, { id: 'b', archived: true }, { id: 'c', archived: false }];
eq('filtering drops exactly the archived row', rows.filter(g => !g.archived).map(r => r.id), ['a', 'c']);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
