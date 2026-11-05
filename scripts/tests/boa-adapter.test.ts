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
import { BOAAdapter, BoaIndexStructureError, createRSSAdapter, parseBoaIndex } from '../sync-providers';

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

// The original parsing-rule fixture, now inside one section (an <h4> and the
// list that belongs to it): a flat, heading-less page is refused fail-closed
// (see [7]). Every expectation below is unchanged from before SAF-21.
const FIXTURE = `
<html><body>
  <h4>Clinical BOASts</h4>
  <ul>
    <li><a href="/asset/AAAA-1111/">First standard</a></li>
    <li><a href="https://www.boa.ac.uk/asset/BBBB-2222/">Second   standard
       with   collapsed    whitespace</a></li>
    <li><a href="/asset/AAAA-1111/">Duplicate of the first</a></li>
    <li><a href="/asset/CCCC-3333/">Download and read the full guidelines for BOA Standards here</a></li>
    <li><a href="/asset/DDDD-4444/"></a></li>
    <li><a href="/standards-guidance/other.html">Not an asset link</a></li>
    <li><a href="/asset/EEEE-5555/">   Padded topic   </a></li>
    <li><a>Anchor with no href</a></li>
  </ul>
</body></html>`;

const parsed = parseBoaIndex(FIXTURE, BASE);

// 8 anchors in the fixture; 5 are excluded — the duplicate href, the noise
// phrase, the empty text, the non-asset href, and the anchor with no href.
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
  check(`item ${i}: versions[0].label is the owning heading, verbatim`, item.versions[0].label === 'Clinical BOASts');
  check(`item ${i}: versions[0].url is absolute http(s)`, /^https?:\/\//.test(item.versions[0].url));
  check(`item ${i}: no summary invented`, !('summary' in item));
  check(`item ${i}: no date invented (none stated)`, !('date' in item.versions[0]));
  check(
    `item ${i}: no frontend-only Guideline fields leaked`,
    !['id', 'section', 'type', 'status', 'priority', 'archived', 'lastChecked'].some((k) => k in item),
  );
}

console.log('\n[5] Edge cases');
eq('parse is deterministic (same input twice)', parseBoaIndex(FIXTURE, BASE), parsed);
eq(
  'baseUrl only affects relative hrefs',
  parseBoaIndex('<h4>S</h4><ul><li><a href="https://other.test/asset/Z">Z</a></li></ul>', BASE)[0].versions[0].url,
  'https://other.test/asset/Z',
);

console.log('\n[6] Publisher section and date evidence (SAF-21)');

// Hand-authored, structure-only fixture modelled on the BOASt index layout
// (h4 section heading, then the list that belongs to it, each asset link
// followed by an <em> date). Titles and asset ids are synthetic: no publisher
// text is copied.
const SECTIONS = `
<html><body>
  <h1>Standards</h1>
  <h4>Introduction</h4>
  <p><a href="/asset/BUNDLE-0000/">Download and read the full guidelines for BOA Standards (BOASts / SpecS) here</a></p>
  <h4>What is a standard?</h4>
  <p>Prose with no list.</p>
  <h4>Clinical<a href="/standards-guidance/clinical.html">&nbsp;BOASts</a></h4>
  <ul>
    <li><a href="https://www.boa.ac.uk/asset/AAAA%2D0001/"><span class="font-icon"></span> Clinical standard one </a> <em>&nbsp; June 2026</em></li>
    <li><a href="/asset/AAAA%2D0002/">Clinical standard two</a> <em>&nbsp; Updated July 2025</em></li>
    <li><a href="/asset/AAAA%2D0003/">Clinical standard without a date</a></li>
  </ul>
  <h4><a href="/standards-guidance/process.html">Process BOASts</a></h4>
  <ul><li><a href="/asset/BBBB-0001/">Process standard one</a> <em>&nbsp;February 2026</em></li></ul>
  <h4><a href="/standards-guidance/specs.html">Specialty Standards (SpecS)</a></h4>
  <ul><li><a href="/asset/CCCC-0001/">Specialty standard one</a> <em>&nbsp; &nbsp;April 2025</em></li></ul>
  <h4><a href="/standards-guidance/archived.html">Archived Standards</a></h4>
  <ul>
    <li><a href="/asset/DDDD-0001/">Archived standard one</a> <em>&nbsp; Archived June 2026</em></li>
    <li><a href="/asset/DDDD-0002/">Archived standard two</a> <em>&nbsp; Archived February 2026</em></li>
  </ul>
  <h5>In this section</h5>
  <p><em>An emphasis outside any list</em> <a href="/standards-guidance/other.html">Not an asset link</a></p>
</body></html>`;

const sect = parseBoaIndex(SECTIONS, BASE);
const byTopic = new Map(sect.map((s) => [s.topic, s.versions[0]]));
eq('aggregate bundle under Introduction is excluded; every standard kept',
  sect.map((s) => s.topic),
  ['Clinical standard one', 'Clinical standard two', 'Clinical standard without a date', 'Process standard one',
    'Specialty standard one', 'Archived standard one', 'Archived standard two']);
