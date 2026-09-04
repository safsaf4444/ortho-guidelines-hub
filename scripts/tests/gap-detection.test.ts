/**
 * scripts/tests/gap-detection.test.ts
 * ─────────────────────────────────────
 * Offline tests for src/lib/gap-detection.ts — the honest zero-result state
 * behind App.tsx's "No current UK guidance identified for this topic" message.
 *
 * Context: the handoff for this feature named three example topics (BESS
 * proximal humerus fracture, BESS elbow dislocation, BSCOS SCFE) as "known
 * confirmed gaps" the search should recognise. An exhaustive scan of the live
 * 231-row dataset's notes fields found exactly ONE row carrying gap-marking
 * language (the SCFE entry, "no UK consensus guideline exists for acute SCFE
 * presentation"). The other two named examples have no corresponding
 * editorial note anywhere in the data, so findGapNote() correctly returns
 * null for them — hardcoding a "confirmed gap" response for topics with no
 * data backing it would assert an unverified clinical claim. These tests
 * pin that behaviour down explicitly so it isn't "fixed" into a hardcoded
 * list by a future change.
 *
 * Run:   npx tsx scripts/tests/gap-detection.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { findGapNote, GAP_NOTE_PATTERN } from '../../src/lib/gap-detection';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import type { Guideline } from '../../src/data/guidelines-data';

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

function mk(over: Partial<Guideline> & { id: string; notes?: string }): Guideline {
  return {
    id: over.id,
    section: 'Trauma',
    topic: over.topic ?? 'Test topic',
    source: 'Test',
    type: 'National guidance',
    summary: '',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    versions: [],
    notes: over.notes,
  };
}

console.log('\n[1] GAP_NOTE_PATTERN recognises the language actually used in the data');
check('matches "no UK consensus"', GAP_NOTE_PATTERN.test('no UK consensus guideline exists for X'));
check('matches "gaps register"', GAP_NOTE_PATTERN.test('see Gaps register'));
check('is case-insensitive', GAP_NOTE_PATTERN.test('NO UK CONSENSUS'));
check('does not match ordinary editorial text', !GAP_NOTE_PATTERN.test('Published Jan 2020, last reviewed Sept 2024.'));

console.log('\n[2] findGapNote against a small fixture set (not the live dataset)');
const fixture: Guideline[] = [
  mk({ id: 'a', notes: 'no UK consensus guideline exists for acute SCFE presentation - see Gaps register.' }),
  mk({ id: 'b', notes: 'Published Jan 2020, last reviewed Sept 2024.' }),
  mk({ id: 'c', notes: undefined }),
];
check('finds a note when the query is a literal substring of it',
  findGapNote('SCFE presentation', fixture) === fixture[0].notes);
check('is case-insensitive on the query',
  findGapNote('scfe presentation', fixture) === fixture[0].notes);
check('returns null for an empty query', findGapNote('', fixture) === null);
check('returns null for a whitespace-only query', findGapNote('   ', fixture) === null);
check('returns null when no note is flagged with gap language',
  findGapNote('reviewed Sept 2024', fixture) === null);
check('does not crash on a guideline with no notes field',
  findGapNote('anything', [fixture[2]]) === null);

console.log('\n[3] Behaviour against the LIVE dataset — pins down what is and is not "confirmed"');
check('the SCFE note is found by a substring drawn from it',
  findGapNote('SCFE presentation', GUIDELINES_DATA) !== null);
check('"BESS proximal humerus fracture" has NO data-backed gap note — must NOT fabricate one',
  findGapNote('BESS proximal humerus fracture', GUIDELINES_DATA) === null);
check('"BESS elbow dislocation" has NO data-backed gap note — must NOT fabricate one',
  findGapNote('BESS elbow dislocation', GUIDELINES_DATA) === null);
check('a plain "SCFE" query does not need the gap path (a real entry already matches it)',
  GUIDELINES_DATA.some(g => g.topic.toLowerCase().includes('scfe')));

const gapRows = GUIDELINES_DATA.filter(g => GAP_NOTE_PATTERN.test(g.notes ?? ''));
check(`exactly one live row carries gap-marking language (found ${gapRows.length})`, gapRows.length === 1);

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
