/**
 * scripts/tests/bofas-discovery-adapter.test.ts
 * ─────────────────────────────────────────────
 * Offline parse tests for the Discovery V2 BOFAS parsers in
 * scripts/adapters/bofas.ts: parseBofasPublicationsSurface,
 * parseBofasRoundTableIndex and gateBofasScope. NO NETWORK. Compact synthetic
 * HTML in the shape of the live DNN pages (verified 2026-11-05).
 *
 * parseBofasStatedLabels (batch 1) keeps its own test in
 * discovery-adapters.test.ts and is not re-tested here.
 *
 * Run:   npx tsx scripts/tests/bofas-discovery-adapter.test.ts
 */
import {
  parseBofasPublicationsSurface,
  parseBofasRoundTableIndex,
  gateBofasScope,
  BOFAS_PUBLICATIONS_SURFACE,
  BOFAS_ROUND_TABLE_SURFACE,
} from '../adapters/bofas';
import { parseBofasPublicationsIndex } from '../sync-providers';
import { normaliseCandidateUrl, documentIdentityKey } from '../lib/ingestion';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const PUBS = `
<div class="DnnModule"><ul class="nav"><li><a href="/clinician/research">Research</a></li><li><a href="/Portals/0/Newsletters/Aug2018.pdf?ver=x">Newsletter</a></li></ul></div>
<div class="content">
<h1>BOFAS Statements / Publications</h1>
<h2>BOFAS Position Statements</h2>
<p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d" onclick="window.open(this.href);return false;">BOFAS Position Statement on VTE&nbsp;</a>(2025)</p>
<p><a href="/Portals/0/Position Statements/BOFAS Statement on TAR .pdf?ver=8V10WJHt8JFkvV0bwSPaAw%3d%3d">BOFAS Position Statement on Total Ankle Replacement</a> (2019)</p>
<h2>BOFAS Guidelines and Pathways</h2>
<p><a href="/Portals/0/Position Statements/BOFAS-BOA ankle fractures.pdf?ver=DRs-xD9G0KoUanboCOYO6Q%3d%3d">BOFAS / BOA Ankle Fracture BOAST Guidance</a> (2016)</p>
<p><a href="/Portals/0/Position Statements/BOFAS Pathways 2.pdf?ver=SZTpbRZbo5uYZb2quw2UMw%3d%3d">BOFAS Pathways of Care in Foot and Ankle Surgery</a></p>
<p><a href="/Portals/0/Position Statements/BOFAS Pathways 2.pdf?ver=SZTpbRZbo5uYZb2quw2UMw%3d%3d">BOFAS Pathways of Care in Foot and Ankle Surgery</a></p>
<p><a href="/Portals/0/Position Statements/Untitled.pdf"></a> (2020)</p>
<p><a href="/download?file=report.pdf">Download via query (not a PDF path)</a></p>
<h2>National COVID Audit (UK-FALCON)</h2>
<p><a href="/Portals/0/Research/FALCON-Report-Phase 1 and 2 final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d">UK Foot and Ankle COVID-19 National Audit (UK-FALCON) - Final Report</a> (2022)</p>
<h2>Archived Statements</h2>
<p><a href="/Portals/0/Position Statements/Old Statement.pdf">BOFAS Position Statement on Something Old</a> (2012)</p>
</div>`;