eq('section membership: label is the heading that owns the list, verbatim (nbsp heading collapsed)',
  sect.map((s) => s.versions[0].label),
  ['Clinical BOASts', 'Clinical BOASts', 'Clinical BOASts', 'Process BOASts', 'Specialty Standards (SpecS)',
    'Archived Standards', 'Archived Standards']);
eq('date: publisher text from the same <li>, verbatim', byTopic.get('Clinical standard one')?.date, 'June 2026');
eq('date: "Updated …" wording preserved', byTopic.get('Clinical standard two')?.date, 'Updated July 2025');
eq('date: repeated &nbsp; collapsed', byTopic.get('Specialty standard one')?.date, 'April 2025');
check('date: absent when the <li> states none (nothing invented)', !('date' in (byTopic.get('Clinical standard without a date') ?? {})));
eq('archived records: heading AND the publisher\'s own "Archived …" date text are both kept',
  sect.filter((s) => s.versions[0].label === 'Archived Standards' && /^Archived /.test(s.versions[0].date ?? '')).map((s) => s.topic),
  ['Archived standard one', 'Archived standard two']);
check('archived records are not classified: same shape as any other item (no status, no reason)',
  sect.every((s) => Object.keys(s).sort().join() === 'source,topic,versions'));
eq('original URLs verbatim: absolute %2D href untouched; relative resolved without re-encoding',
  [byTopic.get('Clinical standard one')?.url, byTopic.get('Clinical standard two')?.url],
  ['https://www.boa.ac.uk/asset/AAAA%2D0001/', 'https://www.boa.ac.uk/asset/AAAA%2D0002/']);
eq('section counts per heading', Object.fromEntries([...new Set(sect.map((s) => s.versions[0].label))]
  .map((l) => [l, sect.filter((s) => s.versions[0].label === l).length])),
  { 'Clinical BOASts': 3, 'Process BOASts': 1, 'Specialty Standards (SpecS)': 1, 'Archived Standards': 2 });
eq('section parse is deterministic', parseBoaIndex(SECTIONS, BASE), sect);
eq('bundle with reworded tail is still excluded (and does not fail the parse)',
  parseBoaIndex(SECTIONS.replace('for BOA Standards (BOASts / SpecS) here', 'for all standards'), BASE).map((s) => s.topic),
  sect.map((s) => s.topic));

// Renamed sections: nothing is keyed on known heading names.
const renamed = parseBoaIndex(SECTIONS
  .replace('Clinical<a href="/standards-guidance/clinical.html">&nbsp;BOASts</a>', 'Clinical Standards (2027 edition)')
  .replace('>Archived Standards<', '>Withdrawn and Archived Documents<'), BASE);
eq('renamed headings: same items, in the same order', renamed.map((r) => r.topic), sect.map((s) => s.topic));
eq('renamed headings (incl. Archived): new heading text carried verbatim',
  [renamed[0].versions[0].label, renamed[5].versions[0].label],
  ['Clinical Standards (2027 edition)', 'Withdrawn and Archived Documents']);
eq('renamed headings: dates unaffected', renamed.map((r) => r.versions[0].date), sect.map((s) => s.versions[0].date));

console.log('\n[7] Fail-closed: missing or ambiguous section structure is a parse FAILURE');

const throwsStructure = (name: string, html: string, re: RegExp) => {
  let err: unknown;
  try { parseBoaIndex(html, BASE); } catch (e) { err = e; }
  check(name, err instanceof BoaIndexStructureError && re.test((err as Error).message),
    err instanceof Error ? err.message : 'did not throw');
};
throwsStructure('Archived Standards heading MISSING: its links have no owning heading',
  SECTIONS.replace('<h4><a href="/standards-guidance/archived.html">Archived Standards</a></h4>', ''),
  /"Archived standard one".*not inside a list that directly follows an <h4>/);
throwsStructure('a stray asset link after the final list',
  SECTIONS.replace('<h5>In this section</h5>', '<h5>In this section</h5><p><a href="/asset/ZZZZ-9999/">Stray document</a></p>'),
  /"Stray document"/);
throwsStructure('changed markup: section headings are no longer <h4>',
  SECTIONS.replace(/<h4>/g, '<h3>').replace(/<\/h4>/g, '</h3>'),
  /not inside a list that directly follows an <h4>/);
throwsStructure('changed markup: an element now sits between a heading and its list',
  SECTIONS.replace('Process BOASts</a></h4>', 'Process BOASts</a></h4><p>Introductory note</p>'),
  /"Process standard one"/);
throwsStructure('changed markup: the list became a <div>',
  SECTIONS.replace('<ul><li><a href="/asset/CCCC-0001/">Specialty standard one</a> <em>&nbsp; &nbsp;April 2025</em></li></ul>',
    '<div><a href="/asset/CCCC-0001/">Specialty standard one</a> <em>April 2025</em></div>'),
  /"Specialty standard one"/);
