/**
 * scripts/tests/bsg-adapter.test.ts
 * ──────────────────────────────────
 * Offline tests for the BSG adapter's conformance to the ProviderAdapter
 * contract, and for parseBsgIndex's parsing rules.
 *
 * NO NETWORK. BSGAdapter.fetchCandidates() is never invoked here — calling it
 * would issue a live request to britishsarcomagroup.org.uk. Conformance is
 * checked structurally; the parsing rules are checked through the pure
 * parseBsgIndex export.
 *
 * Run:   npx tsx scripts/tests/bsg-adapter.test.ts      (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { BSGAdapter, parseBsgIndex } from '../sync-providers';

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

const BASE = 'https://britishsarcomagroup.org.uk/guidelines-2/';

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

console.log('\n[1] BSGAdapter conformance (instance, not constructor)');

assertAdapterShape('BSGAdapter', BSGAdapter);
eq('BSGAdapter identity: name', BSGAdapter.name, 'British Sarcoma Group (BSG)');
eq('BSGAdapter identity: sourceTag', BSGAdapter.sourceTag, 'BSG');

// ── parseBsgIndex parsing rules ─────────────────────────────────────────────
// Fixture mirrors the real page's Divi "promo module" structure, verified
// live 2026-08-26: div.et_pb_promo > h2.et_pb_module_header (title) +
// a.et_pb_promo_button[href] (link). Includes both BSG-hosted PDFs and
// externally-curated documents (matching the real "Other Resources" section),
// a module with no description paragraph (matching the real ESMO/Desmoid
// entries), and several noise cases the parser must reject.

console.log('\n[3] parseBsgIndex — selector, filter, dedupe, resolution, order');

const FIXTURE = `
<html><body>
  <div class="et_pb_promo">
    <div class="et_pb_promo_description">
      <h2 class="et_pb_module_header">STS Guidelines 2024</h2>
      <div><p>UK BSG Guidelines for the Management of Soft Tissue Sarcomas</p></div>
    </div>
    <div class="et_pb_button_wrapper">
      <a class="et_pb_button et_pb_promo_button" href="/wp-content/uploads/2026/02/DEVELO1.pdf" target="_blank">View Guidelines</a>
    </div>
  </div>

  <div class="et_pb_promo">
    <div class="et_pb_promo_description">
      <h2 class="et_pb_module_header">ESMO   (European Society   of Medical Oncology) Guidelines</h2>
    </div>
    <div class="et_pb_button_wrapper">
      <a class="et_pb_button et_pb_promo_button" href="https://www.esmo.org/guidelines/esmo-clinical-practice-guidelines-sarcoma-and-gist" target="_blank">View here</a>
    </div>
  </div>

  <div class="et_pb_promo">
    <div class="et_pb_promo_description">
      <h2 class="et_pb_module_header">STS Guidelines 2024</h2>
    </div>
    <div class="et_pb_button_wrapper">
      <a class="et_pb_button et_pb_promo_button" href="https://britishsarcomagroup.org.uk/wp-content/uploads/2026/02/DEVELO1.pdf" target="_blank">Duplicate of item 1 by URL</a>
    </div>
  </div>

  <div class="et_pb_promo">
    <div class="et_pb_promo_description">
      <h2 class="et_pb_module_header">Missing link module</h2>
    </div>
  </div>

  <div class="et_pb_promo">
    <div class="et_pb_button_wrapper">
      <a class="et_pb_button et_pb_promo_button" href="/some-doc.pdf" target="_blank">Missing header module</a>
    </div>
  </div>

  <div class="et_pb_promo_button">
    <h2 class="et_pb_module_header">Not a promo module (only has the button class)</h2>
    <a href="/decoy.pdf">Decoy</a>
  </div>

  <div class="et_pb_promo">
    <div class="et_pb_promo_description">
      <h2 class="et_pb_module_header">   Padded title   </h2>
    </div>
    <div class="et_pb_button_wrapper">
      <a class="et_pb_button et_pb_promo_button" href="https://link.springer.com/article/10.1245/s10434-014-3965-2" target="_blank">View here</a>
    </div>
  </div>
</body></html>`;

const parsed = parseBsgIndex(FIXTURE, BASE);

// 7 modules in the fixture; 4 are excluded — the duplicate URL, the module
// with no link, the module with no header, and the div that only carries the
// et_pb_promo_button class (not et_pb_promo, so the selector must not
// substring-match it).
eq('item count (dupe, no-link, no-header, non-promo-class all excluded)', parsed.length, 3);

eq('relative href resolved against baseUrl', parsed[0].versions[0].url, 'https://britishsarcomagroup.org.uk/wp-content/uploads/2026/02/DEVELO1.pdf');
eq('whitespace collapsed in topic', parsed[1].topic, 'ESMO (European Society of Medical Oncology) Guidelines');
eq('external (non-BSG-hosted) URL passed through unchanged', parsed[1].versions[0].url, 'https://www.esmo.org/guidelines/esmo-clinical-practice-guidelines-sarcoma-and-gist');
eq('topic trimmed', parsed[2].topic, 'Padded title');

eq('duplicate URL collapsed', parsed.filter((p) => p.versions[0].url.includes('DEVELO1.pdf')).length, 1);
eq('dedupe keeps the FIRST occurrence, not the last', parsed[0].topic, 'STS Guidelines 2024');
eq('decoy div (wrong class) never matched', parsed.filter((p) => p.topic.includes('Not a promo module')).length, 0);

eq(
  'document order preserved',
  parsed.map((p) => p.topic),
  ['STS Guidelines 2024', 'ESMO (European Society of Medical Oncology) Guidelines', 'Padded title'],
);

console.log('\n[4] parseBsgIndex output satisfies the DiscoveredItem contract');

for (const [i, item] of parsed.entries()) {
  check(`item ${i}: topic is a non-empty string`, typeof item.topic === 'string' && item.topic.length > 0);
  check(`item ${i}: source === 'BSG'`, item.source === 'BSG');
  check(`item ${i}: versions is a non-empty array`, Array.isArray(item.versions) && item.versions.length > 0);
  check(`item ${i}: versions[0].label === 'BSG Guideline Document'`, item.versions[0].label === 'BSG Guideline Document');
  check(`item ${i}: versions[0].url is absolute http(s)`, /^https?:\/\//.test(item.versions[0].url));
  check(`item ${i}: no summary invented`, !('summary' in item));
  check(
    `item ${i}: no frontend-only Guideline fields leaked`,
    !['id', 'section', 'type', 'status', 'priority', 'archived', 'lastChecked'].some((k) => k in item),
  );
}

console.log('\n[5] Edge cases');
eq('empty html yields no items', parseBsgIndex('', BASE).length, 0);
eq('html with no promo modules yields no items', parseBsgIndex('<a href="/x">y</a>', BASE).length, 0);
eq('parse is deterministic (same input twice)', parseBsgIndex(FIXTURE, BASE), parsed);
eq(
  'baseUrl only affects relative hrefs',
  parseBsgIndex('<div class="et_pb_promo"><h2 class="et_pb_module_header">Z</h2><a class="et_pb_promo_button" href="https://other.test/z">Z</a></div>', BASE)[0].versions[0].url,
  'https://other.test/z',
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
