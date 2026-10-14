/**
 * scripts/tests/discovery-cache.test.ts
 * ──────────────────────────────────────
 * Behavioural tests for the revalidating fetch store.
 *
 * NO REAL NETWORK. `globalThis.fetch` is replaced with a scripted stub that
 * records every request it is handed, so the assertions are about what the
 * module actually SENT and what it did with the answer — not about a provider.
 *
 * The cache is on disk by design (a process-only cache could not revalidate
 * across runs at all), so these tests chdir into a throwaway directory before
 * importing the module and delete it afterwards. Nothing is written inside the
 * repository.
 *
 * Run:   npx tsx scripts/tests/discovery-cache.test.ts
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

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
  check(
    name,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

interface Recorded {
  url: string;
  headers: Record<string, string>;
}

const requests: Recorded[] = [];
let scripted: Array<() => Response> = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
    headers[k] = v;
  }
  requests.push({ url, headers });
  const next = scripted.shift();
  if (!next) throw new Error(`fetch stub: no scripted response for ${url}`);
  return next();
}) as typeof fetch;

function ok(body: string, extra: Record<string, string> = {}): () => Response {
  return () =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html', ...extra },
    });
}
function notModified(): () => Response {
  return () => new Response(null, { status: 304 });
}
function serverError(status: number): () => Response {
  return () => new Response('nope', { status, statusText: 'Boom' });
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-cache-test-'));
const originalCwd = process.cwd();
process.chdir(TMP);

const URL_A = 'https://example.test/surface-a';

try {
  const mod = await import('../lib/discovery-cache');
  const { fetchSurface, CACHE_DIR, MAX_VALIDATOR_AGE_MS, DISCOVERY_USER_AGENT } = mod;

  console.log('\n[1] A cold fetch sends no validators and stores the body');
  requests.length = 0;
  scripted = [ok('<p>one</p>', { etag: '"v1"', 'last-modified': 'Mon, 06 Oct 2026 10:00:00 GMT' })];
  {
    const r = await fetchSurface(URL_A);
    eq('one request issued', requests.length, 1);
    eq('request mode is unconditional', r.requestMode, 'unconditional');
    eq('no validators sent', r.validatorsSent.length, 0);
    check('If-None-Match absent', !('If-None-Match' in requests[0].headers));
    check('If-Modified-Since absent', !('If-Modified-Since' in requests[0].headers));
    eq('user agent identifies the project', requests[0].headers['User-Agent'], DISCOVERY_USER_AGENT);
    eq('body returned', r.body, '<p>one</p>');
    eq('no previous hash on a cold fetch', r.previousBodySha256, null);
    eq('bodyChanged is false when there was nothing to compare', r.bodyChanged, false);
    eq('not a revalidation', r.revalidated, false);
    eq('the reason recorded is "no stored entry"', r.conditionalSkippedReason, 'no-stored-entry');
    check('an entry was written to disk', fs.readdirSync(CACHE_DIR).length > 0);
  }

  console.log('\n[2] A warm fetch sends both validators, and 304 reuses the stored body');
  requests.length = 0;
  scripted = [notModified()];
  {
    const r = await fetchSurface(URL_A);
    eq('a request was still issued — the cache never skips one', requests.length, 1);
    eq('request mode is conditional', r.requestMode, 'conditional');
    eq('If-None-Match carries the stored etag', requests[0].headers['If-None-Match'], '"v1"');
    eq(
      'If-Modified-Since carries the stored date',
      requests[0].headers['If-Modified-Since'],
      'Mon, 06 Oct 2026 10:00:00 GMT',
    );
    eq('status reported as 304', r.status, 304);
    eq('revalidated flag set', r.revalidated, true);
    eq('the stored body is returned', r.body, '<p>one</p>');
    eq('bodyChanged is false on a 304', r.bodyChanged, false);
    check('both validators are listed for the report', r.validatorsSent.length === 2);
    eq('no skip reason on a conditional request', r.conditionalSkippedReason, null);
  }

  console.log('\n[2b] A host that offers NO validator is distinguished from a cold cache');
  requests.length = 0;
  {
    const url = 'https://example.test/no-validators';
    // First fetch: 200 with neither ETag nor Last-Modified — what BESS and EBI
    // actually do when answering Node's fetch with a compressed response.
    scripted = [ok('<p>first</p>')];
    const first = await fetchSurface(url);
    eq('cold fetch reason is no-stored-entry', first.conditionalSkippedReason, 'no-stored-entry');

    scripted = [ok('<p>first</p>')];
    const second = await fetchSurface(url);
    eq('request mode is still unconditional', second.requestMode, 'unconditional');
    eq(
      'but the reason is now that the HOST offered nothing',
      second.conditionalSkippedReason,
      'no-validator-offered-by-host',
    );
    check(
      'the body hash comparison still works without any validator',
      second.previousBodySha256 === second.bodySha256 && second.bodyChanged === false,
      `prev=${second.previousBodySha256} now=${second.bodySha256}`,
    );

    scripted = [ok('<p>second</p>')];
    const third = await fetchSurface(url);
    eq('a changed body is still detected with no validator', third.bodyChanged, true);
  }

  console.log('\n[3] A 200 with different content is reported as a body change');
  requests.length = 0;
  scripted = [ok('<p>two</p>', { etag: '"v2"' })];
  {
    const r = await fetchSurface(URL_A);
    eq('new body returned', r.body, '<p>two</p>');
    eq('bodyChanged is true', r.bodyChanged, true);
    check('the previous hash is carried for comparison', typeof r.previousBodySha256 === 'string');
    check('the hash actually differs', r.previousBodySha256 !== r.bodySha256);
    eq('not reported as a revalidation', r.revalidated, false);
  }

  console.log('\n[4] A 200 with identical content is not reported as a change');
  requests.length = 0;
  scripted = [ok('<p>two</p>', { etag: '"v2"' })];
  {
    const r = await fetchSurface(URL_A);
    eq('bodyChanged is false', r.bodyChanged, false);
    eq('hashes match', r.previousBodySha256, r.bodySha256);
  }

  console.log('\n[5] Past the trust window, validators are NOT sent');
  requests.length = 0;
  {
    // Age the stored entry beyond the single lifetime in the design.
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json') && f !== 'volatile-tokens.json');
    const entryPath = path.join(CACHE_DIR, files[0]);
    const entry = JSON.parse(fs.readFileSync(entryPath, 'utf-8'));
    entry.storedAt = new Date(Date.now() - (MAX_VALIDATOR_AGE_MS + 60_000)).toISOString();
    fs.writeFileSync(entryPath, JSON.stringify(entry));

    scripted = [ok('<p>three</p>', { etag: '"v3"' })];
    const r = await fetchSurface(URL_A);
    eq('request mode is unconditional', r.requestMode, 'unconditional');
    check(
      'no If-None-Match sent despite a stored etag',
      !('If-None-Match' in requests[0].headers),
      JSON.stringify(requests[0].headers),
    );
    check(
      'no If-Modified-Since sent either',
      !('If-Modified-Since' in requests[0].headers),
      JSON.stringify(requests[0].headers),
    );
    eq('the full body was taken', r.body, '<p>three</p>');
    eq(
      'the reason names the expired validator',
      r.conditionalSkippedReason,
      'stored-validator-past-trust-window',
    );
    check(
      'a stale entry still provides a hash to compare against',
      typeof r.previousBodySha256 === 'string',
    );
  }

  console.log('\n[6] A 304 with no stored body is a failure, not an empty page');
  requests.length = 0;
  {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json') && f !== 'volatile-tokens.json');
    for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));

    scripted = [notModified()];
    let threw = false;
    let message = '';
    try {
      await fetchSurface(URL_A);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    check('it throws rather than returning an empty body', threw);
    check('the message says why', /no cached body/i.test(message), message);
  }

  console.log('\n[7] A non-OK status throws — a surface that cannot be read is a failure');
  for (const status of [403, 404, 500]) {
    requests.length = 0;
    scripted = [serverError(status)];
    let threw = false;
    let message = '';
    try {
      await fetchSurface(`https://example.test/fails-${status}`);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    check(`HTTP ${status} throws`, threw);
    check(`HTTP ${status} message names the status`, message.includes(String(status)), message);
  }

  console.log('\n[8] A redirect is recorded, and the requested URL is not rewritten');
  requests.length = 0;
  {
    const requested = 'https://example.test/old-path';
    const landed = 'https://example.test/new-path';
    scripted = [
      () =>
        Object.defineProperty(new Response('<p>moved</p>', { status: 200 }), 'url', {
          value: landed,
        }),
    ];
    const r = await fetchSurface(requested);
    eq('requestedUrl is preserved verbatim', r.requestedUrl, requested);
    eq('finalUrl records where it landed', r.finalUrl, landed);
    eq('redirected flag set', r.redirected, true);

    const { surfaceRedirectAlternative, matchKeys } = await import('../lib/url-alternatives');
    const alt = surfaceRedirectAlternative(r.requestedUrl, r.finalUrl, {
      status: r.status,
      contentType: r.contentType,
      reportedContentLength: r.reportedContentLength,
      checkedAt: r.fetchedAt,
    });
    eq('the alternative relation is redirect-target', alt.relation, 'redirect-target');
    eq('equivalence is unverified even for a server-performed redirect', alt.equivalence, 'unverified');
    eq('an index-page redirect is SURFACE-scoped', alt.scope, 'surface');
    check(
      'the statement says it is evidence about the index page only',
      /index page ONLY/i.test(alt.statement),
      alt.statement,
    );
    check(
      'the statement says it takes no part in document matching',
      /no part in matching documents/i.test(alt.statement),
      alt.statement,
    );
    // The structural guard: even handed to matchKeys directly, it contributes
    // no key, so it cannot make any document match the catalogue.
    const keys = matchKeys('https://unrelated.test/some-document.pdf', [alt]);
    eq('matchKeys ignores a surface-scoped alternative entirely', keys.length, 1);
    eq('the only key is the document itself', keys[0], 'https://unrelated.test/some-document.pdf');
    check(
      'the redirect target is not among the match keys',
      !keys.some((k) => k.includes('new-path')),
      JSON.stringify(keys),
    );
    check(
      'the statement limits the claim to this occasion',
      /on this occasion/i.test(alt.statement),
      alt.statement,
    );
    check(
      'the statement says the discovered URL is retained',
      /retained verbatim/i.test(alt.statement),
      alt.statement,
    );
  }

  console.log('\n[9] A corrupt cache entry is treated as absent, not trusted');
  requests.length = 0;
  {
    const url = 'https://example.test/corrupt';
    scripted = [ok('<p>fresh</p>', { etag: '"c1"' })];
    await fetchSurface(url);

    // Truncate every entry on disk.
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.endsWith('.json') && f !== 'volatile-tokens.json') {
        fs.writeFileSync(path.join(CACHE_DIR, f), '{"body":');
      }
    }

    requests.length = 0;
    scripted = [ok('<p>refetched</p>')];
    const r = await fetchSurface(url);
    eq('the request went out unconditionally', r.requestMode, 'unconditional');
    eq('the body was refetched', r.body, '<p>refetched</p>');
    eq('no bogus previous hash was invented', r.previousBodySha256, null);
  }

  console.log('\n[10] The volatile-token store round-trips on disk');
  {
    const { readTokenStore, writeTokenStore } = mod;
    eq('a missing store reads as empty', Object.keys(readTokenStore()).length, 0);
    writeTokenStore({
      'https://example.test/doc.pdf': { parameter: 'ver', value: 'abc', observedAt: '2026-10-12T00:00:00.000Z' },
    });
    const back = readTokenStore();
    eq('the value survives a write/read cycle', back['https://example.test/doc.pdf'].value, 'abc');
    check(
      'it lives on disk, which is what makes cross-run comparison possible',
      fs.existsSync(path.join(CACHE_DIR, 'volatile-tokens.json')),
    );
  }
} finally {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