console.log('\n[1] publications surface: items, sections, labels, exclusions');
{
  const r = parseBofasPublicationsSurface(PUBS, BOFAS_PUBLICATIONS_SURFACE);
  eq('items parsed', r.items.length, 6);
  eq('excluded, in page order', r.excluded.map((e) => e.reason.slice(0, 24)), [
    'PDF link outside any hea',
    'duplicate of an item alr',
    'PDF anchor with no link ',
    '".pdf" appears outside t',
  ]);
  const vte = r.items[0];
  eq('title is the anchor text, whitespace/nbsp collapsed', vte.topic, 'BOFAS Position Statement on VTE');
  eq('href resolved against the surface with spaces encoded, ?ver= preserved verbatim', vte.discoveredUrl, 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d');
  eq('section heading recorded', vte.sectionHeading, 'BOFAS Position Statements');
  eq('year label "(2025)" recorded verbatim (page-body)', vte.statedLabels.find((l) => !l.fieldLabel)?.value, '(2025)');
  eq('section heading also recorded as a stated label', vte.statedLabels.find((l) => l.fieldLabel === 'section heading')?.value, 'BOFAS Position Statements');
  eq('an item with no bracketed year gets no year label (absence is not "undated")', r.items[3].statedLabels.filter((l) => !l.fieldLabel).length, 0);
  eq('items under the second h2 carry that heading', r.items[2].sectionHeading, 'BOFAS Guidelines and Pathways');
  check('nav PDF (newsletter) is excluded with the "outside any headed section" reason, not treated as guidance', !r.items.some((i) => /Aug2018/.test(i.discoveredUrl)) && r.excluded.some((e) => /Aug2018/.test(e.url) && /outside any headed/.test(e.reason)));
}

console.log('\n[2] parity with the sync-providers parser (the staging owner)');
{
  const v2 = parseBofasPublicationsSurface(PUBS, BOFAS_PUBLICATIONS_SURFACE).items.map((i) => i.discoveredUrl);
  const v1 = parseBofasPublicationsIndex(PUBS, BOFAS_PUBLICATIONS_SURFACE).map((d) => d.versions[0].url);
  // v1 matches any href containing ".pdf" anywhere on the page (including the
  // query-string one and a nav PDF) and keeps empty titles out. V2 is a
  // STRICT SUBSET: every V2 item is a v1 item; V2 additionally drops PDFs
  // outside a headed section and ".pdf" in a query string. Both differences
  // are documented and visible in `excluded`.
  check('every V2 item is also a sync-parser item (V2 never invents a document)', v2.every((u) => v1.includes(u)), JSON.stringify({ v1, v2 }));
  check('V2 excludes the query-string ".pdf" that v1 accepts (documented difference)', !v2.some((u) => /download\?file/.test(u)) && v1.some((u) => /download\?file/.test(u)));
  check('V2 excludes the nav PDF that v1 accepts (documented difference)', !v2.some((u) => /Aug2018/.test(u)) && v1.some((u) => /Aug2018/.test(u)));
}

console.log('\n[3] scope gate');
{
  const r = parseBofasPublicationsSurface(PUBS, BOFAS_PUBLICATIONS_SURFACE);
  const falcon = r.items.find((i) => /FALCON/.test(i.topic))!;
  check('UK-FALCON audit report filtered by its section heading', /national audit report/.test(gateBofasScope(falcon) ?? ''));
  eq('a position statement is admitted', gateBofasScope(r.items[0]), null);
  eq('an archived-section item is admitted by the gate (status is the classifier\'s business, not scope)', gateBofasScope(r.items.find((i) => /Something Old/.test(i.topic))!), null);
}

console.log('\n[4] url keys on BOFAS hrefs (existing functions; nothing new here)');
{
  const r = parseBofasPublicationsSurface(PUBS, BOFAS_PUBLICATIONS_SURFACE);
  const url = r.items[0].discoveredUrl;
  check('?ver= is stripped by both existing keys', !normaliseCandidateUrl(url).includes('ver=') && !documentIdentityKey(url).includes('ver='));
  eq('identity key keeps %20 (reserved, never decoded)', documentIdentityKey(url).includes('%20'), true);
}

const RT = `
<h1>Consensus Statements from the Round Table Meetings</h1>
<p><a href="/Portals/0/RoundTable_Booklets/Round Table - 2011 - Padova.pdf?ver=cTZ1">1st Round Table Meeting - 2011 - Padova</a></p>
<p><a href="/Portals/0/RoundTable_Booklets/Round Table - 2025 - Sheffield.pdf?ver=nZHk">12th Round Table Meeting - 2025 - Sheffield</a></p>
<p><a href="/Portals/0/RoundTable_Booklets/Round Table - 2025 - Sheffield.pdf?ver=nZHk">12th Round Table Meeting - 2025 - Sheffield</a></p>
<p><a href="/Portals/0/Education/Course Flyer.pdf">Foot &amp; Ankle Course Flyer 2026</a></p>
<p><a href="/clinician/education">Education</a></p>`;

console.log('\n[5] round-table booklets surface');
{
  const r = parseBofasRoundTableIndex(RT, BOFAS_ROUND_TABLE_SURFACE);
  eq('two booklets parsed', r.items.length, 2);
  eq('course flyer PDF excluded (does not name a Round Table meeting)', r.excluded.filter((e) => /Round Table meeting/.test(e.reason)).length, 1);
  eq('duplicate excluded', r.excluded.filter((e) => /duplicate/.test(e.reason)).length, 1);
  eq('anchor text kept as a stated label (year + city, never parsed)', r.items[0].statedLabels[0].value, '1st Round Table Meeting - 2011 - Padova');
  eq('section heading is the page h1', r.items[0].sectionHeading, 'Consensus Statements from the Round Table Meetings');
  eq('empty page → 0 items', parseBofasRoundTableIndex('', BOFAS_ROUND_TABLE_SURFACE).items.length, 0);
}

console.log('\n[6] empty and malformed');
{
  eq('empty publications page → 0 items, 0 excluded', JSON.stringify(parseBofasPublicationsSurface('', BOFAS_PUBLICATIONS_SURFACE)), JSON.stringify({ items: [], excluded: [] }));
  const r = parseBofasPublicationsSurface('<h2>Section</h2><p><a href="http://">Broken</a><a href="/x.pdf">Unclosed', BOFAS_PUBLICATIONS_SURFACE);
  eq('unparseable href skipped, trailing unclosed anchor still read', r.items.length, 1);
  eq('…and it carries the section it sits under', r.items[0].sectionHeading, 'Section');
  const headless = parseBofasPublicationsSurface('<p><a href="/y.pdf">A document on a page with no headings</a> (2024)</p>', BOFAS_PUBLICATIONS_SURFACE);
  eq('a page with NO headings admits nothing (P2-5: not the index structure this parser knows)', headless.items.length, 0);
  check('… and the PDF is excluded VISIBLY with a structural reason', headless.excluded.length === 1 && /no content headings/.test(headless.excluded[0].reason));
}


console.log('\n[7] P2-5: structurally changed indexes must not silently admit unrelated PDFs');
{
  // A template change that drops every heading but keeps the links: nothing
  // admitted, everything accounted for in `excluded`.
  const dropped = parseBofasPublicationsSurface(
    '<div class="nav"><a href="/Portals/0/newsletter.pdf">Newsletter</a></div><p><a href="/Portals/0/Position Statements/A.pdf">BOFAS Position Statement on A</a> (2024)</p>',
    BOFAS_PUBLICATIONS_SURFACE,
  );
  eq('0 items', dropped.items.length, 0);
  eq('2 excluded, both naming the structural reason', dropped.excluded.filter((e) => /no content headings/.test(e.reason)).length, 2);
  // A page WITH headings still excludes a PDF outside every headed section
  // (sidebar newsletter) and admits the one under a heading.
  const sidebar = parseBofasPublicationsSurface(
    '<div class="sidebar"><a href="/Portals/0/newsletter.pdf">Newsletter</a></div><h2>BOFAS Position Statements</h2><p><a href="/Portals/0/Position Statements/A.pdf">BOFAS Position Statement on A</a> (2024)</p>',
    BOFAS_PUBLICATIONS_SURFACE,
  );
  eq('only the headed PDF admitted', sidebar.items.map((i) => i.topic), ['BOFAS Position Statement on A']);
  check('sidebar PDF excluded as outside any headed section', sidebar.excluded.some((e) => /newsletter\.pdf/.test(e.url) && /outside any headed content section/.test(e.reason)));
  // Arithmetic: every PDF link is either an item or an exclusion.
  eq('items + excluded = PDF links on the page', sidebar.items.length + sidebar.excluded.length, 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
