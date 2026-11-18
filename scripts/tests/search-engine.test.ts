/**
 * scripts/tests/search-engine.test.ts
 * ───────────────────────────────────
 * Offline tests for src/lib/search — normalisation, terminology integrity,
 * ranking, status handling, determinism and missing-field robustness.
 *
 * NO NETWORK. Pure functions over the static catalogue plus a few synthetic
 * records. Nothing here touches the UI, the database or any adapter.
 *
 * Run:   npx tsx scripts/tests/search-engine.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { GUIDELINES_DATA, type Guideline } from '../../src/data/guidelines-data';
import {
  analyseQuery,
  buildSearchIndex,
  searchGuidelines,
  searchIndex,
  type SearchableRecord,
} from '../../src/lib/search/engine';
import { editDistance, normaliseText, singularise, tokenise, typoAllowance } from '../../src/lib/search/normalise';
import { TERMINOLOGY } from '../../src/lib/search/terminology';
import { legacySubstringSearch } from '../../src/lib/search/legacy';

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
function eq<T>(name: string, actual: T, expected: T) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

const index = buildSearchIndex(GUIDELINES_DATA);
const ids = (q: string, limit?: number) => searchIndex(index, q, { limit }).map((r) => r.id);
const byId = new Map(GUIDELINES_DATA.map((g) => [g.id, g]));

// ─── 1. Normalisation ────────────────────────────────────────────────────────
console.log('\n[1] normalisation');
eq('lower-case, accents, spelling fold', normaliseText('Orthopédic Pediatric'), 'orthopaedic paediatric');
eq('tokenise drops stop-words and singularises', tokenise('Management of the ankle fractures'), ['management', 'ankle', 'fracture']);
eq('tokenise keeps hyphen parts and joined form', tokenise('peri-prosthetic'), ['peri', 'prosthetic', 'periprosthetic']);
eq("tokenise strips apostrophes", tokenise("Dupuytren's contracture"), ['dupuytren', 'contracture']);
eq('singularise is conservative', ['fractures', 'injuries', 'status', 'lipus', 'bess', 'boasts'].map(singularise), ['fracture', 'injury', 'status', 'lipus', 'bess', 'boast']);
eq('edit distance with transposition', [editDistance('scaphiod', 'scaphoid', 2), editDistance('compartmant', 'compartment', 2), editDistance('hip', 'hop', 1), editDistance('abc', 'xyz', 1)], [1, 1, 1, 2]);
eq('typo allowance by length', ['hip', 'ankle', 'scaphoid', 'periprosthetic'].map(typoAllowance), [0, 1, 2, 2]);

// ─── 2. Terminology integrity ───────────────────────────────────────────────
console.log('\n[2] terminology dictionary');
{
  const seen = new Set<string>();
  let dupIds = 0;
  let emptySyn = 0;
  let badEvidence: string[] = [];
  let overlap: string[] = [];
  const synonymOwner = new Map<string, string>();
  for (const e of TERMINOLOGY) {
    if (seen.has(e.id)) dupIds++;
    seen.add(e.id);
    if (!e.synonyms.length) emptySyn++;
    for (const ev of e.evidence) if (ev !== 'usage' && !byId.has(ev)) badEvidence.push(`${e.id}:${ev}`);
    for (const s of e.synonyms) {
      const key = tokenise(s).join(' ');
      const owner = synonymOwner.get(key);
      if (owner && owner !== e.id) overlap.push(`${key} (${owner}, ${e.id})`);
      synonymOwner.set(key, e.id);
    }
  }
  check('entry ids are unique', dupIds === 0);
  check('every entry has at least one synonym', emptySyn === 0);
  check('every evidence id exists in the catalogue (or is "usage")', badEvidence.length === 0, badEvidence.join(', '));
  check('no synonym phrase belongs to two entries', overlap.length === 0, overlap.join('; '));
  check('dictionary is small and reviewable (< 120 entries)', TERMINOLOGY.length < 120, String(TERMINOLOGY.length));
}

// ─── 3. Query analysis ──────────────────────────────────────────────────────
console.log('\n[3] query analysis');
{
  const g = analyseQuery('total hip replacement infection');
  eq('dictionary phrase becomes one group', g.map((x) => x.text), ['total hip replacement', 'infection']);
  check('group carries THR as a synonym alternative', g[0].alternatives.some((a) => a.label === 'THR'));
  eq('duplicate words collapse to one group', analyseQuery('hip hip').length, 1);
  eq('empty and stop-word-only queries yield no groups', [analyseQuery('').length, analyseQuery('the and of').length], [0, 0]);
  eq('explanations keep the typed word', analyseQuery('GTPS')[0].text, 'gtps');
}

// ─── 4. Retrieval behaviour on the real catalogue ───────────────────────────
console.log('\n[4] retrieval');
eq('exact title ranks first', ids('Management of ankle fractures', 1), ['ankle-fracture']);
eq('word order does not matter', ids('fracture ankle', 1), ['ankle-fracture']);
check('abbreviation finds expansion (TKR → total knee replacement)', ids('TKR').includes('nice-mini-incision-tkr-htg220'));
check('expansion finds abbreviation (anterior cruciate ligament → ACL)', ids('anterior cruciate ligament', 3).includes('acl-injury-management'));
eq('typo within tolerance', ids('compartmant syndrome', 1), ['compartment-syndrome']);
check('no typo matching for a word the catalogue already spells ("bunion" must not match "union")', !ids('bunion').some((id) => id.startsWith('nice-lipus') || id === 'nice-exogen-htg296'));
eq('provider name matches source field', ids('GIRFT cauda equina', 1), ['girft-cauda-equina-pathway']);
eq('no results for an unrelated clinical topic', ids('cardiac catheterisation'), []);
eq('empty query returns nothing', ids(''), []);
{
  const full = searchIndex(index, 'VTE hand');
  const first = full[0];
  check('full-coverage match outranks partial matches', first.id === 'bssh-vte-guidelines' && !first.partial);
  check('partial matches are returned, flagged, and after full matches', full.some((r) => r.partial) && full.findIndex((r) => r.partial) > 0 && full.slice(full.findIndex((r) => r.partial)).every((r) => r.partial));
  check('every result carries an explanation with a status line', full.every((r) => r.explanation.length > 0 && r.explanation[r.explanation.length - 1].startsWith('Status ')));
}
{
  const r = searchIndex(index, 'THR')[0];
  check('synonym match is explained', r.matches.some((m) => m.via === 'synonym' && m.entryId === 'thr'));
}
{
  const r = searchIndex(index, 'scaphiod fracture')[0];
  check('typo match is explained with the corrected word', r.id === 'girft-scaphoid-fracture-pathway' && r.matches.some((m) => m.via === 'typo' && m.matchedAs === 'scaphoid'));
}

// ─── 5. Status-aware ranking ────────────────────────────────────────────────
console.log('\n[5] status');
{
  const needsReview = ids('bunions');
  check('needs-review entry remains findable', needsReview.includes('girft-bunions'));
  const linkUnavailable = searchIndex(index, 'BSCOS practice guidelines');
  check('link-unavailable entry remains findable with its status exposed', linkUnavailable[0]?.id === 'bscos-practice-guidelines-members' && linkUnavailable[0].status.guidanceStatus === 'link-unavailable');

  // Synthetic: same title twice, one archived, one superseded, one current.
  const base = byId.get('ankle-fracture') as Guideline;
  const trio: Guideline[] = [
    { ...base, id: 'zz-archived', archived: true },
    { ...base, id: 'zz-superseded', guidanceStatus: 'superseded' },
    { ...base, id: 'zz-current' },
  ];
  const r = searchGuidelines(trio, 'Management of ankle fractures');
  eq('archived and superseded copies are still returned', r.length, 3);
  eq('current wins when relevance is otherwise equal', r.map((x) => x.id), ['zz-current', 'zz-superseded', 'zz-archived']);
  check('archived result says so', r[2].status.archived && r[2].explanation.some((l) => l.includes('archived')));
  // Status must never beat relevance.
  const mixed: Guideline[] = [
    { ...base, id: 'zz-old-relevant', guidanceStatus: 'superseded' },
    { ...(byId.get('bess-tennis-elbow') as Guideline), id: 'zz-new-irrelevant' },
  ];
  eq('a superseded relevant record outranks a current irrelevant one', searchGuidelines(mixed, 'ankle fractures').map((x) => x.id), ['zz-old-relevant']);
  check('publication year alone never changes the score', !searchIndex(index, 'hip fracture').some((r) => r.explanation.some((l) => /\b(19|20)\d\d\b/.test(l) && l.startsWith('Status'))));
}

// ─── 6. Determinism and robustness ──────────────────────────────────────────
console.log('\n[6] determinism and robustness');
{
  const a = ids('hip');
  const b = ids('hip');
  eq('same query, same order', a, b);
  const reversed = [...GUIDELINES_DATA].reverse();
  const c = searchGuidelines(reversed, 'hip').map((r) => r.id);
  eq('input order does not change ranking', c, a);
  const shuffled = [...GUIDELINES_DATA].sort((x, y) => (x.id.length - y.id.length) || (x.id < y.id ? 1 : -1));
  eq('another input order, same ranking', searchGuidelines(shuffled, 'osteoarthritis knee').map((r) => r.id), ids('osteoarthritis knee'));
  const sparse: SearchableRecord[] = [
    { id: 'a', topic: 'Hip fracture' },
    { id: 'b', topic: 'Hip fracture', summary: null, source: null, section: null, crossListedIn: null, subGroup: null, type: null, guidanceStatus: null, archived: null, priority: null },
    { id: 'c', topic: '' },
  ];
  const sr = searchGuidelines(sparse, 'hip fracture');
  eq('records with missing or null fields are searchable', sr.map((r) => r.id), ['a', 'b']);
  eq('unknown status is reported, not assumed', sr[0].status.guidanceStatus, 'unknown');
  check('limit is honoured', ids('fracture', 3).length === 3);
  check('ties break on the same fixed keys every time', JSON.stringify(ids('BOA')) === JSON.stringify(ids('BOA')));
}

// ─── 7. Legacy baseline replica ─────────────────────────────────────────────
console.log('\n[7] legacy replica');
{
  const q = 'ankle fract';
  const expected = GUIDELINES_DATA.filter((g) => g.topic.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q) || g.source.toLowerCase().includes(q)).map((g) => g.id);
  eq('legacySubstringSearch reproduces App.tsx filtering', legacySubstringSearch(GUIDELINES_DATA, q).map((g) => g.id), expected);
  eq('legacy empty query returns everything (the app shows all)', legacySubstringSearch(GUIDELINES_DATA, '').length, GUIDELINES_DATA.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
