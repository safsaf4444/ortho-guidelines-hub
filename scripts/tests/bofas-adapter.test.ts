/**
 * scripts/tests/bofas-adapter.test.ts
 * ─────────────────────────────────────
 * Offline tests for the BOFAS adapter's conformance to the ProviderAdapter
 * contract, and for parseBofasPublicationsIndex's parsing rules.
 *
 * SER-6 feasibility pilot, scoped to the BOFAS "Statements / Publications"
 * index only (Round Table booklets and the Hyperbook are explicitly out of
 * scope). NO NETWORK. BOFASAdapter.fetchCandidates() is never invoked here —
 * calling it would issue a live request to bofas.org.uk. Parsing rules are
 * checked through the pure parseBofasPublicationsIndex export.
 *
 * Run:   npx tsx scripts/tests/bofas-adapter.test.ts      (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { BOFASAdapter, parseBofasPublicationsIndex } from '../sync-providers';

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

const BASE = 'https://www.bofas.org.uk/clinician/research/bofas-publications';

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

console.log('\n[1] BOFASAdapter conformance (instance, not constructor)');

assertAdapterShape('BOFASAdapter', BOFASAdapter);
eq('BOFASAdapter identity: name', BOFASAdapter.name, 'British Orthopaedic Foot & Ankle Society (BOFAS)');
eq('BOFASAdapter identity: sourceTag', BOFASAdapter.sourceTag, 'BOFAS');

// ── parseBofasPublicationsIndex parsing rules ───────────────────────────────
// Fixture mirrors the real page's structure, verified live 2026-08-27:
// <h2> section headers, one <p><a href="....pdf...">Title</a> (year)</p> per
// item. Includes the real inconsistency the live page has (one href uses a
// raw space, another %20), the DNN "?ver=" cache-busting query string
// (preserved verbatim, not stripped), the UK-FALCON item (discovered like
// any other — nothing in the parser treats it specially), and several noise
// cases the parser must reject.

console.log('\n[3] parseBofasPublicationsIndex — selector, filter, dedupe, resolution, order');

const FIXTURE = `
<html><body>
  <h1>BOFAS Statements / Publications</h1>
  <h2>BOFAS Position Statements</h2>
  <p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d" onclick="window.open(this.href, '', 'resizable=no'); return false;">BOFAS Position Statement on VTE&nbsp;</a>(2025)</p>

  <p><a href="/Portals/0/Position%20Statements/DiabeticFoot%20FINAL.pdf?ver=_-wg0CNL_rfsnHabVCK2Bg%3d%3d">BOFAS / BOA / Multidisciplinary Diabetic Foot Guidelines</a>&nbsp;(2016)</p>

  <h2>National COVID Audit (UK-FALCON)</h2>
  <p><a href="/Portals/0/Research/FALCON-Report-Phase 1 and 2 final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d">UK Foot and Ankle COVID-19 National Audit (UK-FALCON) - Final Report</a> (2022)</p>

  <p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d">Duplicate of item 1 by URL</a></p>

  <p><a href="   Weirdly whitespaced text   .pdf">   Padded    title   with   collapsed   whitespace   </a></p>

  <p><a href="/some/link.pdf"></a></p>

  <p><a href="/clinician/research">Not a PDF — nav link, must not match</a></p>

  <p><a>Anchor with no href at all</a></p>
</body></html>`;

const parsed = parseBofasPublicationsIndex(FIXTURE, BASE);

// 6 anchors match a[href*=".pdf"] in the fixture (the nav link and the
// href-less anchor never match the selector at all); of those 6, 2 are
// excluded — the duplicate URL and the empty-text one — leaving 4.
eq('item count (dupe + empty-text excluded; non-pdf/no-href never matched)', parsed.length, 4);

eq('relative href resolved against baseUrl', parsed[0].versions[0].url, 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d');
eq('trailing "(year)" text OUTSIDE the anchor is not captured in topic', parsed[0].topic, 'BOFAS Position Statement on VTE');
eq('DNN "?ver=" cache-busting query string preserved verbatim, not stripped', parsed[0].versions[0].url.includes('?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d'), true);
eq('href already using %20 resolves the same way', parsed[1].versions[0].url, 'https://www.bofas.org.uk/Portals/0/Position%20Statements/DiabeticFoot%20FINAL.pdf?ver=_-wg0CNL_rfsnHabVCK2Bg%3d%3d');

console.log('\n[4] UK-FALCON is discovered like any other item — not specially excluded or flagged');
const falcon = parsed.find((p) => p.topic.includes('UK-FALCON'));
check('UK-FALCON item is present in parser output', falcon !== undefined);
check('UK-FALCON item is a plain DiscoveredItem, not tagged/annotated differently', falcon !== undefined && Object.keys(falcon).sort().join(',') === 'source,topic,versions');

eq('duplicate URL collapsed', parsed.filter((p) => p.versions[0].url.includes('BOFAS%20VTE%20Statement')).length, 1);
eq('dedupe keeps the FIRST occurrence, not the last', parsed[0].topic, 'BOFAS Position Statement on VTE');
eq('whitespace collapsed and trimmed in topic', parsed.find((p) => p.topic.includes('Padded title'))?.topic, 'Padded title with collapsed whitespace');
eq('nav link (no .pdf in href) never matched', parsed.filter((p) => p.topic.includes('Not a PDF')).length, 0);

console.log('\n[5] parseBofasPublicationsIndex output satisfies the DiscoveredItem contract');

for (const [i, item] of parsed.entries()) {
  check(`item ${i}: topic is a non-empty string`, typeof item.topic === 'string' && item.topic.length > 0);
  check(`item ${i}: source === 'BOFAS'`, item.source === 'BOFAS');
  check(`item ${i}: versions is a non-empty array`, Array.isArray(item.versions) && item.versions.length > 0);
  check(`item ${i}: versions[0].label === 'BOFAS Publication PDF'`, item.versions[0].label === 'BOFAS Publication PDF');
  check(`item ${i}: versions[0].url is absolute http(s)`, /^https?:\/\//.test(item.versions[0].url));
  check(`item ${i}: no summary invented`, !('summary' in item));
  check(
    `item ${i}: no frontend-only Guideline fields leaked`,
    !['id', 'section', 'type', 'status', 'priority', 'archived', 'lastChecked'].some((k) => k in item),
  );
}

console.log('\n[6] Edge cases');
eq('empty html yields no items', parseBofasPublicationsIndex('', BASE).length, 0);
eq('html with no .pdf links yields no items', parseBofasPublicationsIndex('<a href="/x">y</a>', BASE).length, 0);
eq('parse is deterministic (same input twice)', parseBofasPublicationsIndex(FIXTURE, BASE), parsed);
eq(
  'baseUrl only affects relative hrefs',
  parseBofasPublicationsIndex('<a href="https://other.test/z.pdf">Z</a>', BASE)[0].versions[0].url,
  'https://other.test/z.pdf',
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
