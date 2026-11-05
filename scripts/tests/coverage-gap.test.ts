/**
 * scripts/tests/coverage-gap.test.ts
 * ──────────────────────────────────
 * Offline tests for scripts/lib/coverage-gap.ts and the CLI wrapper in
 * scripts/coverage-gap.ts. NO NETWORK, NO DATABASE. The catalogue is a small
 * synthetic Guideline[]; discovered items are hand-built records.
 *
 * What is pinned:
 *   * each of the seven classes is reachable, and from the evidence it claims;
 *   * reserved vs unreserved escapes go through the EXISTING key functions
 *     (nothing here normalises a URL on its own);
 *   * distinct documents are never collapsed: a two-owner URL and a near-tie
 *     soft match both come out AMBIGUOUS_REVIEW;
 *   * HTTP 200 and "unreachable" play no part (there is no fetch here at all);
 *   * output is deterministic for a fixed discoveredAt;
 *   * the module cannot stage or publish: it imports nothing that can.
 *
 * Run:   npx tsx scripts/tests/coverage-gap.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Guideline } from '../../src/data/guidelines-data';
import type { DiscoveredRecord } from '../adapters/types';
import {
  ALL_GAP_CLASSES,
  boaAssetGuidOf,
  detectCoverageGaps,
  doiOf,
  editionHint,
  markCrossProviderDuplicates,
  renderGapReport,
  type GapInput,
} from '../lib/coverage-gap';
import { documentIdentityKey, normaliseCandidateUrl } from '../lib/ingestion';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Synthetic catalogue ────────────────────────────────────────────────────

const INDEX = 'https://www.example-society.org/guidelines/';
function g(id: string, topic: string, source: string, versions: Array<{ label: string; url: string; date?: string }>, subGroup?: string): Guideline {
  return {
    id, topic, source, section: 'Test', type: 'Guideline', summary: '', regionalVariation: false, localOverlayNeeded: false,
    lastChecked: '2026-01-01', status: 'current', sourceType: 'specialist-society', guidanceStatus: 'current',
    ...(subGroup ? { subGroup } : {}),
    versions: [...versions, { label: 'Fallback / index page', url: INDEX }],
  } as Guideline;
}

const CATALOGUE: Guideline[] = [
  g('bofas-vte', 'VTE prophylaxis in foot & ankle surgery - BOFAS position statement', 'BOFAS', [{ label: 'June 2025', url: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf' }]),
  g('ankle-fracture', 'Management of ankle fractures', 'BOA (BOASt) with BOFAS', [{ label: 'August 2016', url: 'https://www.boa.ac.uk/asset/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/' }]),
  g('end-stage-ankle-arthritis', 'Management of end-stage ankle arthritis (SpecS)', 'BOA SpecS with BOFAS', [{ label: 'April 2025', url: 'https://www.boa.ac.uk/asset/A811FC01-EFC3-44B7-BF6C4B0D4D4C2C85/' }]),
  g('bsg-bone', 'UK guidelines for the management of bone sarcomas', 'British Sarcoma Group (BSG)', [{ label: 'November 2024', url: 'https://doi.org/10.1038/s41416-024-02868-4' }]),
  g('case-doc', 'Case sensitive document', 'BOFAS', [{ label: '2020', url: 'https://www.bofas.org.uk/Docs/Report.pdf' }]),
  g('mbd-a', 'Metastatic bone disease (BOAST)', 'BOA (BOASt)', [{ label: 'June 2022', url: 'https://www.boa.ac.uk/asset/B047D54A-170C-4C57-87C9C5DFAC4641E7/' }]),
  g('mbd-b', 'Metastatic bone disease - policy', 'BOOS / BOA', [{ label: '2016', url: 'https://baso.org.uk/mbd.pdf' }, { label: 'BOAST (2022)', url: 'https://www.boa.ac.uk/asset/B047D54A-170C-4C57-87C9C5DFAC4641E7/' }]),
  g('round-table', 'BOFAS Round Table consensus statements (12 booklets, 2011-2025)', 'BOFAS', [{ label: '2025 (12th)', url: 'https://www.bofas.org.uk/Portals/0/RoundTable_Booklets/Round%20Table%20-%202025%20-%20Sheffield.pdf' }]),
  g('hallux-a', 'Hallux valgus surgery in adults', 'BOFAS', [{ label: '2019', url: 'https://www.bofas.org.uk/a.pdf' }]),
  g('hallux-b', 'Hallux valgus surgery in adolescents', 'BOFAS', [{ label: '2021', url: 'https://www.bofas.org.uk/b.pdf' }]),
  g('moved-doc', 'Guidance that moved', 'BOFAS', [{ label: '2018', url: 'https://www.bofas.org.uk/old/moved.pdf' }]),
];

const rec = (topic: string, url: string, extra: Partial<DiscoveredRecord> = {}): DiscoveredRecord => ({ topic, discoveredUrl: url, statedLabels: [], ...extra });
const label = (value: string, fieldLabel?: string) => ({ origin: 'page-body' as const, value, readFrom: 'https://www.bofas.org.uk/x', ...(fieldLabel ? { fieldLabel } : {}) });

function run(items: DiscoveredRecord[], extra: Partial<GapInput> = {}) {
  return detectCoverageGaps({
    provider: 'BOFAS', providerName: 'BOFAS', catalogueProvider: 'BOFAS',
    surfaceUrl: 'https://www.bofas.org.uk/clinician/research/bofas-publications',
    parse: { items, excluded: [] }, guidelines: CATALOGUE, discoveredAt: '2026-11-05T00:00:00.000Z',
    snapshotLabel: 'synthetic test catalogue', ...extra,
  });
}
const one = (items: DiscoveredRecord[], extra: Partial<GapInput> = {}) => run(items, extra).findings[0];

console.log('\n[1] exact URL identity → ALREADY_REPRESENTED (cache token ignored by the existing key)');
{
  const f = one([rec('BOFAS Position Statement on VTE', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=abc%3d%3d', { statedLabels: [label('(2025)')] })]);
  eq('class', f.class, 'ALREADY_REPRESENTED');
  eq('matched', f.matchedGuidelineId, 'bofas-vte');
  eq('no action', f.proposedAction, 'none');
  eq('identity key is the existing function\'s output', f.evidence.identityKey, documentIdentityKey('https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=abc%3d%3d'));
}

console.log('\n[2] stated year later than the catalogue, same URL → POSSIBLE_UPDATED_VERSION');
{
  const f = one([rec('BOFAS Position Statement on VTE', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf', { statedLabels: [label('(2027)')] })]);
  eq('class', f.class, 'POSSIBLE_UPDATED_VERSION');
  check('reason names both years', /2027/.test(f.reasons.join()) && /2025/.test(f.reasons.join()));
  eq('earlier year on the same URL is NOT an update', one([rec('x', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf', { statedLabels: [label('(2019)')] })]).class, 'ALREADY_REPRESENTED');
}

console.log('\n[3] reserved vs unreserved escapes, through the existing keys only');
{
  // On url-key v3 (this branch), %2D is not decoded: the two forms are NOT the same key.
  const esc = 'https://www.boa.ac.uk/asset/F8B1C499%2DC38A%2D4805%2D8CB8D8EB3087BCA7/';
  const plain = 'https://www.boa.ac.uk/asset/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/';
  const sameKey = documentIdentityKey(esc) === documentIdentityKey(plain);
  console.log(`  info  identity keys ${sameKey ? 'EQUAL' : 'differ'} for %2D vs - on this branch (url-key ${sameKey ? 'v4' : 'v3'} semantics)`);
  const f = one([rec('BOFAS / BOA Ankle Fracture BOAST Guidance', esc, { statedLabels: [label('(2016)')] })]);
  check('either way the BOA asset GUID identifies the document → represented, with the identifier recorded',
    f.class === 'ALREADY_REPRESENTED' && f.matchedGuidelineId === 'ankle-fracture' && (sameKey || f.evidence.identifier?.kind === 'boa-asset-guid'), JSON.stringify(f.evidence));
  eq('GUID normalisation is comparison-only and case/escape-insensitive', boaAssetGuidOf(esc), boaAssetGuidOf('https://www.boa.ac.uk/static/f8b1c499-c38a-4805-8cb8d8eb3087bca7/file.pdf'));
  const reservedDifferent = one([rec('Case sensitive document', 'https://www.bofas.org.uk/Docs%2FReport.pdf')]);
  check('%2F (reserved) is never treated as "/" : a different path, so not represented by URL', reservedDifferent.class !== 'ALREADY_REPRESENTED', reservedDifferent.class);
  eq('and the loose key agrees (existing function, not re-implemented here)', normaliseCandidateUrl('https://www.bofas.org.uk/Docs%2FReport.pdf') === normaliseCandidateUrl('https://www.bofas.org.uk/Docs/Report.pdf'), false);
}

console.log('\n[4] loose-only match → POSSIBLE_SAME_DOCUMENT');
{
  const f = one([rec('Case sensitive document', 'https://www.bofas.org.uk/docs/report.pdf')]);
  eq('class', f.class, 'POSSIBLE_SAME_DOCUMENT');
  eq('matched', f.matchedGuidelineId, 'case-doc');
  eq('action is to compare, never to merge', f.proposedAction, 'compare-documents');
}

console.log('\n[5] DOI across hosts → represented by identifier');
{
  eq('nature.com article id → 10.1038 DOI (stated publisher rule)', doiOf('https://www.nature.com/articles/s41416-024-02868-4'), '10.1038/s41416-024-02868-4');
  eq('doi.org form', doiOf('https://doi.org/10.1038/s41416-024-02868-4'), '10.1038/s41416-024-02868-4');
  eq('springer form carries the DOI in the path', doiOf('https://link.springer.com/article/10.1245/s10434-014-3965-2'), '10.1245/s10434-014-3965-2');
  eq('no DOI → null', doiOf('https://www.bofas.org.uk/a.pdf'), null);
  const f = one([rec('UK BSG Guidelines for the Management of Bone Sarcomas', 'https://www.nature.com/articles/s41416-024-02868-4')], { provider: 'BSG', providerName: 'BSG', catalogueProvider: 'BSG' });
  eq('class', f.class, 'ALREADY_REPRESENTED');
  eq('identifier recorded', f.evidence.identifier, { kind: 'doi', value: '10.1038/s41416-024-02868-4' });
}

console.log('\n[6] soft match → POSSIBLE_UPDATED_VERSION, with the year hint');
{
  const f = one([rec('BOFAS / BOA Speciality Standards on Management of End Stage Ankle Arthritis', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/SpecS-Ankle.pdf', { statedLabels: [label('(2025)')] })]);
  eq('class', f.class, 'POSSIBLE_UPDATED_VERSION');
  eq('matched', f.matchedGuidelineId, 'end-stage-ankle-arthritis');
  eq('same-year hint', f.evidence.editionHint, 'same-year');
  check('the classifier\'s own statement is carried verbatim', f.evidence.softMatch !== undefined && /A human must open both and decide/.test(f.reasons.join()));
  const older = one([rec('1st Round Table Meeting - 2011 - Padova', 'https://www.bofas.org.uk/Portals/0/RoundTable_Booklets/Round%20Table%20-%202011%20-%20Padova.pdf', { statedLabels: [{ origin: 'anchor-text', value: '1st Round Table Meeting - 2011 - Padova', readFrom: 'x' }] })]);
  eq('an earlier booklet of a series entry is hinted "earlier-year"', older.evidence.editionHint, 'earlier-year');
  eq('editionHint helper', [editionHint([2011], [2025]), editionHint([2025], [2025]), editionHint([2026], [2025]), editionHint([], [2025])], ['earlier-year', 'same-year', 'later-year', 'no-year']);
}

console.log('\n[7] near-tie soft matches → AMBIGUOUS_REVIEW (distinct documents are not collapsed)');
{
  const f = one([rec('Hallux valgus surgery guidance', 'https://www.bofas.org.uk/new-hallux.pdf')]);
  eq('class', f.class, 'AMBIGUOUS_REVIEW');
  check('both candidates named', f.matchedGuidelineId !== null && f.alsoMatches.length === 1 && new Set([f.matchedGuidelineId, ...f.alsoMatches]).size === 2, JSON.stringify([f.matchedGuidelineId, f.alsoMatches]));
  eq('action', f.proposedAction, 'editor-disambiguate');
}

console.log('\n[8] two catalogue entries holding one URL → AMBIGUOUS_REVIEW');
{
  const f = one([rec('The Management of Metastatic Bone Disease', 'https://www.boa.ac.uk/asset/B047D54A-170C-4C57-87C9C5DFAC4641E7/')]);
  eq('class', f.class, 'AMBIGUOUS_REVIEW');
  eq('both owners listed', [f.matchedGuidelineId, ...f.alsoMatches].sort(), ['mbd-a', 'mbd-b']);
}

console.log('\n[9] an index/fallback URL shared by many entries is a page, not a document');
{
  const f = one([rec('Guidelines', INDEX)]);
  eq('class', f.class, 'AMBIGUOUS_REVIEW');
  check('reason says so', /index\/fallback link/.test(f.reasons.join()));
}

console.log('\n[10] publisher-declared status wording');
{
  const held = one([rec('BOFAS Position Statement on VTE', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf', { sectionHeading: 'Archived Statements', statedLabels: [label('Archived Statements', 'section heading')] })]);
  eq('held document under an archived heading → PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED', held.class, 'PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED');
  eq('…matched entry named', held.matchedGuidelineId, 'bofas-vte');
  eq('…evidence is the heading, verbatim', held.evidence.publisherStatus, { readFrom: 'section-heading', value: 'Archived Statements' });
  eq('…action is to read, not to change', held.proposedAction, 'editor-read-publisher-status');
  const notHeld = one([rec('Something we never held', 'https://www.bofas.org.uk/unknown.pdf', { sectionHeading: 'Withdrawn guidance' })]);
  eq('unheld document under withdrawn heading → same class, no entry', [notHeld.class, notHeld.matchedGuidelineId], ['PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED', null]);
  const plain = one([rec('Something we never held', 'https://www.bofas.org.uk/unknown.pdf', { sectionHeading: 'Guidelines' })]);
  eq('no status wording → no declaration', plain.class, 'POTENTIALLY_NEW');
}

console.log('\n[11] publisher-declared move via an observed redirect');
{
  const f = one([rec('Guidance that moved', 'https://www.bofas.org.uk/old/moved.pdf')], { redirects: { 'https://www.bofas.org.uk/old/moved.pdf': 'https://www.bofas.org.uk/new/moved.pdf' } });
  eq('catalogued address redirecting elsewhere → PUBLISHER_DECLARED_MOVED', f.class, 'PUBLISHER_DECLARED_MOVED');
  eq('…against the entry that holds the old address', f.matchedGuidelineId, 'moved-doc');
  eq('…redirect recorded with the existing alternative shape', [f.evidence.redirect?.relation, f.evidence.redirect?.scope, f.evidence.redirect?.equivalence], ['redirect-target', 'document', 'unverified']);
  const g2 = one([rec('Guidance that moved', 'https://www.bofas.org.uk/new/moved.pdf')], { redirects: { 'https://www.bofas.org.uk/new/moved.pdf': 'https://www.bofas.org.uk/old/moved.pdf' } });
  eq('new address redirecting to a catalogued one → PUBLISHER_DECLARED_MOVED', g2.class, 'PUBLISHER_DECLARED_MOVED');
  const none = one([rec('Guidance that moved', 'https://www.bofas.org.uk/new/moved.pdf')]);
  check('without an observed redirect, a new address is NOT a declared move (soft match at best)', none.class !== 'PUBLISHER_DECLARED_MOVED', none.class);
}

console.log('\n[12] missing title → AMBIGUOUS_REVIEW; POTENTIALLY_NEW when nothing matches');
{
  eq('empty title', one([rec('   ', 'https://www.bofas.org.uk/untitled.pdf')]).class, 'AMBIGUOUS_REVIEW');
  const f = one([rec('Completely unrelated subject', 'https://www.bofas.org.uk/unrelated.pdf')]);
  eq('new', f.class, 'POTENTIALLY_NEW');
  eq('action', f.proposedAction, 'editor-assess-new');
}

console.log('\n[13] arithmetic, counts and cross-provider duplication');
{
  const items = [
    rec('BOFAS Position Statement on VTE', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf'),
    rec('Completely unrelated subject', 'https://www.bofas.org.uk/unrelated.pdf'),
  ];
  const r = run(items, { filtered: [{ url: 'https://www.bofas.org.uk/falcon.pdf', topic: 'FALCON', reason: 'audit report' }] });
  eq('every class has a count', Object.keys(r.byClass).sort(), [...ALL_GAP_CLASSES].sort());
  eq('findings = items', r.findings.length, 2);
  eq('balanced', r.balanced, true);
  const a = run([rec('BOFAS / BOA Ankle Fracture BOAST Guidance', 'https://www.boa.ac.uk/asset/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/')]);
  const b = run([rec('The Management of Ankle Fractures', 'https://www.boa.ac.uk/asset/F8B1C499%2DC38A%2D4805%2D8CB8D8EB3087BCA7/')], { provider: 'BOA', providerName: 'BOA', catalogueProvider: 'BOA' });
  markCrossProviderDuplicates([a, b]);
  eq('the same document seen on two providers is cross-marked on both', [a.findings[0].alsoDiscoveredVia, b.findings[0].alsoDiscoveredVia], [['BOA'], ['BOFAS']]);
}

console.log('\n[14] determinism and rendering');
{
  const items = [rec('BOFAS Position Statement on VTE', 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf', { statedLabels: [label('(2027)')] }), rec('Completely unrelated subject', 'https://www.bofas.org.uk/unrelated.pdf')];
  const x = JSON.stringify(run(items));
  const y = JSON.stringify(run(items));
  eq('two runs with the same inputs are byte-identical', x === y, true);
  const text = renderGapReport(run(items));
  check('report names the snapshot and says it is not production truth', /SNAPSHOT comparison, not production truth/.test(text));
  check('report lists review items with URL, rationale and proposed action', /Official source URL:/.test(text) && /Matching rationale:/.test(text) && /Proposed editorial action:/.test(text));
  check('report never proposes publishing or withdrawing', !/\bpublish\b|\bwithdraw\b/i.test(text.split('Review required')[1] ?? ''));
}

console.log('\n[15] no unintended staging or publishing: static import audit');
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ['../lib/coverage-gap.ts', '../lib/index-diff.ts', '../coverage-gap.ts', '../monitor-providers.ts', '../adapters/bsg.ts', '../adapters/bofas.ts']) {
    const src = fs.readFileSync(path.join(here, f), 'utf8');
    check(`${f} imports nothing that can write (supabase, stage-*, approve-*, fs.write on the catalogue)`, !/@supabase|stage-candidates|stage-discovery|approve-change|upsert-verified|guidelines-data\.ts', 'w/.test(src));
  }
  const cli = fs.readFileSync(path.join(here, '../coverage-gap.ts'), 'utf8');
  check('coverage-gap CLI imports no fetch/cache module (offline by construction)', !/discovery-cache|node-fetch|\bfetch\(/.test(cli));
}


console.log('\n[16] P1-2: DOI identity only from recognised, structurally valid DOI URL forms');
{
  // Legitimate forms still match.
  eq('doi.org', doiOf('https://doi.org/10.1186/s13569-016-0060-4'), '10.1186/s13569-016-0060-4');
  eq('dx.doi.org, http, mixed case host', doiOf('http://DX.DOI.ORG/10.1186/s13569-016-0060-4'), '10.1186/s13569-016-0060-4');
  eq('Springer article path', doiOf('https://link.springer.com/article/10.1186/s13569-016-0060-4'), '10.1186/s13569-016-0060-4');
  eq('BMC article path', doiOf('https://clinicalsarcomaresearch.biomedcentral.com/articles/10.1186/s13569-016-0060-4'), '10.1186/s13569-016-0060-4');
  eq('Nature article suffix → 10.1038/<suffix>', doiOf('https://www.nature.com/articles/s41586-020-2649-2'), '10.1038/s41586-020-2649-2');
  eq('doi.org with a trailing query/fragment: identity from the path only', doiOf('https://doi.org/10.1186/s13569-016-0060-4?utm=x#top'), '10.1186/s13569-016-0060-4');
  // Adversarial forms must NOT establish identity.
  eq('DOI in a query parameter on an unrelated host', doiOf('https://evil.example/page?doi=10.1186/s13569-016-0060-4'), null);
  eq('DOI in a query parameter on doi.org itself', doiOf('https://doi.org/?doi=10.1186/s13569-016-0060-4'), null);
  eq('DOI in the fragment', doiOf('https://www.bofas.org.uk/x.pdf#10.1186/s13569-016-0060-4'), null);
  eq('DOI-like path on an unrecognised host', doiOf('https://evil.example/10.1186/s13569-016-0060-4'), null);
  eq('host impersonating doi.org as a subdomain of another domain', doiOf('https://doi.org.evil.example/10.1186/s13569-016-0060-4'), null);
  eq('doi.org in the userinfo', doiOf('https://doi.org@evil.example/10.1186/s13569-016-0060-4'), null);
  eq('Springer non-article path', doiOf('https://link.springer.com/search?query=10.1186/s13569-016-0060-4'), null);
  eq('structurally invalid DOI (prefix too short)', doiOf('https://doi.org/10.1/abc'), null);
  eq('structurally invalid DOI (no suffix)', doiOf('https://doi.org/10.1186/'), null);
  eq('structurally invalid DOI (illegal characters)', doiOf('https://doi.org/10.1186/s13569<script>'), null);
  eq('not a URL', doiOf('10.1186/s13569-016-0060-4'), null);
}

console.log('\n[17] P1-2: BOA asset GUIDs only from validated BOA URLs/path structures');
{
  const GUID = 'F8B1C499-C38A-4805-8CB8D8EB3087BCA7';
  eq('boa.ac.uk /asset/<guid>/', boaAssetGuidOf(`https://www.boa.ac.uk/asset/${GUID}/`), GUID);
  eq('boa.ac.uk /static/<guid>/file.pdf', boaAssetGuidOf(`https://www.boa.ac.uk/static/${GUID}/file.pdf`), GUID);
  eq('percent-encoded hyphens and lower case normalise to the same GUID', boaAssetGuidOf(`https://boa.ac.uk/asset/${GUID.toLowerCase().replace(/-/g, '%2D')}/`), GUID);
  eq('unrelated host with the same path', boaAssetGuidOf(`https://evil.example/asset/${GUID}/`), null);
  eq('host impersonating BOA as a subdomain of another domain', boaAssetGuidOf(`https://www.boa.ac.uk.evil.example/asset/${GUID}/`), null);
  eq('boa.ac.uk in the userinfo', boaAssetGuidOf(`https://www.boa.ac.uk@evil.example/asset/${GUID}/`), null);
  eq('GUID in a query parameter', boaAssetGuidOf(`https://www.boa.ac.uk/search?asset=${GUID}`), null);
  eq('GUID under a non-asset path', boaAssetGuidOf(`https://www.boa.ac.uk/resources/${GUID}/`), null);
  eq('malformed GUID (wrong group length)', boaAssetGuidOf('https://www.boa.ac.uk/asset/F8B1C499-C38A-4805-8CB8D8EB3087BC/'), null);
  eq('malformed GUID (non-hex)', boaAssetGuidOf('https://www.boa.ac.uk/asset/G8B1C499-C38A-4805-8CB8D8EB3087BCA7/'), null);
  eq('other BOA subdomain is not the asset host', boaAssetGuidOf(`https://members.boa.ac.uk/asset/${GUID}/`), null);
}

console.log('\n[18] P1-2 end to end: an adversarial URL is reviewed, never ALREADY_REPRESENTED');
{
  const input = (url: string, topic: string): GapInput => ({
    provider: 'TEST', providerName: 'Test', catalogueProvider: 'BOA (BOASt) with BOFAS', surfaceUrl: INDEX,
    parse: { items: [{ topic, discoveredUrl: url, statedLabels: [] }], excluded: [] }, filtered: [], guidelines: CATALOGUE, discoveredAt: '2026-11-05', snapshotLabel: 'test',
  });
  const spoof = detectCoverageGaps(input('https://evil.example/asset/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/', 'A page that is not the ankle fracture standard'));
  check('BOA GUID on an unrelated host → not ALREADY_REPRESENTED', spoof.findings[0].class !== 'ALREADY_REPRESENTED');
  const qdoi = detectCoverageGaps(input('https://evil.example/landing?doi=10.1186/s13569-016-0060-4', 'Unrelated landing page'));
  check('DOI in a query parameter → not ALREADY_REPRESENTED', qdoi.findings[0].class !== 'ALREADY_REPRESENTED');
  const real = detectCoverageGaps(input('https://boa.ac.uk/static/F8B1C499-C38A-4805-8CB8D8EB3087BCA7/BOAST-ankle.pdf', 'Management of ankle fractures (BOAST)'));
  eq('legitimate BOA GUID at a different address still ALREADY_REPRESENTED', real.findings[0].class, 'ALREADY_REPRESENTED');
  check('… and the finding carries the runner-consistency note (classify() would say POSSIBLE_NEW_EDITION)', real.findings[0].reasons.some((r) => /POSSIBLE_NEW_EDITION/.test(r) && /changes nothing in the staging path/.test(r)));
  check('… which is visible in the rendered report', /POSSIBLE_NEW_EDITION/.test(renderGapReport(real)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
