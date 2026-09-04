/**
 * scripts/tests/providers.test.ts
 * ────────────────────────────────
 * Offline tests for src/lib/providers.ts — the canonical-provider rules moved
 * out of App.tsx, plus the provider -> URL map behind the clickable provider
 * tag on each guideline card.
 *
 * Pure-function tests only; no DOM or React renderer is available in this repo
 * (see review-candidates.test.ts for the same note). The card keeps the link
 * decision in providerUrl() specifically so it is testable without one.
 *
 * Run:   npx tsx scripts/tests/providers.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import {
  canonicalProvider,
  splitPublishers,
  providerUrl,
  PROVIDER_URLS,
} from '../../src/lib/providers';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';

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
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\n[1] canonicalProvider still applies the agreed rules after the move out of App.tsx');
eq('R1 first-listed publisher wins', canonicalProvider('BESS / BOA'), 'BESS');
eq('R1 holds for a three-way collaboration', canonicalProvider('GIRFT / BHS / BOA'), 'GIRFT');
eq('R2 acronym expansion collapses', canonicalProvider('BASS (British Association of Spine Surgeons)'), 'BASS');
eq('R3 series sub-brand collapses to parent', canonicalProvider('BOA (BOASt)'), 'BOA');
eq('R3 space-separated sub-brand collapses', canonicalProvider('BOA SpecS'), 'BOA');
eq('R4 parent-org parenthetical is dropped', canonicalProvider('GIRFT (NHS England)'), 'GIRFT');
eq('R5 trailing sub-report is dropped', canonicalProvider('GIRFT (NHS England) - Spinal Services'), 'GIRFT');
eq('R6 whole-string override wins', canonicalProvider('BASS / UKSSB'), 'UKSSB');
eq('NHFD is kept distinct from FFFAP', canonicalProvider('NHFD (RCP / FFFAP)'), 'NHFD');
eq('both FFFAP spellings converge', canonicalProvider('RCP (FFFAP)'), canonicalProvider('FFFAP (RCP)'));
eq('acronym inside brackets handled by alias', canonicalProvider('British Sarcoma Group (BSG)'), 'BSG');
eq('empty source is Unspecified', canonicalProvider(''), 'Unspecified');

console.log('\n[2] splitPublishers is unchanged by the move');
eq('splits on " / "', splitPublishers('GIRFT / BHS / BOA').length, 3);
eq('splits on " with "', splitPublishers('BOA (BOASt) with BOFAS').length, 2);
check('does not split inside a parenthetical',
  splitPublishers('NHFD (RCP / FFFAP)').length === 1,
  `got ${JSON.stringify(splitPublishers('NHFD (RCP / FFFAP)'))}`);
check('does not split on an ampersand inside a name',
  splitPublishers('BAJIS (Bone & Joint Infection Society)').length === 1);

console.log('\n[3] providerUrl resolves through the canonical label');
eq('NICE', providerUrl('NICE'), 'https://www.nice.org.uk/guidance');
eq('a BOA sub-brand resolves to the BOA entry', providerUrl('BOA (BOASt)'), PROVIDER_URLS['BOA']);
eq('a collaboration resolves to the first-listed publisher',
  providerUrl('BESS / BOA'), PROVIDER_URLS['BESS']);
eq('the UKSSB override resolves to UKSSB, not BASS',
  providerUrl('BASS / UKSSB'), PROVIDER_URLS['UKSSB']);
eq('an unknown provider yields null, so the tag renders as plain text',
  providerUrl('Some Society That Does Not Exist'), null);

console.log('\n[4] every URL in the map is a well-formed absolute https URL');
for (const [name, url] of Object.entries(PROVIDER_URLS)) {
  let ok = false;
  try {
    const u = new URL(url);
    ok = u.protocol === 'https:';
  } catch { ok = false; }
  check(`${name} -> ${url}`, ok);
}

console.log('\n[5] the map covers every provider present in the live dataset');
const uncovered = new Map<string, number>();
for (const g of GUIDELINES_DATA) {
  if (!providerUrl(g.source)) {
    const k = canonicalProvider(g.source);
    uncovered.set(k, (uncovered.get(k) ?? 0) + 1);
  }
}
check(
  `all ${GUIDELINES_DATA.length} records resolve to a provider link`,
  uncovered.size === 0,
  `unmapped: ${[...uncovered.keys()].join(', ')}`,
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
