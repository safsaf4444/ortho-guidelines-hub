/**
 * scripts/tests/guideline-id.test.ts
 * ──────────────────────────────────
 * Offline tests for src/lib/guideline-id.ts.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. `guidelines.id` is a text primary key,
 * it is what `guideline_changelog.guideline_id` points at, and it would be the
 * basis of any shareable link. It is effectively permanent: changing one after
 * publication needs a migration that rewrites the changelog too.
 *
 * So these tests guard two properties. First, a proposed id is readable and
 * unique — a candidate approved from the queue used to inherit
 * `candidate-boa-new-guideline-3f9a1c4e7b22`, a content hash, permanently.
 * Second, validation actually rejects what the database would reject, so the
 * editor finds out in the form rather than from a 23505 after publishing.
 *
 * Run:   npx tsx scripts/tests/guideline-id.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import {
  GUIDELINE_ID_PATTERN,
  MAX_GUIDELINE_ID_LENGTH,
  isPlaceholderGuidelineId,
  proposeGuidelineId,
  slugify,
  validateGuidelineId,
} from '../../src/lib/guideline-id';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';

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

console.log('\n[1] slugify — deterministic, never invents characters');

eq('lowercases and hyphenates', slugify('Open Fractures'), 'open-fractures');
eq('collapses runs of punctuation to one hyphen', slugify('Hip / Knee  —  Revision'), 'hip-knee-revision');
eq('strips leading and trailing separators', slugify('  ...Bunions!  '), 'bunions');
eq('decomposes accents to base letters', slugify('Dupuytren Contracture — Ménière'), 'dupuytren-contracture-meniere');
// Dropping "&" would silently merge two different titles into one id.
eq('& becomes the word "and"', slugify('Foot & Ankle'), 'foot-and-ankle');
eq('keeps digits', slugify('COVID-19 Audit 2021'), 'covid-19-audit-2021');
eq('empty input yields an empty slug, not a crash', slugify('   '), '');
check('output always matches the id pattern when non-empty', GUIDELINE_ID_PATTERN.test(slugify('A  B!! c')));

console.log('\n[2] proposeGuidelineId — readable, and shaped like the live catalogue');

eq(
  'combines provider and topic',
  proposeGuidelineId('BOA', 'Open Fractures', []),
  'boa-open-fractures',
);
// Otherwise "BOA" + "BOA Standard for X" becomes boa-boa-standard-for-x.
eq(
  'does not repeat a provider the topic already leads with',
  proposeGuidelineId('BOA', 'BOA Standard for Open Fractures', []),
  'boa-standard-for-open-fractures',
);
eq('falls back when there is nothing to slug', proposeGuidelineId('', '', []), 'guideline');
eq('topic alone when no provider', proposeGuidelineId('', 'Cauda Equina', []), 'cauda-equina');

console.log('\n[3] Collisions are resolved before publication, not at the database');

const taken = ['boa-open-fractures', 'boa-open-fractures-2'];
eq('first collision suffixes -2, not -1', proposeGuidelineId('BOA', 'Open Fractures', ['boa-open-fractures']), 'boa-open-fractures-2');
eq('walks past an occupied suffix', proposeGuidelineId('BOA', 'Open Fractures', taken), 'boa-open-fractures-3');
check('accepts a Set as well as an array', proposeGuidelineId('BOA', 'Open Fractures', new Set(taken)) === 'boa-open-fractures-3');

const long = proposeGuidelineId('BOA', 'A'.repeat(30) + ' ' + 'B'.repeat(60), []);
check(`respects the length cap (${long.length} <= ${MAX_GUIDELINE_ID_LENGTH})`, long.length <= MAX_GUIDELINE_ID_LENGTH);
check('a truncated id never ends on a hyphen', !long.endsWith('-'));
check('a truncated id is still a valid id', GUIDELINE_ID_PATTERN.test(long));

console.log('\n[4] validateGuidelineId — rejects what the database would reject');

const existing = new Set(['girft-bunions', 'boa-open-fractures']);
check('accepts a well-formed unused id', validateGuidelineId('boa-ankle-fractures', existing).ok);
check('rejects empty', !validateGuidelineId('   ', existing).ok);
check('rejects uppercase', !validateGuidelineId('BOA-Open', existing).ok);
check('rejects spaces', !validateGuidelineId('boa open', existing).ok);
check('rejects underscores', !validateGuidelineId('boa_open', existing).ok);
check('rejects double hyphens', !validateGuidelineId('boa--open', existing).ok);
check('rejects a leading hyphen', !validateGuidelineId('-boa', existing).ok);
check('rejects a trailing hyphen', !validateGuidelineId('boa-', existing).ok);
check('rejects over-length', !validateGuidelineId('a'.repeat(MAX_GUIDELINE_ID_LENGTH + 1), existing).ok);
check('rejects a collision', !validateGuidelineId('girft-bunions', existing).ok);
// Re-saving an existing row must not report a collision with itself.
check('allows a row to keep its own id', validateGuidelineId('girft-bunions', existing, 'girft-bunions').ok);
check('a collision message names the problem', /already uses/i.test(
  (validateGuidelineId('girft-bunions', existing) as { error: string }).error));

console.log('\n[5] Placeholder detection is advice, not a rule');

check('flags the manual-add placeholder', isPlaceholderGuidelineId('new-001'));
check('flags the old candidate-hash shape', isPlaceholderGuidelineId('candidate-boa-new-guideline-3f9a1c4e7b22'));
check('does not flag a real slug', !isPlaceholderGuidelineId('boa-open-fractures'));
// It must not flag genuine catalogue ids that merely start with "new".
check('does not flag a real id beginning with "new"', !isPlaceholderGuidelineId('newcastle-hip-pathway'));
check('a placeholder is still VALID — it warns, it does not block',
  validateGuidelineId('new-001', new Set()).ok);

console.log('\n[6] Against the LIVE catalogue — proposals never collide with real data');

const liveIds = new Set(GUIDELINES_DATA.map(g => g.id));
check(`all ${liveIds.size} live ids are unique`, liveIds.size === GUIDELINES_DATA.length);

const malformed = GUIDELINES_DATA.filter(g => !GUIDELINE_ID_PATTERN.test(g.id));
check(
  'every live id already matches the pattern the form now enforces',
  malformed.length === 0,
  malformed.length ? `non-conforming: ${malformed.slice(0, 5).map(g => g.id).join(', ')}` : '',
);

const overLong = GUIDELINES_DATA.filter(g => g.id.length > MAX_GUIDELINE_ID_LENGTH);
check(
  'no live id exceeds the length cap, so the cap cannot block a re-save',
  overLong.length === 0,
  overLong.length ? `longest: ${overLong[0].id} (${overLong[0].id.length})` : '',
);

// The real scenario: re-proposing an id for a guideline already in the
// catalogue must route around it rather than duplicate the key.
const sample = GUIDELINES_DATA[0];
const reproposed = proposeGuidelineId(sample.source, sample.topic, liveIds);
check(
  'a proposal for an already-catalogued topic does not reuse its id',
  !liveIds.has(reproposed),
  `proposed ${reproposed}`,
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
