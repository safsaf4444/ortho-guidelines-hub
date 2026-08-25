/**
 * scripts/tests/ingestion.test.ts
 * ───────────────────────────────
 * Offline tests for the shared ingestion contract (scripts/lib/ingestion.ts)
 * and the sync-providers diff engine.
 *
 * OFFLINE BY CONSTRUCTION: every adapter here is a stub, so no network request
 * is ever made. runDryRun() reads only src/data/guidelines-data.ts and
 * scripts/blocked-sources.json from disk and writes nothing — the sole write in
 * sync-providers.ts (candidates.json) sits behind its isMain check, which does
 * not trigger on import. The test asserts that non-write at the end.
 *
 * Run:   npx tsx scripts/tests/ingestion.test.ts        (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 *
 * No test framework by design — the repo has none, and these are plain
 * pass/fail scripts in the same style as the other scripts/ entry points.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { DiscoveredItem, ProviderAdapter } from '../lib/provider-adapter';
import type { CandidateReport } from '../lib/ingestion';

// candidates.json is snapshotted BEFORE sync-providers.ts is imported, so the
// final assertion covers module import as well as the sweeps below. That is why
// the imports of the code under test are dynamic.
const OUT = join(process.cwd(), 'candidates.json');
const outBefore = existsSync(OUT) ? statSync(OUT).mtimeMs : null;

const {
  ALL_CHANGE_REASONS,
  CANDIDATE_SCHEMA_VERSION,
  canonicalProviderKey,
  makeCandidateId,
  summariseReport,
} = await import('../lib/ingestion');
const { runDryRun } = await import('../sync-providers');
const { GUIDELINES_DATA } = await import('../../src/data/guidelines-data');

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
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

// A URL that is definitely already in the catalogue, taken from the real data
// so the "matched" path is exercised against genuine content.
const KNOWN_URL: string = GUIDELINES_DATA[0].versions[0].url;

// gettingitrightfirsttime.co.uk is in scripts/blocked-sources.json.
const BLOCKED_URL = 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2024/01/made-up.pdf';

const NEW_URL_A = 'https://www.boa.ac.uk/asset/TEST-PHASE1-AAAA/';
const NEW_URL_B = 'https://www.boa.ac.uk/asset/TEST-PHASE1-BBBB';

const stubAdapter = (items: DiscoveredItem[]): ProviderAdapter => ({
  name: 'Stub Provider (offline)',
  sourceTag: 'BOA',
  async fetchCandidates() {
    return items;
  },
});

const ITEMS: DiscoveredItem[] = [
  { topic: 'Already catalogued item', source: 'BOA', versions: [{ label: 'BOASt PDF', url: KNOWN_URL }] },
  { topic: 'Blocked host item', source: 'BOA', versions: [{ label: 'BOASt PDF', url: BLOCKED_URL }] },
  { topic: 'Brand new item A', source: 'BOA', versions: [{ label: 'BOASt PDF', url: NEW_URL_A }] },
  {
    topic: 'Brand new item B',
    source: 'BOA',
    summary: 'Verbatim provider summary.',
    versions: [{ label: 'Source Link', url: NEW_URL_B, date: 'Mon, 04 Aug 2025 09:00:00 GMT' }],
  },
];

console.log(`Catalogue: ${GUIDELINES_DATA.length} guidelines. Known URL under test: ${KNOWN_URL}`);

// ── 1. Change-reason vocabulary ─────────────────────────────────────────────
// The agreed category set for the ingestion roadmap. A member appearing or
// disappearing should fail loudly here, not surface later in a review queue.

console.log('\n[1] Change-reason vocabulary');

eq('vocabulary is exactly the agreed six, in order', ALL_CHANGE_REASONS, [
  'NEW_GUIDELINE',
  'REVISED',
  'WITHDRAWN',
  'CONTENT_DRIFT',
  'URL_MOVED',
  'UNREACHABLE_LINK',
]);
check('retired LINK_ROT is gone', !(ALL_CHANGE_REASONS as readonly string[]).includes('LINK_ROT'));
check('retired METADATA_ONLY is gone', !(ALL_CHANGE_REASONS as readonly string[]).includes('METADATA_ONLY'));

// Every member must slug cleanly into a candidate ID.
for (const reason of ALL_CHANGE_REASONS) {
  const id = makeCandidateId({ pipeline: 'sync-providers', provider: 'BOA', changeReason: reason, primaryUrl: NEW_URL_A });
  const expectedSlug = reason.toLowerCase().replace(/_/g, '-');
  check(`ID for ${reason} carries slug '${expectedSlug}'`, id.startsWith(`boa-${expectedSlug}-`), id);
}

// ── 2. Pure helpers ─────────────────────────────────────────────────────────

console.log('\n[2] Pure helpers');

const { normaliseCandidateUrl } = await import('../lib/ingestion');

eq('normalise lowercases + strips trailing slash', normaliseCandidateUrl('HTTPS://X.AC.UK/A/'), 'https://x.ac.uk/a');
eq('normalise strips repeated trailing slashes', normaliseCandidateUrl('https://x.ac.uk/a///'), 'https://x.ac.uk/a');
eq('normalise trims whitespace', normaliseCandidateUrl('  https://x.ac.uk/a  '), 'https://x.ac.uk/a');
eq(
  'normalise PRESERVES query string (nhfd doc?open& identity)',
  normaliseCandidateUrl('https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Sheffield,+Pathway.pdf'),
  'https://www.nhfd.co.uk/fffap/resources.nsf/doc?open&sheffield,+pathway.pdf',
);

const idArgs = {
  pipeline: 'sync-providers',
  provider: 'BOA',
  changeReason: 'NEW_GUIDELINE',
  primaryUrl: NEW_URL_A,
} as const;
const id1 = makeCandidateId(idArgs);
const id2 = makeCandidateId(idArgs);
check('candidate ID is deterministic across calls', id1 === id2, `${id1} vs ${id2}`);
check('candidate ID has readable prefix', id1.startsWith('boa-new-guideline-'), id1);
check('candidate ID hash is 12 hex chars', /^boa-new-guideline-[0-9a-f]{12}$/.test(id1), id1);
check(
  'candidate ID is invariant to URL casing/trailing slash',
  makeCandidateId({ ...idArgs, primaryUrl: 'HTTPS://WWW.BOA.AC.UK/asset/TEST-PHASE1-AAAA' }) === id1,
);
check('different URL yields a different ID', makeCandidateId({ ...idArgs, primaryUrl: NEW_URL_B }) !== id1);
check('different changeReason yields a different ID', makeCandidateId({ ...idArgs, changeReason: 'WITHDRAWN' }) !== id1);
check('different pipeline yields a different ID', makeCandidateId({ ...idArgs, pipeline: 'flag-dead-links' }) !== id1);

// ── Provider-label canonicalisation ─────────────────────────────────────────
// The stated guarantee: two labels yield the same ID iff their lowercased
// ASCII-alphanumeric subsequences match. Case, whitespace and punctuation are
// erased; letters and digits are not. Both the hash and the visible prefix
// derive from that one key, so invariance holds for the WHOLE id string.

const withProvider = (p: string) => makeCandidateId({ ...idArgs, provider: p });

eq('key: plain', canonicalProviderKey('BOA'), 'boa');
eq('key: dotted', canonicalProviderKey('B.O.A.'), 'boa');
eq('key: spaced', canonicalProviderKey('B O A'), 'boa');
eq('key: padded', canonicalProviderKey('  boa  '), 'boa');
eq('key: multi-word separators erased', canonicalProviderKey('GIRFT / BSSH'), 'girftbssh');
eq('key: digits preserved', canonicalProviderKey('List 2'), 'list2');

for (const [label, variant] of [
  ['lowercase', 'boa'],
  ['trailing space', 'BOA '],
  ['leading space', ' BOA'],
  ['surrounding whitespace', '  BOA  '],
  ['inner tab/newline padding', '\tBOA\n'],
  ['trailing punctuation', 'BOA.'],
  ['wrapping punctuation', '(BOA)'],
  ['leading + trailing hyphen', '-BOA-'],
  ['dotted (B.O.A.)', 'B.O.A.'],
  ['hyphenated (B-O-A)', 'B-O-A'],
  ['inner spaces (B O A)', 'B O A'],
  ['mixed case + dots (b.O.a.)', 'b.O.a.'],
  ['underscores (B_O_A)', 'B_O_A'],
] as const) {
  eq(`ID invariant to provider ${label}`, withProvider(variant), id1);
}

const spaced = withProvider('GIRFT / BSSH');
eq('ID invariant to inner punctuation ("GIRFT / BSSH" vs "GIRFT/BSSH")', withProvider('GIRFT/BSSH'), spaced);
eq('...and vs "GIRFT  -  BSSH"', withProvider('GIRFT  -  BSSH'), spaced);
eq('...and vs "girft bssh"', withProvider('girft bssh'), spaced);
check('multi-word provider key reaches the prefix', spaced.startsWith('girftbssh-new-guideline-'), spaced);

// Must NOT over-merge: any alphanumeric difference still yields a distinct ID.
check('different provider still differs (BESS)', withProvider('BESS') !== id1);
check('one extra letter still differs (BOAS)', withProvider('BOAS') !== id1);
check('one fewer letter still differs (BO)', withProvider('BO') !== id1);
check('digit difference still differs (BOA2)', withProvider('BOA2') !== id1);
check('GIRFT/BSSH is not GIRFT/BOA', withProvider('GIRFT/BOA') !== spaced);

// Documented limitation, pinned so it cannot regress unnoticed: non-ASCII
// characters are DROPPED rather than transliterated, so 'BOÁ' collapses to 'bo'
// and collides with 'BO'. All current provider tags are ASCII.
eq('known limitation: non-ASCII dropped, not transliterated', canonicalProviderKey('BOÁ'), 'bo');
eq('known limitation: BOÁ collides with BO', withProvider('BOÁ'), withProvider('BO'));

check('prefix matches hashed provider (plain)', id1.startsWith('boa-'), id1);
check('prefix matches hashed provider (padded input)', withProvider('  BOA  ').startsWith('boa-'));
check('prefix matches hashed provider (dotted input)', withProvider('B.O.A.').startsWith('boa-'));

// summariseReport coverage arithmetic.
const balanced: CandidateReport = {
  pipeline: 'sync-providers',
  adapter: 'x',
  provider: 'BOA',
  generatedAt: 'now',
  totalDiscovered: 4,
  matchedExisting: 1,
  skippedBlocked: 1,
  candidates: [{} as never, {} as never],
};
eq('summariseReport balances', summariseReport(balanced), { accountedFor: 4, unaccountedFor: 0, balanced: true });
eq(
  'summariseReport detects a shortfall',
  summariseReport({ ...balanced, totalDiscovered: 7 }),
  { accountedFor: 4, unaccountedFor: 3, balanced: false },
);

// ── 3. Diff engine end to end (offline) ─────────────────────────────────────

console.log('\n[3] runDryRun with a stub adapter');

const reports = await runDryRun([stubAdapter(ITEMS)]);
eq('one report per adapter', reports.length, 1);

const r = reports[0];
eq('totalDiscovered', r.totalDiscovered, 4);
eq('matchedExisting', r.matchedExisting, 1);
eq('skippedBlocked', r.skippedBlocked, 1);
eq('candidates', r.candidates.length, 2);
eq('coverage balanced', summariseReport(r).balanced, true);
eq('pipeline tag', r.pipeline, 'sync-providers');
eq('provider tag', r.provider, 'BOA');
check('generatedAt is ISO-8601', !Number.isNaN(Date.parse(r.generatedAt)), r.generatedAt);
check('no error on a clean run', r.error === undefined);

console.log('\n[4] Backward compatibility');
eq('legacy newCandidates still present, same length', r.newCandidates.length, r.candidates.length);
eq(
  'legacy newCandidates unchanged shape (raw DiscoveredItem)',
  r.newCandidates[0],
  { topic: 'Brand new item A', source: 'BOA', versions: [{ label: 'BOASt PDF', url: NEW_URL_A }] },
);
check('legacy adapter field retained', r.adapter === 'Stub Provider (offline)');

console.log('\n[5] Candidate record contents');
const a = r.candidates[0];
const b = r.candidates[1];

eq('changeReason', a.changeReason, 'NEW_GUIDELINE');
eq('reviewStatus', a.reviewStatus, 'pending');
eq('matchedGuidelineId null for NEW_GUIDELINE', a.matchedGuidelineId, null);
eq('providerRef null in phase 1', a.providerRef, null);
eq('topic is verbatim', a.topic, 'Brand new item A');
eq('primaryUrl is normalised', a.primaryUrl, 'https://www.boa.ac.uk/asset/test-phase1-aaaa');
eq('versions[].url is NOT normalised (carried verbatim)', a.versions[0].url, NEW_URL_A);
check('summary omitted when provider gave none', !('summary' in a));
eq('summary carried verbatim when present', b.summary, 'Verbatim provider summary.');
eq('date carried through', b.versions[0].date, 'Mon, 04 Aug 2025 09:00:00 GMT');
check('providerName set', a.providerName === 'Stub Provider (offline)');
eq(
  'candidateId matches the standalone helper',
  a.candidateId,
  makeCandidateId({ pipeline: 'sync-providers', provider: 'BOA', changeReason: 'NEW_GUIDELINE', primaryUrl: NEW_URL_A }),
);
check('candidateIds are distinct', a.candidateId !== b.candidateId);

// The BOA pilot's known-good ID. If this changes, ID determinism broke — or the
// hash inputs were edited without realising IDs are meant to survive resweeps.
eq('pinned: known BOA candidate ID unchanged', b.candidateId, 'boa-new-guideline-c141ecca0b7f');

console.log('\n[6] Determinism across runs');
const rerun = await runDryRun([stubAdapter(ITEMS)]);
eq(
  'candidateIds stable across a second sweep',
  rerun[0].candidates.map((c) => c.candidateId),
  r.candidates.map((c) => c.candidateId),
);

console.log('\n[7] Adapter failure is recorded, not silently dropped');
const boom: ProviderAdapter = {
  name: 'Exploding adapter',
  sourceTag: 'BOA',
  async fetchCandidates(): Promise<DiscoveredItem[]> {
    throw new Error('HTTP 503 fetching index');
  },
};
const failReports = await runDryRun([boom]);
eq('failed adapter still produces a report', failReports.length, 1);
eq('error captured', failReports[0].error, 'HTTP 503 fetching index');
eq('failed adapter yields zero candidates', failReports[0].candidates.length, 0);

console.log('\n[8] No stray writes');
const outAfter = existsSync(OUT) ? statSync(OUT).mtimeMs : null;
eq('candidates.json untouched by import + 3 sweeps', outAfter, outBefore);
eq('schema version', CANDIDATE_SCHEMA_VERSION, 1);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
