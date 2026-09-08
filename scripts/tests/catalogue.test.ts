/**
 * scripts/tests/catalogue.test.ts
 * ───────────────────────────────
 * Offline tests for src/lib/catalogue.ts — the fixed provider → section →
 * title ordering behind the unlisted editorial catalogue view (#/catalogue).
 *
 * Pure-function tests only; no DOM or React renderer is available in this
 * repo (see review-candidates.test.ts for the same note). The view keeps all
 * its ordering logic in buildCatalogue() specifically so the ordering — the
 * part that actually has to be right for verification work — is testable
 * without one.
 *
 * The ordering is asserted directly rather than by eyeballing a rendered
 * page, because "spot-check three providers" is exactly the kind of manual
 * check that silently rots.
 *
 * Run:   npx tsx scripts/tests/catalogue.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { buildCatalogue, catalogueRowCount } from '../../src/lib/catalogue';
import { canonicalProvider } from '../../src/lib/providers';
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

function mk(id: string, source: string, section: string, topic: string): Guideline {
  return {
    id,
    section,
    topic,
    source,
    type: 'National guidance',
    summary: '',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    versions: [],
  };
}

function isSorted(xs: string[]): boolean {
  for (let i = 1; i < xs.length; i++) {
    if (xs[i - 1].localeCompare(xs[i]) > 0) return false;
  }
  return true;
}

console.log('\n[1] Fixture ordering — provider, then section, then title');
const fixture: Guideline[] = [
  mk('f1', 'NICE', 'Trauma', 'Zebra topic'),
  mk('f2', 'NICE', 'Trauma', 'Alpha topic'),
  mk('f3', 'NICE', 'Bone Health', 'Middle topic'),
  mk('f4', 'BOA (BOASt)', 'Spine', 'Only topic'),
  mk('f5', 'BESS / BOA', 'Knee', 'Collaboration topic'),
];
const built = buildCatalogue(fixture);
check('providers are alphabetical',
  isSorted(built.map(g => g.provider)),
  JSON.stringify(built.map(g => g.provider)));
const nice = built.find(g => g.provider === 'NICE')!;
check('sections within a provider are alphabetical',
  isSorted(nice.sections.map(s => s.section)),
  JSON.stringify(nice.sections.map(s => s.section)));
const niceTrauma = nice.sections.find(s => s.section === 'Trauma')!;
check('titles within a section are alphabetical',
  isSorted(niceTrauma.items.map(i => i.topic)),
  JSON.stringify(niceTrauma.items.map(i => i.topic)));

console.log('\n[2] Grouping uses the CANONICAL provider, not the raw source string');
check('"BOA (BOASt)" is grouped under BOA', built.some(g => g.provider === 'BOA'));
check('"BESS / BOA" is grouped under BESS (first-listed publisher wins)',
  built.some(g => g.provider === 'BESS'));
check('no raw collaboration string survives as its own group',
  !built.some(g => g.provider.includes('/')),
  JSON.stringify(built.map(g => g.provider)));

console.log('\n[3] Nothing is dropped or duplicated');
check('fixture row count is preserved', catalogueRowCount(built) === fixture.length,
  `expected ${fixture.length}, got ${catalogueRowCount(built)}`);
check('empty input yields no groups', buildCatalogue([]).length === 0);
check('provider.total matches its own section contents',
  built.every(g => g.total === g.sections.reduce((n, s) => n + s.items.length, 0)));

console.log('\n[4] A cross-listed row appears ONCE, under its primary section');
const crossListed: Guideline[] = [
  { ...mk('x1', 'NICE', 'Bone Health', 'Cross-listed topic'), crossListedIn: ['Older Adult', 'Trauma'] },
];
const xBuilt = buildCatalogue(crossListed);
check('one row in, one row out (not duplicated per cross-listed section)',
  catalogueRowCount(xBuilt) === 1, `got ${catalogueRowCount(xBuilt)}`);
check('placed under its primary section, not a cross-listed one',
  xBuilt[0].sections.length === 1 && xBuilt[0].sections[0].section === 'Bone Health',
  JSON.stringify(xBuilt[0].sections.map(s => s.section)));

console.log('\n[5] Against the LIVE dataset');
const live = buildCatalogue(GUIDELINES_DATA);
check(`every one of the ${GUIDELINES_DATA.length} live rows appears exactly once`,
  catalogueRowCount(live) === GUIDELINES_DATA.length,
  `expected ${GUIDELINES_DATA.length}, got ${catalogueRowCount(live)}`);
check('live providers are alphabetical', isSorted(live.map(g => g.provider)));
check('live sections are alphabetical within every provider',
  live.every(g => isSorted(g.sections.map(s => s.section))));
check('live titles are alphabetical within every section',
  live.every(g => g.sections.every(s => isSorted(s.items.map(i => i.topic)))));
check('every live group key is a canonical provider name',
  live.every(g => g.sections.every(s => s.items.every(i => canonicalProvider(i.source) === g.provider))));
check('live grouping collapses to far fewer groups than raw source strings',
  live.length < new Set(GUIDELINES_DATA.map(g => g.source)).size,
  `${live.length} canonical vs ${new Set(GUIDELINES_DATA.map(g => g.source)).size} raw`);

console.log('\n[6] Determinism');
const a = JSON.stringify(buildCatalogue(GUIDELINES_DATA).map(g => [g.provider, g.sections.map(s => s.section)]));
const b = JSON.stringify(buildCatalogue(GUIDELINES_DATA).map(g => [g.provider, g.sections.map(s => s.section)]));
check('two runs over the same input produce identical ordering', a === b);

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
