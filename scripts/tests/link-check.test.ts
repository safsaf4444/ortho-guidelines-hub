/**
 * scripts/tests/link-check.test.ts
 * ────────────────────────────────
 * Offline tests for the link-reachability pipeline: scripts/flag-dead-links.ts
 * (which classifies each URL) and scripts/map-link-status.ts (which turns a run
 * into proposed linkVerificationStatus changes).
 *
 * WHY THIS FILE EXISTS: neither script had any test coverage, and at the time
 * `npx tsc -b` did not type-check scripts/ at all — tsconfig.app.json included
 * only `src`, tsconfig.node.json only `vite.config.ts`, and tsx transpiles
 * without checking. A type error or even a broken regex in a script was
 * invisible to the whole verification standard, and two such bugs reached the
 * repo that way while this pipeline was being extended.
 *
 * That gap is now closed: tsconfig.scripts.json is a referenced project, so
 * `npx tsc -b` covers scripts/. These tests remain the behavioural half —
 * type-checking would not have caught a redirect comparison that treated
 * http->https as a move.
 *
 * Pure functions only: no network, no database, no filesystem writes. Importing
 * flag-dead-links is safe — it guards main() behind an `isMain` check.
 *
 * Run:   npx tsx scripts/tests/link-check.test.ts   (or: npm run test:offline)
 */
import {
  normaliseForRedirect, isMeaningfulRedirect, classifyHttpStatus,
  looksLikeWaf, isRetryableVerdict, buildCsv, tally,
  type Result,
} from '../flag-dead-links';
import {
  verdictToStatus, worstStatus,
  type LinkStatus, type Verdict as MapVerdict,
} from '../map-link-status';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

console.log('\n[1] Redirect detection — only a genuinely different document counts');

const same: [string, string][] = [
  ['https://a.org/doc', 'https://a.org/doc'],
  ['http://a.org/doc', 'https://a.org/doc'],
  ['https://www.a.org/doc', 'https://a.org/doc'],
  ['https://a.org/doc/', 'https://a.org/doc'],
  ['https://A.ORG/doc', 'https://a.org/doc'],
  ['https://a.org/doc', 'https://www.a.org/doc/'],
];
for (const [req, fin] of same) {
  check(`not a move: ${req} -> ${fin}`, !isMeaningfulRedirect(req, fin));
}
check('a different path IS a move', isMeaningfulRedirect('https://a.org/old', 'https://a.org/new'));
check('a different host IS a move', isMeaningfulRedirect('https://a.org/doc', 'https://b.org/doc'));
check('a different query IS a move', isMeaningfulRedirect('https://a.org/d?v=1', 'https://a.org/d?v=2'));
check('no final URL is never a move', !isMeaningfulRedirect('https://a.org/doc', ''));
check('unparseable input is never a move', !isMeaningfulRedirect('not a url', 'also not'));
eq('normaliseForRedirect strips www, trailing slash and case',
  normaliseForRedirect('https://WWW.A.org/doc/'), 'a.org/doc');
eq('normaliseForRedirect returns null on junk', normaliseForRedirect('nonsense'), null);

console.log('\n[2] HTTP classification');

eq('200 is OK', classifyHttpStatus(200), 'OK');
eq('301 is OK at this layer (redirects are followed, then compared)', classifyHttpStatus(301), 'OK');
eq('404 is a client error', classifyHttpStatus(404), 'CLIENT_ERROR');
eq('500 is a server error', classifyHttpStatus(500), 'SERVER_ERROR');
eq('403 is treated as a WAF block, not a client error', classifyHttpStatus(403), 'BLOCKED_WAF');
eq('429 is treated as a WAF block', classifyHttpStatus(429), 'BLOCKED_WAF');
check('a 200 behind Cloudflare is NOT a block', !looksLikeWaf(200, new Headers({ 'cf-ray': 'x' })));
check('a 503 with cf-ray IS a block', looksLikeWaf(503, new Headers({ 'cf-ray': 'x' })));

console.log('\n[3] Retry policy');

check('timeouts retry', isRetryableVerdict('TIMEOUT'));
check('DNS failures retry', isRetryableVerdict('DNS_FAILURE'));
check('5xx retries', isRetryableVerdict('SERVER_ERROR'));
check('4xx does NOT retry', !isRetryableVerdict('CLIENT_ERROR'));
check('a WAF block does NOT retry', !isRetryableVerdict('BLOCKED_WAF'));
check('REDIRECTED does NOT retry — it would land in the same place',
  !isRetryableVerdict('REDIRECTED'));

console.log('\n[4] Report output carries the new field');

const row = (over: Partial<Result>): Result => ({
  id: 'x', topic: 't', source: 's', label: 'l', url: 'https://a.org/old',
  domain: 'a.org', verdict: 'OK', httpStatus: '200', finalUrl: '',
  detail: 'HTTP 200', attempts: 1, ...over,
});
const csv = buildCsv([row({ verdict: 'REDIRECTED', finalUrl: 'https://a.org/new' })]);
check('CSV header includes final_url', csv.split('\n')[0].includes('final_url'));
check('CSV records the final URL', csv.includes('https://a.org/new'));
check('CSV records the REDIRECTED verdict', csv.includes('REDIRECTED'));
const t = tally([row({ verdict: 'REDIRECTED' }), row({}), row({ verdict: 'BLOCKED_WAF' })]);
eq('tally counts REDIRECTED separately', t.REDIRECTED, 1);
eq('tally still counts OK', t.OK, 1);
check('tally initialises every verdict, including REDIRECTED',
  Object.prototype.hasOwnProperty.call(t, 'REDIRECTED'));

console.log('\n[5] Verdict -> stored status');

const m: [MapVerdict, LinkStatus | null][] = [
  ['OK', 'verified'],
  ['REDIRECTED', 'moved'],
  ['CLIENT_ERROR', 'broken'],
  ['DNS_FAILURE', 'broken'],
  ['SERVER_ERROR', 'needs-review'],
  ['TIMEOUT', 'needs-review'],
  ['BLOCKED_WAF', null],
  ['KNOWN_BLOCKED', null],
];
for (const [v, expected] of m) eq(`${v} -> ${expected ?? '(no opinion)'}`, verdictToStatus(v), expected);

console.log('\n[6] The safety property: automation never overrides a human verdict');

check('a WAF block yields no status at all, so it cannot overwrite anything',
  verdictToStatus('BLOCKED_WAF') === null && verdictToStatus('KNOWN_BLOCKED') === null);
check('withdrawn is never produced by the mapper',
  !m.some(([, s]) => s === 'withdrawn'));
check('superseded is never produced by the mapper',
  !m.some(([, s]) => s === 'superseded'));
check('blocked is never auto-produced by the mapper',
  !m.some(([, s]) => s === 'blocked'));

console.log('\n[7] Worst-wins ordering across an entry with several URLs');

eq('broken beats verified', worstStatus(['verified', 'broken']), 'broken');
eq('broken beats moved', worstStatus(['moved', 'broken']), 'broken');
eq('needs-review beats moved', worstStatus(['moved', 'needs-review']), 'needs-review');
eq('moved beats verified — a relocated link needs attention', worstStatus(['verified', 'moved']), 'moved');
eq('an editor-set withdrawn outranks every automated verdict',
  worstStatus(['withdrawn', 'broken', 'verified']), 'withdrawn');
eq('an editor-set superseded outranks broken', worstStatus(['superseded', 'broken']), 'superseded');
eq('all-null yields null, leaving the entry untouched', worstStatus([null, null]), null);
eq('nulls are skipped, not treated as a status', worstStatus([null, 'verified', null]), 'verified');

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
