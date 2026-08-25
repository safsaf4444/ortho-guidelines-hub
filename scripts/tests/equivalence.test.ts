/**
 * scripts/tests/equivalence.test.ts
 * ─────────────────────────────────
 * Behavioural-equivalence proof for the phase-1 refactor of sync-providers.ts:
 * the pre-refactor pipeline and the current one are run over IDENTICAL inputs
 * and must produce identical discovery/filtering/matching results.
 *
 * BASELINE: the pre-phase-1 implementation is extracted from git history at the
 * pinned commit below (the origin/main this branch was created from), written
 * to a transient gitignored file inside scripts/ (so its relative import of
 * ../src/data/guidelines-data resolves), imported, and deleted in a finally.
 * The pin is deliberate — comparing against HEAD would become a self-comparison
 * once the refactor merges. If the catalogue dataset changes shape enough to
 * break the OLD implementation, this test has served its purpose and can be
 * retired along with this note.
 *
 * OFFLINE: the sweep fixtures are stub adapters; the BOA-parsing comparison
 * swaps globalThis.fetch for a stub inside try/finally, so NO socket is ever
 * opened. A call counter asserts the stub (not the network) served every call.
 *
 * Run:   npx tsx scripts/tests/equivalence.test.ts      (or: npm run test:offline)
 *        Requires a git checkout with the pinned commit in history.
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DiscoveredItem, ProviderAdapter } from '../lib/provider-adapter';

// Pre-phase-1 origin/main (merge of PR #13). The last commit whose
// sync-providers.ts still parsed inline and had no candidate emission.
const BASELINE_COMMIT = '6be41eaa6822f5e7be46e0f38e0ff98426053a0b';
const BASELINE_PATH = join(process.cwd(), 'scripts', '.equivalence-baseline.ts');

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

// Minimal structural view of the baseline module — typed by hand because the
// import specifier is a runtime-built path, which tsc cannot follow.
interface BaselineModule {
  runDryRun(adapters: ProviderAdapter[]): Promise<
    {
      adapter: string;
      totalDiscovered: number;
      matchedExisting: number;
      skippedBlocked: number;
      newCandidates: DiscoveredItem[];
    }[]
  >;
  BOAAdapter: ProviderAdapter;
}

let baseline: BaselineModule;
try {
  const source = execFileSync('git', ['show', `${BASELINE_COMMIT}:scripts/sync-providers.ts`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  writeFileSync(BASELINE_PATH, source, 'utf-8');
  baseline = (await import(pathToFileURL(BASELINE_PATH).href)) as BaselineModule;
} catch (err) {
  if (existsSync(BASELINE_PATH)) unlinkSync(BASELINE_PATH);
  console.error(
    `Could not extract the baseline from git history (commit ${BASELINE_COMMIT.slice(0, 7)}).\n` +
      'This test needs a full git checkout containing that commit. Original error:',
    err,
  );
  process.exit(1);
}

try {
  const current = await import('../sync-providers');
  const { GUIDELINES_DATA } = await import('../../src/data/guidelines-data');

  // ── Sweep equivalence over the full catalogue ─────────────────────────────
  // Every distinct URL in the real dataset, so the "matched" path is exercised
  // across all hosts, plus perturbed, blocked, and genuinely novel entries.

  const realUrls: string[] = [];
  for (const g of GUIDELINES_DATA) for (const v of g.versions) if (v.url && v.url !== '#') realUrls.push(v.url);

  const items: DiscoveredItem[] = [
    ...realUrls.map((u, i) => ({ topic: `real ${i}`, source: 'BOA', versions: [{ label: 'L', url: u }] })),
    ...realUrls
      .slice(0, 40)
      .map((u, i) => ({ topic: `perturbed ${i}`, source: 'BOA', versions: [{ label: 'L', url: u.toUpperCase() + '/' }] })),
    { topic: 'blocked girft', source: 'BOA', versions: [{ label: 'L', url: 'https://gettingitrightfirsttime.co.uk/x.pdf' }] },
    { topic: 'blocked bask', source: 'BOA', versions: [{ label: 'L', url: 'https://baskonline.com/professional/x.pdf' }] },
    { topic: 'novel 1', source: 'BOA', versions: [{ label: 'L', url: 'https://www.boa.ac.uk/asset/NOVEL-0001/' }] },
    { topic: 'novel 2', source: 'BOA', summary: 'sum', versions: [{ label: 'L', url: 'https://www.boa.ac.uk/asset/NOVEL-0002', date: 'd' }] },
  ];

  const adapter = (): ProviderAdapter => ({
    name: 'Equivalence stub',
    sourceTag: 'BOA',
    async fetchCandidates() {
      return items;
    },
  });

  console.log(`Fixture: ${items.length} items (${realUrls.length} real catalogue URLs).`);

  const oldR = (await baseline.runDryRun([adapter()]))[0];
  const newR = (await current.runDryRun([adapter()]))[0];

  console.log('\n[1] Sweep equivalence (baseline vs current)');
  eq('totalDiscovered', oldR.totalDiscovered, newR.totalDiscovered);
  eq('matchedExisting', oldR.matchedExisting, newR.matchedExisting);
  eq('skippedBlocked', oldR.skippedBlocked, newR.skippedBlocked);
  eq('adapter name', oldR.adapter, newR.adapter);
  eq('newCandidates length', oldR.newCandidates.length, newR.newCandidates.length);
  eq('newCandidates content (deep, ordered)', oldR.newCandidates, newR.newCandidates);
  check(
    'coverage balanced in current report',
    newR.matchedExisting + newR.skippedBlocked + newR.newCandidates.length === newR.totalDiscovered,
  );
  console.log(
    `      observed: discovered=${newR.totalDiscovered} matched=${newR.matchedExisting} ` +
      `blocked=${newR.skippedBlocked} new=${newR.newCandidates.length}`,
  );

  // ── BOA parsing equivalence ───────────────────────────────────────────────
  // The baseline parses inline inside fetchCandidates; the current code calls
  // parseBoaIndex. Compared on identical input via a scoped fetch stub.

  console.log('\n[2] BOA parsing equivalence (scoped fetch stub — no socket opened)');

  const BOA_FIXTURE = `
<html><body>
  <a href="/asset/AAAA-1111/">First standard</a>
  <a href="https://www.boa.ac.uk/asset/BBBB-2222/">Second   standard
     with   collapsed    whitespace</a>
  <a href="/asset/AAAA-1111/">Duplicate of the first</a>
  <a href="/asset/CCCC-3333/">Download and read the full guidelines for BOA Standards here</a>
  <a href="/asset/DDDD-4444/"></a>
  <a href="/standards-guidance/other.html">Not an asset link</a>
  <a href="/asset/EEEE-5555/">   Padded topic   </a>
  <a>Anchor with no href</a>
</body></html>`;

  const realFetch = globalThis.fetch;
  let stubCalls = 0;
  let oldParsed: DiscoveredItem[];
  let newParsed: DiscoveredItem[];

  try {
    globalThis.fetch = (async () => {
      stubCalls++;
      return new Response(BOA_FIXTURE, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;

    oldParsed = await baseline.BOAAdapter.fetchCandidates();
    newParsed = await current.BOAAdapter.fetchCandidates();
  } finally {
    globalThis.fetch = realFetch;
  }

  eq('fetch stub served both calls (no live request)', stubCalls, 2);
  eq('fetch restored afterwards', globalThis.fetch === realFetch, true);
  eq('BOA parsing: baseline vs current, deep-equal', oldParsed, newParsed);
  eq('BOA parsing: expected item count', newParsed.length, 3);
  eq(
    'parseBoaIndex(html, url) === BOAAdapter.fetchCandidates() output',
    current.parseBoaIndex(BOA_FIXTURE, 'https://www.boa.ac.uk/standards-guidance/boasts.html'),
    newParsed,
  );

  // Non-2xx must still throw the same message, and must not be swallowed.
  let oldErr = '';
  let newErr = '';
  try {
    globalThis.fetch = (async () => new Response('nope', { status: 503 })) as typeof fetch;
    await baseline.BOAAdapter.fetchCandidates().catch((e: Error) => {
      oldErr = e.message;
    });
    await current.BOAAdapter.fetchCandidates().catch((e: Error) => {
      newErr = e.message;
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  eq('non-2xx throws identically', newErr, oldErr);
  eq('non-2xx message is the expected one', newErr, 'HTTP 503 fetching https://www.boa.ac.uk/standards-guidance/boasts.html');
} finally {
  if (existsSync(BASELINE_PATH)) unlinkSync(BASELINE_PATH);
}

check('transient baseline file removed', !existsSync(BASELINE_PATH));

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
