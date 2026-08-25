/**
 * scripts/tests/boa-adapter.test.ts
 * ─────────────────────────────────
 * Offline tests for the BOA adapter's conformance to the ProviderAdapter
 * contract, and for parseBoaIndex's parsing rules.
 *
 * NO NETWORK. BOAAdapter.fetchCandidates() is never invoked here — calling it
 * would issue a live request to boa.ac.uk. Conformance is checked structurally;
 * the parsing rules are checked through the pure parseBoaIndex export.
 *
 * Run:   npx tsx scripts/tests/boa-adapter.test.ts      (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { BOAAdapter, createRSSAdapter, parseBoaIndex } from '../sync-providers';

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

const BASE = 'https://www.boa.ac.uk/standards-guidance/boasts.html';

/**
 * Assert the ProviderAdapter contract directly against a value, field by field.
 *
 * `fetchCandidates` is checked for callability and arity only — never invoked.
 * Calling it would issue a live request, which this suite must not do.
 */
function assertAdapterShape(who: string, value: unknown) {
  const a = value as Record<string, unknown>;
  check(`${who}: is an object`, typeof a === 'object' && a !== null);
  check(`${who}: is NOT a function/class constructor`, typeof a !== 'function');
  check(`${who}: is a plain object literal`, Object.getPrototypeOf(a) === Object.prototype);
  check(`${who}: has no .prototype (not constructible)`, a.prototype === undefined);
  check(`${who}: name is a non-empty string`, typeof a.name === 'string' && a.name.trim().length > 0);
  check(
    `${who}: sourceTag is a non-empty string`,
    typeof a.sourceTag === 'string' && (a.sourceTag as string).trim().length > 0,
  );
  check(`${who}: fetchCandidates is a function`, typeof a.fetchCandidates === 'function');
  check(`${who}: fetchCandidates takes no required args`, (a.fetchCandidates as () => unknown).length === 0);
}

console.log('\n[1] BOAAdapter conformance (instance, not constructor)');

// The implementation declares an object literal, so this IS the value runDryRun
// receives — not a constructor that would need instantiating first.
assertAdapterShape('BOAAdapter', BOAAdapter);
eq('BOAAdapter identity: name', BOAAdapter.name, 'British Orthopaedic Association (BOASt)');
eq('BOAAdapter identity: sourceTag', BOAAdapter.sourceTag, 'BOA');

console.log('\n[2] createRSSAdapter output conformance');

// The pre-existing generic factory must satisfy the same contract.
const rss = createRSSAdapter('Example Society', 'EX', 'https://example.test/feed');
assertAdapterShape('createRSSAdapter(...)', rss);
eq('createRSSAdapter identity: name passed through', rss.name, 'Example Society');
eq('createRSSAdapter identity: sourceTag passed through', rss.sourceTag, 'EX');
check('two adapters are distinct objects', (rss as unknown) !== (BOAAdapter as unknown));

// ── parseBoaIndex parsing rules ─────────────────────────────────────────────

console.log('\n[3] parseBoaIndex — selector, filter, dedupe, resolution, order');

const FIXTURE = `
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

const parsed = parseBoaIndex(FIXTURE, BASE);

// 8 anchors in the fixture; 5 are excluded — the duplicate href, the noise
// phrase, the empty link text, the non-asset href, and the anchor with no href.
eq('item count (dupe, noise, empty-text, non-asset, no-href all excluded)', parsed.length, 3);

eq('relative href resolved against baseUrl', parsed[0].versions[0].url, 'https://www.boa.ac.uk/asset/AAAA-1111/');
eq('absolute href passed through unchanged', parsed[1].versions[0].url, 'https://www.boa.ac.uk/asset/BBBB-2222/');
eq('whitespace collapsed in topic', parsed[1].topic, 'Second standard with collapsed whitespace');
eq('topic trimmed', parsed[2].topic, 'Padded topic');
eq('topic otherwise verbatim', parsed[0].topic, 'First standard');

eq('noise phrase filtered', parsed.filter((p) => /Download and read/i.test(p.topic)).length, 0);
eq('duplicate URL collapsed', parsed.filter((p) => p.versions[0].url.includes('AAAA-1111')).length, 1);
eq('dedupe keeps the FIRST occurrence, not the last', parsed[0].topic, 'First standard');

eq(
  'document order preserved',
  parsed.map((p) => p.topic),
  ['First standard', 'Second standard with collapsed whitespace', 'Padded topic'],
);

console.log('\n[4] parseBoaIndex output satisfies the DiscoveredItem contract');

for (const [i, item] of parsed.entries()) {
  check(`item ${i}: topic is a non-empty string`, typeof item.topic === 'string' && item.topic.length > 0);
  check(`item ${i}: source === 'BOA'`, item.source === 'BOA');
  check(`item ${i}: versions is a non-empty array`, Array.isArray(item.versions) && item.versions.length > 0);
  check(`item ${i}: versions[0].label === 'BOASt PDF'`, item.versions[0].label === 'BOASt PDF');
  check(`item ${i}: versions[0].url is absolute http(s)`, /^https?:\/\//.test(item.versions[0].url));
  check(`item ${i}: no summary invented`, !('summary' in item));
  check(
    `item ${i}: no frontend-only Guideline fields leaked`,
    !['id', 'section', 'type', 'status', 'priority', 'archived', 'lastChecked'].some((k) => k in item),
  );
}

console.log('\n[5] Edge cases');
eq('empty html yields no items', parseBoaIndex('', BASE).length, 0);
eq('html with no asset links yields no items', parseBoaIndex('<a href="/x">y</a>', BASE).length, 0);
eq('parse is deterministic (same input twice)', parseBoaIndex(FIXTURE, BASE), parsed);
eq(
  'baseUrl only affects relative hrefs',
  parseBoaIndex('<a href="https://other.test/asset/Z">Z</a>', BASE)[0].versions[0].url,
  'https://other.test/asset/Z',
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
