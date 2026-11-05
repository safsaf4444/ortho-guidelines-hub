/**
 * scripts/tests/search-benchmark.test.ts
 * ──────────────────────────────────────
 * Guards the offline retrieval benchmark (scripts/lib/search-benchmark.ts):
 * the fixture only names real catalogue ids, the v2 engine never does worse
 * than the legacy substring search on any headline metric, specific floors
 * hold, and the benchmark is deterministic.
 *
 * The floors are deliberately BELOW today's measured numbers so that honest
 * terminology or ranking changes do not fail the suite for a one-point move;
 * they exist to catch regressions, not to pin the engine to this fixture.
 *
 * NO NETWORK. Run:   npx tsx scripts/tests/search-benchmark.test.ts
 */
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import { loadFixture, runBenchmark, scoreBenchmarkQuery } from '../lib/search-benchmark';

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

const fixture = loadFixture();
const known = new Set(GUIDELINES_DATA.map((g) => g.id));

console.log('\n[1] fixture integrity');
{
  const bad = fixture.queries.flatMap((q) => q.expected.filter((id) => !known.has(id)).map((id) => `${q.id}:${id}`));
  check('every expected id exists in the catalogue', bad.length === 0, bad.join(', '));
  const qids = fixture.queries.map((q) => q.id);
  check('query ids are unique', new Set(qids).size === qids.length);
  check('at least 40 queries', fixture.queries.length >= 40, String(fixture.queries.length));
  const cats = new Set(fixture.queries.map((q) => q.category));
  for (const c of ['exact-title', 'abbreviation', 'synonym', 'word-order', 'typo', 'provider', 'ambiguous', 'status', 'no-result', 'empty']) {
    check(`category present: ${c}`, cats.has(c));
  }
}

const { legacy, v2 } = runBenchmark(GUIDELINES_DATA, fixture);

console.log('\n[2] v2 is never worse than legacy');
check('top-1 accuracy', v2.top1Accuracy >= legacy.top1Accuracy, `${v2.top1Accuracy} vs ${legacy.top1Accuracy}`);
check('recall@5', v2.recallAt5 >= legacy.recallAt5, `${v2.recallAt5} vs ${legacy.recallAt5}`);
check('MRR', v2.meanReciprocalRank >= legacy.meanReciprocalRank, `${v2.meanReciprocalRank} vs ${legacy.meanReciprocalRank}`);
check('no-result and empty queries', v2.noResultCorrect >= legacy.noResultCorrect);
for (const [cat, c] of Object.entries(v2.perCategory)) {
  const l = legacy.perCategory[cat];
  check(`category ${cat}: MRR not below legacy`, !l || c.mrr >= l.mrr, `${c.mrr} vs ${l?.mrr}`);
}

console.log('\n[3] absolute floors');
check('top-1 accuracy ≥ 0.85', v2.top1Accuracy >= 0.85, String(v2.top1Accuracy));
// Retain the author's numeric floor on its actual capacity-normalized metric;
// true recall is reported independently and still must not trail legacy.
check('historical capacity-normalized @5 ≥ 0.85', v2.capacityNormalizedRecallAt5 >= 0.85, String(v2.capacityNormalizedRecallAt5));
check('MRR ≥ 0.90', v2.meanReciprocalRank >= 0.9, String(v2.meanReciprocalRank));
check('every no-result and empty query returns nothing', v2.noResultCorrect === v2.noResultQueries, `${v2.noResultCorrect}/${v2.noResultQueries}`);
check('status queries keep non-current guidance findable (recall@5 = 1)', v2.perCategory['status']?.recallAt5 === 1);
const metric=scoreBenchmarkQuery({id:'metric',query:'synthetic',category:'math',expected:['a','b','c','d','e','f'],evidence:'Synthetic metric control'},['a','b','c','d','e']);
check('true recall accounts for all relevant records, not only five slots',metric.recallAt5===5/6&&metric.capacityNormalizedRecallAt5===1);
const short=scoreBenchmarkQuery({id:'short',query:'synthetic',category:'math',expected:['a'],evidence:'Synthetic metric control'},['a']);
check('precision@5 uses five slots and labels returned-only precision separately',short.precisionAt5===1/5&&short.precisionAmongReturnedAt5===1);

console.log('\n[4] determinism');
{
  const again = runBenchmark(GUIDELINES_DATA, fixture);
  check('identical outcomes on a second run', JSON.stringify(again.v2.outcomes) === JSON.stringify(v2.outcomes));
  const reversed = runBenchmark([...GUIDELINES_DATA].reverse(), fixture);
  check('identical v2 ranking with reversed catalogue order', JSON.stringify(reversed.v2.outcomes.map((o) => o.results)) === JSON.stringify(v2.outcomes.map((o) => o.results)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
