/**
 * SAF-5/SAF-23: offline v4 relationships and BOA reconciliation.
 * Called by ingestion.test.ts, so npm run test:offline always runs these checks.
 * No publisher HTML, fabricated asset IDs, SQL execution or database access.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as v3 from './fixtures/url-key-v3-historical';
import {
  normaliseCandidateUrl as match,
  documentIdentityKey as identity,
  decodeUnreservedEscapes as decode,
  makeCandidateId,
} from '../lib/ingestion';
import { loadCatalogueIndex, parseBoaIndex, runDryRun } from '../sync-providers';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';

type Check = (name: string, condition: boolean, detail?: string) => void;
// The prior digest included a second EOF newline. The current fixture retains
// one final newline; its implementation was checked against the caf34be source
// and the documented excerpt digest 8c669fd9… before updating this file digest.
const V3_FIXTURE_SHA256 = 'e69b9e67e5bfc4ec188545fa3853d7acbbf416d5fccbb3db502ab4117159be4a';

export async function runUrlKeyV4Regressions(check: Check): Promise<void> {
  // Relations exercise adjacent escapes, byte case, query ordering and reserved
  // delimiters together, rather than another isolated-byte implementation test.
  const pairs = [
    ['repeated/mixed unreserved', 'https://example.org/%41%41%2d%2D%7e%5F%30', 'https://example.org/AA--~_0'],
    ['query names, values and fragment', 'https://example.org/a?%71=%41%2d%41#%7e%5F', 'https://example.org/a?q=A-A#~_'],
    ['repeated encoded ver removed before keying', 'https://example.org/a?%76er=1&x=%41&V%45%52=2&x=%42', 'https://example.org/a?x=A&x=B'],
    ['encoded query delimiter remains data', 'https://example.org/a?x=%26%76er%3d1', 'https://example.org/a?x=%26ver%3D1'],
    ['decoded dots preserve path boundaries', 'https://example.org/a/%2e%2E/b', 'https://example.org/a/../b'],
  ];
  for (const [name, escaped, literal] of pairs) {
    check(name + ': match equivalence', match(escaped) === match(literal));
    check(name + ': identity equivalence', identity(escaped) === identity(literal));
  }
  for (const [name, left, right] of [
    ['encoded slash boundary', 'https://example.org/a%2F%41', 'https://example.org/a/A'],
    ['encoded query injection', 'https://example.org/a?x=1%26%76er%3D2', 'https://example.org/a?x=1&ver=2'],
    ['encoded fragment boundary', 'https://example.org/a%23%41', 'https://example.org/a#A'],
    ['query ordering retained', 'https://example.org/a?x=%41&x=%42', 'https://example.org/a?x=B&x=A'],
    ['double encoding is not recursively decoded', 'https://example.org/%2541%252D', 'https://example.org/A-'],
    ['decoded dot segments are not resolved', 'https://example.org/a/%2e%2e/b', 'https://example.org/b'],
  ]) {
    check(name + ': match stays distinct', match(left) !== match(right));
    check(name + ': identity stays distinct', identity(left) !== identity(right));
  }
  // RFC 3986 section 2.2: cover every reserved delimiter, not just / ? # & =.
  for (const reserved of ":/?#[]@!$&'()*+,;=") {
    const hex = reserved.charCodeAt(0).toString(16);
    const escapedUrl = 'https://example.org/x%' + hex + 'y';
    const literalUrl = 'https://example.org/x' + reserved + 'y';
    check('RFC reserved delimiter remains distinct in both keys: ' + reserved,
      match(escapedUrl) !== match(literalUrl) && identity(escapedUrl) !== identity(literalUrl));
  }
  for (const malformed of ['%%34%31', '%2%46%41', '%zz%41%2D%', '%4%31%7e']) {
    const once = decode(malformed);
    check('decoder fixpoint with adjacent malformed escapes: ' + malformed, decode(once) === once);
    const url = 'https://example.org/' + malformed + '?x=%41#%7e';
    check('both key fixpoints with malformed path: ' + malformed,
      match(match(url)) === match(url) && identity(identity(url)) === identity(url));
  }
  const id = (url: string) => makeCandidateId({
    pipeline: 'sync-providers', provider: 'BOA', changeReason: 'NEW_GUIDELINE', primaryUrl: url,
  });
  check('equivalent unreserved spellings share candidate id', id(pairs[0][1]) === id(pairs[0][2]));
  check('reserved slash spellings do not collide in candidate ids',
    id('https://example.org/a%2Fb') !== id('https://example.org/a/b'));
  check('case-only identity collision stays visible despite shared candidate id',
    id('https://example.org/%41') === id('https://example.org/a')
    && identity('https://example.org/%41') !== identity('https://example.org/a'));

  // Exact recorded evidence: the shared fixture explicitly labels the escaped
  // BOA URL as observed in the 2026-11-04 dry run. Its literal counterpart is
  // independently present in the committed catalogue. Do not extrapolate 13
  // distinct affected items or 18/25 -> 31/12 from this single observation.
  const vectors = (JSON.parse(readFileSync(new URL('./fixtures/url-key-vectors.json', import.meta.url), 'utf8')) as {
    vectors: Array<{ why: string; input: string; match: string; identity: string }>;
  }).vectors;
  const escaped = vectors.find(v => v.input === 'https://www.boa.ac.uk/asset/a811fc01%2defc3%2d44b7%2dbf6c4b0d4d4c2c85');
  const literal = 'https://www.boa.ac.uk/asset/A811FC01-EFC3-44B7-BF6C4B0D4D4C2C85/';
  const entry = GUIDELINES_DATA.find(g => g.versions.some(v => v.url === literal));
  if (!escaped || !entry) {
    check('documented BOA fixture and independent catalogue evidence exist', false);
    return;
  }
  check('BOA evidence explicitly records observed dry-run provenance', escaped.why.includes('2026-11-04 dry run'));
  const index = loadCatalogueIndex(GUIDELINES_DATA);
  check('v4 BOA loose match points to real catalogue entry',
    index.byMatch.get(match(escaped.input))?.some(link => link.guidelineId === entry.id) === true);
  check('BOA case difference does not become exact identity', !index.byIdentity.has(identity(escaped.input)));

  // Exact historical excerpt, vendored and hash-pinned for shallow/CI checkouts.
  // EOL-only conversion is harmless; any other change requires source review.
  const frozen = readFileSync(new URL('./fixtures/url-key-v3-historical.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('historical v3 fixture retains reviewed source bytes (LF-normalised)',
    createHash('sha256').update(frozen).digest('hex') === V3_FIXTURE_SHA256);
  const v3Keys = new Set(GUIDELINES_DATA.flatMap(g => g.versions.map(v => v3.normaliseCandidateUrl(v.url))));
  check('real v3 misses documented escaped BOA URL', !v3Keys.has(v3.normaliseCandidateUrl(escaped.input)));
  check('real v3 still matches unchanged catalogue BOA URL', v3Keys.has(v3.normaliseCandidateUrl(literal)));
  check('v3/v4 identity unchanged for literal BOA asset', v3.documentIdentityKey(literal) === identity(literal));

  // Tiny authored markup, not copied publisher HTML. Both URLs below are
  // evidenced above; the real parser preserves the observed encoded source URL.
  // PR #325 requires a list directly after a section heading. This authored
  // wrapper supplies parser structure; the URL/topic evidence is unchanged.
  const parsed = parseBoaIndex('<h4>Clinical BOASts</h4><ul><li><a href="' + escaped.input + '">' + entry.topic + '</a></li></ul>',
    'https://www.boa.ac.uk/standards-guidance/boasts.html');
  check('BOA parser preserves observed percent-encoded source URL', parsed[0]?.versions[0].url === escaped.input);
  const [comparison] = await runDryRun([{
    name: 'SAF-5 recorded BOA evidence (offline)', sourceTag: 'BOA', async fetchCandidates() { return parsed; },
  }]);
  check('BOA evidence sweep succeeds', !comparison.error && comparison.totalDiscovered === 1);
  check('v4 prevents a false NEW_GUIDELINE for documented BOA observation',
    comparison.newCandidates.length === 0 && !comparison.candidates.some(c => c.changeReason === 'NEW_GUIDELINE'));
  check('case-different BOA observation requires comparison, not exact-match inflation',
    comparison.matchedExisting === 0 && comparison.requiresComparison === 1
    && comparison.candidates[0]?.changeReason === 'POSSIBLE_SAME_DOCUMENT');
  check('comparison names the real existing guideline',
    comparison.candidates[0]?.documentComparison?.guidelineIds.includes(entry.id) === true);
  check('comparison retains original URL and pending approval',
    comparison.candidates[0]?.versions[0].url === escaped.input
    && comparison.candidates[0]?.reviewStatus === 'pending');

  const [exact] = await runDryRun([{
    name: 'SAF-5 exact BOA evidence (offline)', sourceTag: 'BOA',
    async fetchCandidates() { return [{ ...parsed[0], versions: [{ label: 'BOASt PDF', url: literal }] }]; },
  }]);
  check('unchanged known BOA document is exact, with no candidate',
    exact.matchedExisting === 1 && exact.candidates.length === 0 && !exact.error);

  // New control uses the existing suite's explicit TEST-PHASE1 URL, NOT a
  // fabricated production GUID. Encoded spelling must remain genuinely new.
  const control = 'https://www.boa.ac.uk/asset/TEST%2dPHASE1%2dAAAA/';
  check('synthetic control is absent from both catalogue indexes',
    !index.byIdentity.has(identity(control)) && !index.byMatch.has(match(control)));
  const [novel] = await runDryRun([{
    name: 'SAF-5 existing synthetic control (offline)', sourceTag: 'BOA',
    async fetchCandidates() { return [{ topic: 'Synthetic test control', source: 'BOA', versions: [{ label: 'Test', url: control }] }]; },
  }]);
  check('genuinely new control still yields exactly one NEW_GUIDELINE',
    novel.newCandidates.length === 1 && novel.candidates.length === 1
    && novel.candidates[0]?.changeReason === 'NEW_GUIDELINE' && !novel.error);
  check('new control preserves source URL, has no matched guideline and remains pending',
    novel.candidates[0]?.versions[0].url === control
    && novel.candidates[0]?.matchedGuidelineId === null && novel.candidates[0]?.reviewStatus === 'pending');
}
