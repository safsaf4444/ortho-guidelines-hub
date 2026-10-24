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

// Seventh member added 2026-10-24, deliberately: POSSIBLE_SAME_DOCUMENT, so a
// loose-only URL match is shown to a reviewer instead of silently counted as
// catalogued. See the ChangeReason doc comment.
eq('vocabulary is exactly the agreed seven, in order', ALL_CHANGE_REASONS, [
  'NEW_GUIDELINE',
  'REVISED',
  'WITHDRAWN',
  'CONTENT_DRIFT',
  'URL_MOVED',
  'UNREACHABLE_LINK',
  'POSSIBLE_SAME_DOCUMENT',
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

// ── SER-6 follow-up: strip only the `ver` cache-busting parameter ───────────
// BOFAS's DNN CMS appends `?ver=<token>` to every document link, changing on
// every republish with no change to the document — this made every BOFAS
// Publications item match as "new" on every sync run. The fix must be narrow:
// strip `ver` only, leave every other query parameter, fragment, and the
// NHFD-style `?open&<filename>` identity completely untouched.

eq(
  'BOFAS: URL with ?ver= matches the equivalent URL without it',
  normaliseCandidateUrl('https://www.bofas.org.uk/Portals/0/Position%20Statements/FAME%20STUDY%20POSITION%20STATEMENT.pdf?ver=AdqcljKluax_khQUqZhiwg%3d%3d'),
  normaliseCandidateUrl('https://www.bofas.org.uk/Portals/0/Position%20Statements/FAME%20STUDY%20POSITION%20STATEMENT.pdf'),
);
eq(
  'BOFAS: ver stripping is case-insensitive (VER=, Ver=)',
  normaliseCandidateUrl('https://www.bofas.org.uk/a.pdf?VER=xyz'),
  normaliseCandidateUrl('https://www.bofas.org.uk/a.pdf?Ver=xyz'),
);
eq(
  'ver-only query string is removed cleanly, no dangling "?"',
  normaliseCandidateUrl('https://www.bofas.org.uk/a.pdf?ver=xyz'),
  'https://www.bofas.org.uk/a.pdf',
);
eq(
  'a meaningful non-ver query parameter is preserved, not stripped',
  normaliseCandidateUrl('https://www.nature.com/articles/x?sharing_token=ABC123'),
  'https://www.nature.com/articles/x?sharing_token=abc123',
);
check(
  'a URL differing ONLY by a real (non-ver) query parameter still normalises distinctly',
  normaliseCandidateUrl('https://www.nature.com/articles/x?sharing_token=ABC123')
    !== normaliseCandidateUrl('https://www.nature.com/articles/x?sharing_token=DEF456'),
);
eq(
  'ver stripped alongside a real query parameter — the real one survives',
  normaliseCandidateUrl('https://www.bofas.org.uk/a.pdf?ver=xyz&edition=2'),
  'https://www.bofas.org.uk/a.pdf?edition=2',
);
eq(
  'a URL fragment survives ver stripping untouched',
  normaliseCandidateUrl('https://www.bofas.org.uk/a.pdf?ver=xyz#section2'),
  'https://www.bofas.org.uk/a.pdf#section2',
);
eq(
  'NHFD doc?open& identity is unaffected by the ver fix (no ver param present)',
  normaliseCandidateUrl('https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Sheffield,+Pathway.pdf'),
  'https://www.nhfd.co.uk/fffap/resources.nsf/doc?open&sheffield,+pathway.pdf',
);
eq(
  'BOA asset URLs (no query string at all) are unaffected by the ver fix',
  normaliseCandidateUrl('https://www.boa.ac.uk/asset/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/'),
  'https://www.boa.ac.uk/asset/f8b1c499-c38a-4805-8cb8d8eb3087bca7',
);
eq(
  'a non-parseable/relative input is returned unchanged by the strip step, same as before',
  normaliseCandidateUrl('  /relative/path/A/  '),
  '/relative/path/a',
);

// ── Document-key vectors shared with the SQL mirror ─────────────────────────
// The same file is asserted against public.document_match_key and
// public.document_identity_key by
// scripts/tests/integration/discovery-queue.local.test.ts. Expected values are
// pinned here, not merely "TS equals SQL", so a change to both sides that
// agrees with itself but moves the key still fails.
{
  const { readFileSync } = await import('node:fs');
  const vectorFile = JSON.parse(
    readFileSync(new URL('./fixtures/url-key-vectors.json', import.meta.url), 'utf-8'),
  ) as { vectors: Array<{ why: string; input: string; match: string; identity: string }> };
  const { documentIdentityKey } = await import('../lib/ingestion');
  check('url-key vectors file is non-trivial', vectorFile.vectors.length >= 60, String(vectorFile.vectors.length));
  for (const v of vectorFile.vectors) {
    eq(`match key: ${v.why}`, normaliseCandidateUrl(v.input), v.match);
    eq(`identity key: ${v.why}`, documentIdentityKey(v.input), v.identity);
  }
  for (const v of vectorFile.vectors) {
    check(`keys are idempotent: ${v.why}`,
      normaliseCandidateUrl(v.match) === v.match && documentIdentityKey(v.identity) === v.identity,
      `${normaliseCandidateUrl(v.match)} | ${documentIdentityKey(v.identity)}`);
    // Identity is never looser than matching: same identity => same match key.
    check(`identity refines match: ${v.why}`, normaliseCandidateUrl(v.identity) === v.match,
      `${normaliseCandidateUrl(v.identity)} vs ${v.match}`);
  }
  // The point of the split: distinct documents that the loose key merges.
  for (const [a, b] of [
    ['https://example.org/Docs/A.pdf', 'https://example.org/docs/a.pdf'],
    ['https://www.nature.com/articles/x?sharing_token=ABC123', 'https://www.nature.com/articles/x?sharing_token=abc123'],
    ['https://example.org/app#/Doc/1', 'https://example.org/app#/doc/1'],
    ['https://example.org/a?path=/docs/', 'https://example.org/a?path=/docs'],
  ]) {
    check(`same match key, DIFFERENT identity: ${a} vs ${b}`,
      normaliseCandidateUrl(a) === normaliseCandidateUrl(b) && documentIdentityKey(a) !== documentIdentityKey(b));
  }
  // And the documented merges, and only those, still merge.
  for (const [why, a, b] of [
    ['ver token', 'https://www.bofas.org.uk/Portals/0/A.pdf?ver=ONE', 'https://www.bofas.org.uk/Portals/0/A.pdf?ver=TWO'],
    ['trailing path slash', 'https://www.boa.ac.uk/asset/X/', 'https://www.boa.ac.uk/asset/X'],
    ['host case', 'https://WWW.BOFAS.org.uk/Portals/0/A.pdf', 'https://www.bofas.org.uk/Portals/0/A.pdf'],
    ['percent-escape hex case', 'https://example.org/a%3db', 'https://example.org/a%3Db'],
  ]) {
    check(`documented identity merge (${why})`, documentIdentityKey(a) === documentIdentityKey(b));
  }
}

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

console.log('\n[5b] Producer matching: identity decides "catalogued"; loose-only needs comparison');
{
  const { GUIDELINES_DATA } = await import('../../src/data/guidelines-data');
  const entryOf = (pred: (u: string) => boolean) => {
    for (const g of GUIDELINES_DATA) for (const v of g.versions) if (v.url && pred(v.url)) return { id: g.id, url: v.url };
    throw new Error('fixture URL not found in the catalogue');
  };
  const pathCase = entryOf((u) => /^https:\/\/[^?#]*\/[^?#]*[A-Z]/.test(u) && !u.includes('?'));
  const queryCase = entryOf((u) => /\?[^#]*[A-Z]/.test(u));
  const hostVariant = pathCase.url.replace(/^https:\/\/([^/]+)/, (_m, h: string) => `HTTPS://${h.toUpperCase()}`) + '/?ver=Z';
  const items: DiscoveredItem[] = [
    { topic: 'exact', source: 'BOA', versions: [{ label: 'L', url: pathCase.url }] },
    { topic: 'host case + slash + ver', source: 'BOA', versions: [{ label: 'L', url: hostVariant }] },
    { topic: 'path case', source: 'BOA', versions: [{ label: 'L', url: pathCase.url.replace(/\/([^/]*)$/, (_m, last: string) => `/${last.toLowerCase()}`) }] },
    { topic: 'query case', source: 'BOA', versions: [{ label: 'L', url: queryCase.url.toLowerCase() }] },
    { topic: 'new', source: 'BOA', versions: [{ label: 'L', url: 'https://www.boa.ac.uk/asset/NOT-IN-CATALOGUE-5B/' }] },
  ];
  const [m] = await runDryRun([stubAdapter(items)]);
  eq('exact and RFC/ver/slash-equivalent links are catalogued, not candidates', m.matchedExisting, 2);
  eq('two loose-only matches require comparison', m.requiresComparison, 2);
  eq('classes, in order', m.candidates.map((c) => c.changeReason), ['POSSIBLE_SAME_DOCUMENT', 'POSSIBLE_SAME_DOCUMENT', 'NEW_GUIDELINE']);
  eq('comparisons name the matched entries', m.candidates.slice(0, 2).map((c) => c.matchedGuidelineId), [pathCase.id, queryCase.id]);
  check('…with the catalogue link verbatim and a reason', m.candidates.slice(0, 2).every((c) => c.documentComparison?.catalogueUrl
    && c.documentComparison.basis === 'match-key-only' && /letter case/.test(c.documentComparison.reason)));
  eq('only the genuinely new item is in the legacy newCandidates list', m.newCandidates.map((c) => c.topic), ['new']);
  eq('coverage still balances', summariseReport(m).balanced, true);
}

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
eq('schema version (v2: POSSIBLE_SAME_DOCUMENT + documentComparison)', CANDIDATE_SCHEMA_VERSION, 2);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
