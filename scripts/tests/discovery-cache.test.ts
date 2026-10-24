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


/**
 * Remove a throwaway temp directory. On Windows a just-written file can be held
 * briefly by antivirus or the search indexer, and rmSync then throws EPERM or
 * EBUSY even though nothing is wrong with the test. Retry as Node documents for
 * exactly this case; if it still fails, WARN — never throw. A leftover OS temp
 * directory is not a test failure, and an exception here would also skip the
 * pass/fail summary and replace the suite's real result with a crash.
 */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    console.warn(`  (cleanup) could not remove ${dir}: ${(err as Error).message}`);
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-cache-test-'));
const originalCwd = process.cwd();
process.chdir(TMP);

const URL_A = 'https://example.test/surface-a';

try {
  const mod = await import('../lib/discovery-cache');
  const { fetchSurface, CACHE_DIR, MAX_VALIDATOR_AGE_MS, DISCOVERY_USER_AGENT } = mod;

  // Virtual clock for per-host pacing, so no test here ever really sleeps.
  // Every sleep is recorded and advances the clock by exactly what was asked.
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const events: string[] = [];
  const virtualPacing = {
    now: () => clock,
    sleep: async (ms: number) => { sleeps.push(ms); events.push('sleep'); clock += ms; },
  };
  mod.configurePacing(virtualPacing);

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

  console.log('\n[11] Requests to one host are paced; the wait is bounded; hosts are independent');
  {
    const { resetPacing, configurePacing, MIN_HOST_INTERVAL_MS } = mod;
    resetPacing();
    configurePacing(virtualPacing);
    sleeps.length = 0;
    const H1 = 'https://paced-one.test/a';
    const H1b = 'https://paced-one.test/b';
    const H2 = 'https://paced-two.test/a';

    scripted = [ok('1')];
    const first = await fetchSurface(H1);
    eq('a host contacted for the first time waits nothing', first.pacedMs, 0);
    eq('so no sleep happened', sleeps.length, 0);

    // A different path on the SAME host, immediately after.
    scripted = [() => { events.push('fetch'); return new Response('2', { status: 200 }); }];
    events.length = 0;
    const second = await fetchSurface(H1b);
    eq('an immediate second request to the same host waits the full interval', second.pacedMs, MIN_HOST_INTERVAL_MS);
    eq('the sleep asked for exactly that', sleeps[0], MIN_HOST_INTERVAL_MS);
    eq('the wait happened BEFORE the request was sent', events.join(','), 'sleep,fetch');

    scripted = [ok('3')];
    const other = await fetchSurface(H2);
    eq('a different host is not delayed by the first one', other.pacedMs, 0);

    clock += 3_000;
    scripted = [ok('4')];
    const partial = await fetchSurface(H1);
    eq('only the remainder of the interval is waited', partial.pacedMs, MIN_HOST_INTERVAL_MS - 3_000);

    clock += MIN_HOST_INTERVAL_MS * 10;
    scripted = [ok('5')];
    eq('after the interval has passed, no wait (never negative)', (await fetchSurface(H1)).pacedMs, 0);

    // A clock that steps backwards (NTP correction) must not produce a wait
    // longer than the interval: the wait is bounded by construction.
    clock -= 60_000;
    scripted = [ok('6')];
    const skewed = await fetchSurface(H1);
    check('a backwards clock step cannot exceed the interval', skewed.pacedMs <= MIN_HOST_INTERVAL_MS, String(skewed.pacedMs));

    // A failed request still counts as having asked the host.
    clock += MIN_HOST_INTERVAL_MS * 10;
    const H3 = 'https://paced-fail.test/a';
    scripted = [() => { throw new Error('connection reset'); }];
    let threw = false;
    try { await fetchSurface(H3); } catch { threw = true; }
    check('the failing request threw', threw);
    scripted = [ok('7')];
    eq('the next request to a host that just FAILED is still paced', (await fetchSurface(H3)).pacedMs, MIN_HOST_INTERVAL_MS);
    resetPacing();
  }

  console.log('\n[12] Pacing holds under CONCURRENT requests, including when one fails');
  {
    const { resetPacing, configurePacing, MIN_HOST_INTERVAL_MS: GAP } = mod;
    resetPacing();
    configurePacing(virtualPacing);

    // A response the test releases by hand, so overlap is real and controlled.
    type Gate = { promise: Promise<Response>; answer: (body: string) => void; fail: (msg: string) => void };
    const gate = (label: string): Gate => {
      let answer!: (b: string) => void;
      let fail!: (m: string) => void;
      const promise = new Promise<Response>((resolve, reject) => {
        answer = (b) => { events.push(`answered:${label}`); inFlight--; resolve(new Response(b, { status: 200 })); };
        fail = (m) => { events.push(`failed:${label}`); inFlight--; reject(new Error(m)); };
      });
      return { promise, answer, fail };
    };
    let inFlight = 0;
    let maxInFlightPerHost = 0;
    const sent = (label: string, g: Gate) => () => {
      events.push(`sent:${label}`);
      inFlight++;
      maxInFlightPerHost = Math.max(maxInFlightPerHost, inFlight);
      return g.promise as unknown as Response;
    };
    const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

    // (a) Two concurrent requests to ONE host.
    events.length = 0; sleeps.length = 0; requests.length = 0;
    const g1 = gate('a1'); const g2 = gate('a2');
    scripted = [sent('a1', g1), sent('a2', g2)];
    const p1 = fetchSurface('https://conc-one.test/1');
    const p2 = fetchSurface('https://conc-one.test/2');
    await settle();
    eq('while the first is unanswered, only ONE request to the host has been sent', requests.length, 1);
    clock += 1_200; // the first request takes 1.2s to be answered
    g1.answer('one');
    await p1;
    await settle();
    g2.answer('two');
    const r2 = await p2;
    eq('the second was sent only after the first was answered AND the gap was slept',
      events.join(','), 'sent:a1,answered:a1,sleep,sent:a2,answered:a2');
    eq('the sleep was the full gap, measured from when the first finished', sleeps[0], GAP);
    eq('pacedMs includes the time spent queued, not just the sleep', r2.pacedMs, 1_200 + GAP);

    // (b) Concurrent requests to DIFFERENT hosts are not serialised together.
    events.length = 0; requests.length = 0;
    const gx = gate('x'); const gy = gate('y');
    scripted = [sent('x', gx), sent('y', gy)];
    const px = fetchSurface('https://conc-x.test/a');
    const py = fetchSurface('https://conc-y.test/a');
    await settle();
    eq('both hosts were contacted at once', requests.length, 2);
    gx.answer('x'); gy.answer('y');
    await Promise.all([px, py]);

    // (c) The first of two concurrent same-host requests FAILS.
    events.length = 0; sleeps.length = 0; requests.length = 0;
    const f1 = gate('f1'); const f2 = gate('f2');
    scripted = [sent('f1', f1), sent('f2', f2)];
    const pf1 = fetchSurface('https://conc-fail.test/1').then(() => 'resolved', (e: Error) => `rejected:${e.message}`);
    const pf2 = fetchSurface('https://conc-fail.test/2');
    await settle();
    eq('the second is held while the first is in flight', requests.length, 1);
    f1.fail('connection reset');
    eq('the failing request rejects to its own caller', await pf1, 'rejected:connection reset');
    await settle();
    f2.answer('ok');
    const rf2 = await pf2;
    eq('the failure did not wedge the host queue: the second completed', rf2.body, 'ok');
    eq('and the failure still paced it: sent only after a full-gap sleep',
      events.join(','), 'sent:f1,failed:f1,sleep,sent:f2,answered:f2');

    // (d) Three concurrent requests to one host go out in call order, one at a time.
    events.length = 0; sleeps.length = 0; requests.length = 0; maxInFlightPerHost = 0; inFlight = 0;
    const gs = [gate('t1'), gate('t2'), gate('t3')];
    scripted = gs.map((g, i) => sent(`t${i + 1}`, g));
    const ps = [1, 2, 3].map((i) => fetchSurface(`https://conc-three.test/${i}`));
    for (const g of gs) { await settle(); g.answer('b'); }
    await Promise.all(ps);
    eq('sent strictly in call order', events.filter((e) => e.startsWith('sent')).join(','), 'sent:t1,sent:t2,sent:t3');
    eq('never more than one request in flight to that host', maxInFlightPerHost, 1);
    eq('each later request slept the full gap', sleeps.join(','), `${GAP},${GAP}`);
    check('no sleep ever exceeded the gap', sleeps.every((ms) => ms <= GAP), sleeps.join(','));
    resetPacing();
  }
} finally {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  removeTempDir(TMP);
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
