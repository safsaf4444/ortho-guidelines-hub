/**
 * scripts/tests/bssh-adapter.test.ts
 * ────────────────────────────────────
 * Offline tests for the BSSH adapter's conformance to the ProviderAdapter
 * contract, and for parseBsshGuidelinesIndex's parsing rules.
 *
 * NO NETWORK. BSSHAdapter.fetchCandidates() is never invoked here — calling
 * it would issue a live request to bssh.ac.uk. Parsing rules are checked
 * through the pure parseBsshGuidelinesIndex export.
 *
 * Run:   npx tsx scripts/tests/bssh-adapter.test.ts      (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { BSSHAdapter, parseBsshGuidelinesIndex } from '../sync-providers';

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

const BASE = 'https://www.bssh.ac.uk/professionals/guidelines.aspx';

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

console.log('\n[1] BSSHAdapter conformance (instance, not constructor)');

assertAdapterShape('BSSHAdapter', BSSHAdapter);
eq('BSSHAdapter identity: name', BSSHAdapter.name, 'British Society for Surgery of the Hand (BSSH)');
eq('BSSHAdapter identity: sourceTag', BSSHAdapter.sourceTag, 'BSSH');

// ── parseBsshGuidelinesIndex parsing rules ──────────────────────────────────
// Fixture mirrors the real page's structure, verified live 2026-08-27: a
// single <ul> mixing .aspx sub-page links (must be ignored), .pdf documents
// (the only thing captured), a GIRFT-hosted external .pdf (discovered like
// any other item — blocked-domain filtering happens centrally, not here),
// and inline journal citations in prose (sagepub, non-.pdf, must be ignored).

console.log('\n[3] parseBsshGuidelinesIndex — selector, filter, dedupe, resolution, order');

const FIXTURE = `
<html><body>
  <h1>Guidelines &amp; Resources</h1>
  <ul>
    <li><a href="anaesthesia.aspx">Anaesthesia resources (incl. WALANT)</a></li>
    <li><a href="/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20trigger%20finger%20PUBLISHED(1).pdf" target="_blank">The BEST Guidelines on Trigger Digits</a></li>
    <li><a href="/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20UCL%20Final.pdf" target="_blank">The BEST Guidelines for UCL of Thumb   Injuries</a></li>
    <li><a href="/professionals/crps_guidelines.aspx">CRPS Guidelines</a></li>
    <li><a href="/professionals/coronavirus_information.aspx">Coronavirus information</a></li>
    <li><a href="https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/Dupuytrens.drawio.pdf" target="_blank">Dupuytrens disease,&nbsp;Hand surgery, December 2023</a></li>
    <li><a href="/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20trigger%20finger%20PUBLISHED(1).pdf" target="_blank">Duplicate of item 1 by URL</a></li>
  </ul>
  <p>Guideline on managing thumb base osteoarthritis. Click <a href="https://journals.sagepub.com/doi/full/10.1177/17531934241313206">here</a> to read</p>
  <p><a href="/_userfiles/pages/files/professionals/Guidelines/RAUK-BOA-peripheral-nerve-guidelines-Final.pdf" target="_blank">here</a></p>
  <p><a href="/some/link.pdf"></a></p>
</body></html>`;

const parsed = parseBsshGuidelinesIndex(FIXTURE, BASE);

// 6 anchors match a[href*=".pdf"] in the fixture (the two .aspx links, the
// sagepub journal citation, and the CRPS/Coronavirus .aspx links never match
// the selector at all): BEST trigger finger, BEST UCL, GIRFT Dupuytrens, the
// duplicate of BEST trigger finger, the RAUK-BOA "here" link, and the
// empty-text link. Of those 6, the duplicate and the empty-text one are
// excluded, leaving 4.
eq('item count (dupe + empty-text excluded; non-pdf links never matched)', parsed.length, 4);

eq('relative href resolved against baseUrl', parsed[0].versions[0].url, 'https://www.bssh.ac.uk/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20trigger%20finger%20PUBLISHED(1).pdf');
eq('whitespace collapsed in topic', parsed[1].topic, 'The BEST Guidelines for UCL of Thumb Injuries');
eq('GIRFT-hosted external PDF is discovered like any other item (blocking happens downstream, not here)', parsed[2].versions[0].url, 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/Dupuytrens.drawio.pdf');
eq('generic anchor text ("here") is captured verbatim, not filtered', (() => {
  const withHereText = parseBsshGuidelinesIndex('<a href="/x.pdf">here</a>', BASE);
  return withHereText[0]?.topic;
})(), 'here');

eq('duplicate URL collapsed', parsed.filter((p) => p.versions[0].url.includes('BEST%20trigger%20finger')).length, 1);
eq('dedupe keeps the FIRST occurrence, not the last', parsed[0].topic, 'The BEST Guidelines on Trigger Digits');
eq('.aspx sub-page links never matched', parsed.filter((p) => p.topic.includes('CRPS') || p.topic.includes('Coronavirus') || p.topic.includes('Anaesthesia')).length, 0);
eq('inline sagepub journal citation (non-.pdf) never matched', parsed.filter((p) => p.versions[0].url.includes('sagepub')).length, 0);

console.log('\n[4] parseBsshGuidelinesIndex output satisfies the DiscoveredItem contract');

for (const [i, item] of parsed.entries()) {
  check(`item ${i}: topic is a non-empty string`, typeof item.topic === 'string' && item.topic.length > 0);
  check(`item ${i}: source === 'BSSH'`, item.source === 'BSSH');
  check(`item ${i}: versions is a non-empty array`, Array.isArray(item.versions) && item.versions.length > 0);
  check(`item ${i}: versions[0].label === 'BSSH Guideline Document'`, item.versions[0].label === 'BSSH Guideline Document');
  check(`item ${i}: versions[0].url is absolute http(s)`, /^https?:\/\//.test(item.versions[0].url));
  check(`item ${i}: no summary invented`, !('summary' in item));
  check(
    `item ${i}: no frontend-only Guideline fields leaked`,
    !['id', 'section', 'type', 'status', 'priority', 'archived', 'lastChecked'].some((k) => k in item),
  );
}

console.log('\n[5] Edge cases');
eq('empty html yields no items', parseBsshGuidelinesIndex('', BASE).length, 0);
eq('html with no .pdf links yields no items', parseBsshGuidelinesIndex('<a href="/x.aspx">y</a>', BASE).length, 0);
eq('parse is deterministic (same input twice)', parseBsshGuidelinesIndex(FIXTURE, BASE), parsed);
eq(
  'baseUrl only affects relative hrefs',
  parseBsshGuidelinesIndex('<a href="https://other.test/z.pdf">Z</a>', BASE)[0].versions[0].url,
  'https://other.test/z.pdf',
);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