throwsStructure('a section list whose heading has no text',
  SECTIONS.replace('<h4><a href="/standards-guidance/process.html">Process BOASts</a></h4>', '<h4> </h4>'),
  /follows an <h4> with no text/);
throwsStructure('the same document under two different sections',
  SECTIONS.replace('<li><a href="/asset/DDDD-0002/">Archived standard two</a>', '<li><a href="/asset/BBBB-0001/">Archived standard two</a>'),
  /listed under both "Process BOASts" and "Archived Standards"/);
throwsStructure('flat page with no sections (the pre-SAF-21 layout)',
  '<a href="/asset/AAAA-1111/">First standard</a>', /not inside a list/);
throwsStructure('empty page', '', /no asset links were found inside any section list/);
throwsStructure('page with no asset links (e.g. the wrong URL)', '<h4>S</h4><ul><li><a href="/x">y</a></li></ul>',
  /no asset links were found inside any section list/);
throwsStructure('a page with only the aggregate bundle', '<h4>Introduction</h4><p><a href="/asset/B-1/">Download and read the full guidelines for all standards</a></p>',
  /no asset links were found/);
check('the error is named for the run log', new BoaIndexStructureError('x').name === 'BoaIndexStructureError'
  && /^BOA index structure: /.test(new BoaIndexStructureError('x').message));

console.log('\n[8] Review follow-up: dates through wrappers; no inherited section ownership');

const one = (body: string) => parseBoaIndex(`<h4>Clinical</h4><ul>${body}</ul>`, BASE);
const dateOf = (body: string) => one(body)[0].versions[0].date;
eq('date: direct child <em> (unchanged)', dateOf('<li><a href="/asset/A/">Standard</a> <em>June 2026</em></li>'), 'June 2026');
eq('date: <em> inside a <p> wrapper', dateOf('<li><p><a href="/asset/A/">Standard</a> <em>Archived June 2026</em></p></li>'), 'Archived June 2026');
eq('date: <em> inside nested wrappers', dateOf('<li><div><span><a href="/asset/A/">Standard</a></span> <span><em>&nbsp; Updated July 2025</em></span></div></li>'), 'Updated July 2025');
check('date: absent when the <li> has no <em>', !('date' in one('<li><p><a href="/asset/A/">Standard</a></p></li>')[0].versions[0]));
check('date: emphasis inside the link text is not a date',
  !('date' in one('<li><a href="/asset/A/"><em>Standard</em></a></li>')[0].versions[0]));
check('date: <em> in a list nested inside the <li> is ignored', (() => {
  let err: unknown;
  let v: { date?: string } | undefined;
  try { v = one('<li><a href="/asset/A/">Standard</a><ul><li>Note <em>March 2020</em></li></ul></li>')[0].versions[0]; } catch (e) { err = e; }
  return !err && v !== undefined && !('date' in v);
})());
eq('date: own <em> kept, nested-list <em> ignored',
  dateOf('<li><p><a href="/asset/A/">Standard</a> <em>June 2026</em></p><ol><li><em>Archived 2019</em></li></ol></li>'), 'June 2026');
eq('date: a sibling item\'s <em> never leaks',
  one('<li><a href="/asset/A/">One</a></li><li><a href="/asset/B/">Two</a> <em>May 2024</em></li>').map((i) => i.versions[0].date ?? null),
  [null, 'May 2024']);

throwsStructure('nested heading, intervening markup, then a list: no inherited outer section',
  '<h4>Clinical</h4><ul><li><h4>Archived</h4><p>Note</p><ul><li><a href="/asset/A/">Document</a></li></ul></li></ul>',
  /"Document".*not inside a list that directly follows an <h4>/);
throwsStructure('asset link in an unheaded sub-list of a section list',
  '<h4>Clinical</h4><ul><li>Group<ul><li><a href="/asset/A/">Document</a></li></ul></li></ul>',
  /"Document".*not inside a list that directly follows an <h4>/);
throwsStructure('a section list nested inside another section list (two owners)',
  '<h4>Clinical</h4><ul><li><h4>Archived</h4><ul><li><a href="/asset/A/">Document</a></li></ul></li></ul>',
  /"Document".*section "Archived", which is nested inside section "Clinical"/);
eq('legitimate sibling section lists are unaffected',
  parseBoaIndex('<h4>Clinical</h4><ul><li><a href="/asset/A/">One</a> <em>June 2026</em></li></ul>'
    + '<h4>Archived</h4><ul><li><p><a href="/asset/B/">Two</a> <em>Archived May 2019</em></p></li></ul>', BASE)
    .map((i) => [i.topic, i.versions[0].label, i.versions[0].date]),
  [['One', 'Clinical', 'June 2026'], ['Two', 'Archived', 'Archived May 2019']]);
eq('section fixture [6] still parses identically', parseBoaIndex(SECTIONS, BASE), sect);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
