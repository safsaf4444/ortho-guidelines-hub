/** Loopback-only HTTP tests: no provider, database or credential access. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fetchProviderIndex } from '../lib/provider-fetch';
import { BOAAdapter, BSGAdapter, BOFASAdapter, BSSHAdapter } from '../sync-providers';

let requests = 0;
const server = createServer((req, res) => {
  requests++;
  if (req.url === '/headers') return;
  if (req.url === '/body') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html>');
    return;
  }
  if (req.url === '/error') {
    res.writeHead(503);
    res.end('Unavailable');
    return;
  }
  res.end('<html>Published index</html>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
try {
  assert.equal(await fetchProviderIndex(`${base}/ok`), '<html>Published index</html>');
  console.log('PASS complete response returned verbatim');
  await assert.rejects(fetchProviderIndex(`${base}/error`), /HTTP 503 fetching/);
  console.log('PASS HTTP failure includes status and URL');
  for (const phase of ['headers', 'body']) {
    const started = Date.now();
    await assert.rejects(fetchProviderIndex(`${base}/${phase}`, 100), /Timed out after 100ms fetching/);
    assert(Date.now() - started < 3000, `${phase} deadline was not bounded`);
    console.log(`PASS stalled ${phase} aborted with diagnostic`);
  }
  assert.equal(await fetchProviderIndex(`${base}/ok`), '<html>Published index</html>');
  assert.equal(requests, 5);
  console.log('PASS recovery after timeout, no automatic retries');

  // Exercise every adapter through a fake fetch, verifying that their actual
  // request carries a signal and preserves the established publisher identity.
  const originalFetch = globalThis.fetch;
  try {
    for (const adapter of [BOAAdapter, BSGAdapter, BOFASAdapter, BSSHAdapter]) {
      let calls = 0;
      globalThis.fetch = async (_url, init) => {
        calls++;
        assert(init?.signal instanceof AbortSignal);
        assert.match(new Headers(init?.headers).get('User-Agent') ?? '', /OrthoGuidelinesHub/);
        return new Response('<html></html>');
      };
      await adapter.fetchCandidates();
      assert.equal(calls, 1);
      console.log(`PASS ${adapter.sourceTag} uses bounded fetch`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('9 passed, 0 failed');
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
