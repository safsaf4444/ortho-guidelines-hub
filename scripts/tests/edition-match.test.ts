/**
 * scripts/tests/edition-match.test.ts
 * ────────────────────────────────────
 * Behavioural tests for the discovery classifier.
 *
 * NO NETWORK. Fixtures are recorded observations; the catalogue comes from the
 * static export in src/data/guidelines-data.ts.
 *
 * ─── WHAT THE BASELINES ARE AND ARE NOT ─────────────────────────────────────
 *
 * The BOFAS and NHS EBI fixtures below are what those surfaces carried WHEN
 * READ ON 2026-10-12. They are pinned here as a REGRESSION BASELINE for the
 * classifier — "given these inputs, produce these classifications" — and that
 * is the only claim they make.
 *
 * They are explicitly NOT a prediction about any future live run, and a live
 * sweep disagreeing with them is not a test failure:
 *
 *   - a publisher can add, retitle, move or withdraw a document at any time;
 *   - the catalogue can gain an entry that turns a NEW_GUIDELINE into a match;
 *   - EBI's 17-for-17 match rate holds only while the catalogue's 17 `ebi-*`
 *     entries and the specialty term stay in step. If the programme publishes
 *     an 18th musculoskeletal intervention tomorrow, the live run SHOULD report
 *     a candidate and this test should still pass unchanged.
 *
 * So these tests pin the CLASSIFIER against fixed inputs. Reconciling a live
 * run against them is a separate, human act — see the coverage report.
 *
 * Run:   npx tsx scripts/tests/edition-match.test.ts
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import {
  buildCatalogueIndex,
  classify,
  containment,
  discoveryTokens,
  jaccard,
  publisherSetOf,
  publishersStatedInTitle,
  softMatches,
} from '../lib/edition-match';
import {
  coPublisherAlternative,
  matchKeys,
  surfaceRedirectAlternative,
  volatileToken,
} from '../lib/url-alternatives';
import { PROVIDER_REGISTRY, validateRegistry } from '../lib/provider-registry';
import { normaliseCandidateUrl } from '../lib/ingestion';
import { toChangeReason } from '../lib/discovery-classification';
import { ALL_CHANGE_REASONS } from '../lib/ingestion';

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

const index = buildCatalogueIndex(GUIDELINES_DATA);
const AT = '2026-10-12T00:00:00.000Z';

function classifyBofas(topic: string, url: string, previousToken?: { parameter: string; value: string; observedAt: string }) {
  return classify({
    provider: 'BOFAS',
    providerName: 'British Orthopaedic Foot & Ankle Society (BOFAS)',
    surface: 'https://www.bofas.org.uk/clinician/research/bofas-publications',
    topic,
    discoveredUrl: url,
    discoveredAt: AT,
    index,
    previousToken: previousToken ?? null,
  });
}

// ─── The real BOFAS publications index, as read on 2026-10-12 ───────────────

const B = 'https://www.bofas.org.uk';
const BOFAS_FIXTURE: Array<{ topic: string; url: string; expect: string; expectId?: string }> = [
  {
    topic: 'BOFAS Position Statement on VTE',
    url: `${B}/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=5jgsIWvo0DJdwq-2pWJfEQ%3d%3d`,
    expect: 'MATCHED',
  },
  {
    topic: 'BOFAS Position Statement on the FAME Study',
    url: `${B}/Portals/0/Position%20Statements/FAME%20STUDY%20POSITION%20STATEMENT.pdf?ver=AdqcljKluax_khQUqZhiwg%3d%3d`,
    expect: 'MATCHED',
  },
  {
    topic: 'BOFAS Position Statement on Total Ankle Replacement',
    url: `${B}/Portals/0/Position%20Statements/BOFAS%20Statement%20on%20TAR%20.pdf?ver=8V10WJHt8JFkvV0bwSPaAw%3d%3d`,
    expect: 'MATCHED',
  },
  {
    topic: 'BOFAS / BOA / Multidisciplinary Diabetic Foot Guidelines',
    url: `${B}/Portals/0/Position%20Statements/DiabeticFoot%20FINAL.pdf?ver=_-wg0CNL_rfsnHabVCK2Bg%3d%3d`,
    expect: 'MATCHED',
  },
  {
    topic: 'BOFAS Pathways of Care in Foot and Ankle Surgery',
    url: `${B}/Portals/0/Position%20Statements/BOFAS%20Pathways%202.pdf?ver=SZTpbRZbo5uYZb2quw2UMw%3d%3d`,
    expect: 'MATCHED',
  },
  {
    topic: 'BOFAS / BOA Speciality Standards on Management of End Stage Ankle Arthritis',
    url: `${B}/Portals/0/Position%20Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQNo1o8FEhD87h8-uYmQA%3d%3d`,
    expect: 'POSSIBLE_NEW_EDITION',
    expectId: 'end-stage-ankle-arthritis',
  },
  {
    topic: 'BOFAS / BOA Ankle Fracture BOAST Guidance',
    url: `${B}/Portals/0/Position%20Statements/BOFAS-BOA%20ankle%20fractures.pdf?ver=DRs-xD9G0KoUanboCOYO6Q%3d%3d`,
    expect: 'POSSIBLE_NEW_EDITION',
    expectId: 'ankle-fracture',
  },
  {
    topic: 'BOFAS Commissioning Guidelines on Flatfoot Deformities',
    url: `${B}/Portals/0/Position%20Statements/BOFAS%20Flatfoot%20Commissioning%20guidelines%20%20.pdf?ver=7dkk2GgKFmerP4n7n48uSw%3d%3d`,
    expect: 'POSSIBLE_NEW_EDITION',
    expectId: 'bofas-flatfoot-commissioning',
  },
  {
    topic: 'BOFAS / BOA Guidelines on Mobilisation and Weightbearing after Surgery',
    url: `${B}/Portals/0/Position%20Statements/BOAST%20Mobilisation%20Guidelines.pdf?ver=OG6fJbhDhxZfH68eHqcJ9Q%3d%3d`,
    expect: 'POSSIBLE_NEW_EDITION',
    expectId: 'mobilisation-weightbearing',
  },
  {
    topic: 'UK Foot and Ankle COVID-19 National Audit (UK-FALCON) - Final Report',
    url: `${B}/Portals/0/Research/FALCON-Report-Phase%201%20and%202%20final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d`,
    expect: 'NEW_GUIDELINE',
  },
];

console.log('\n[1] BOFAS index — every item classified as the recorded baseline');
for (const f of BOFAS_FIXTURE) {
  const r = classifyBofas(f.topic, f.url);
  const actual = r === null ? 'MATCHED' : r.classification;
  eq(`${f.topic.slice(0, 54)} → ${f.expect}`, actual, f.expect);
  if (f.expectId && r) {
    eq(`  …concerns ${f.expectId}`, r.matchedGuidelineId, f.expectId);
  }
}

console.log('\n[2] BOFAS totals — the second-host problem is actually caught');
{
  const results = BOFAS_FIXTURE.map((f) => classifyBofas(f.topic, f.url));
  const matched = results.filter((r) => r === null).length;
  const edition = results.filter((r) => r?.classification === 'POSSIBLE_NEW_EDITION').length;
  const brandNew = results.filter((r) => r?.classification === 'NEW_GUIDELINE').length;
  eq('5 matched by URL', matched, 5);
  eq('4 flagged as possible editions / second hosts', edition, 4);
  eq('1 genuinely absent from the catalogue', brandNew, 1);
  check(
    'a URL-only sweep would have called 5 of these new; we call 1',
    brandNew === 1 && edition === 4,
    `matched=${matched} edition=${edition} new=${brandNew}`,
  );
}

console.log('\n[3] Soft-match evidence states its own limits');
{
  const r = classifyBofas(BOFAS_FIXTURE[6].topic, BOFAS_FIXTURE[6].url);
  check('a soft match is present', Boolean(r?.softMatch));
  if (r?.softMatch) {
    check('verificationRequired is set', r.verificationRequired === true);
    check(
      'statement offers the new-edition reading',
      /NEW EDITION/i.test(r.softMatch.statement),
      r.softMatch.statement,
    );
    check(
      'statement offers the second-address reading',
      /second address/i.test(r.softMatch.statement),
      r.softMatch.statement,
    );
    check(
      'statement offers the different-document reading',
      /DIFFERENT DOCUMENT/i.test(r.softMatch.statement),
      r.softMatch.statement,
    );
    check(
      'statement says no content was compared',
      /no document content was compared/i.test(r.softMatch.statement),
      r.softMatch.statement,
    );
    check(
      'statement does not assert a publication date was established',
      /no publication date was established/i.test(r.softMatch.statement),
      r.softMatch.statement,
    );
    check('the numbers that produced it are carried', typeof r.softMatch.titleSimilarity === 'number');
    check('shared tokens are carried', r.softMatch.sharedTitleTokens.length > 0);
    check('shared publishers are carried', r.softMatch.sharedPublishers.length > 0);
  }
}

console.log('\n[4] Co-publisher alternatives recorded without touching the discovered URL');
{
  const f = BOFAS_FIXTURE[5];
  const r = classifyBofas(f.topic, f.url);
  check('candidate produced', r !== null);
  if (r) {
    eq('discovered URL preserved byte-for-byte', r.discoveredUrl, f.url);
    const alts = r.urlAlternatives.filter((a) => a.relation === 'co-publisher-host');
    check('at least one co-publisher alternative recorded', alts.length > 0);
    check(
      'the catalogue BOA asset URL is among them',
      alts.some((a) => a.url.includes('boa.ac.uk')),
      JSON.stringify(alts.map((a) => a.url)),
    );
    check(
      'the shared fallback index page is NOT offered as this document',
      !alts.some((a) => a.url.includes('standards-guidance/boasts')),
      JSON.stringify(alts.map((a) => a.url)),
    );
    check('equivalence is never asserted', alts.every((a) => a.equivalence === 'not-probed'));
    check(
      'no alternative cites byte length as evidence',
      alts.every((a) => !/byte length|content-length/i.test(a.statement)),
    );
    check(
      'every alternative states that no content was compared',
      alts.every((a) => /no content was compared/i.test(a.statement)),
    );
  }
}

console.log('\n[5] ?ver= token — a change is an observed token change and nothing more');
{
  const f = BOFAS_FIXTURE[0]; // VTE statement: matches the catalogue by URL
  const token = volatileToken(f.url);
  check('a volatile token is detected', token?.parameter === 'ver');

  const first = classifyBofas(f.topic, f.url, undefined);
  eq('first sighting produces no candidate (nothing to compare against)', first, null);

  const same = classifyBofas(f.topic, f.url, {
    parameter: 'ver',
    value: token!.value,
    observedAt: '2026-10-05T00:00:00.000Z',
  });
  eq('an unchanged token produces no candidate', same, null);

  const changed = classifyBofas(f.topic, f.url, {
    parameter: 'ver',
    value: 'AN-EARLIER-TOKEN-VALUE',
    observedAt: '2026-10-05T00:00:00.000Z',
  });
  check('a changed token produces a candidate', changed !== null);
  if (changed) {
    eq('classified as EDITION_TOKEN_CHANGED', changed.classification, 'EDITION_TOKEN_CHANGED');
    eq('it still points at the matched catalogue entry', changed.matchedGuidelineId, 'bofas-vte-position-statement');
    check('both token values are recorded', changed.tokenChange?.previousValue === 'AN-EARLIER-TOKEN-VALUE');
    const s = changed.tokenChange!.statement;
    check('statement denies it proves a re-upload', /NOT evidence that the provider re-uploaded/i.test(s), s);
    check('statement denies it proves a content change', /NOT evidence that the document\s*\n?\s*changed|NOT evidence that the document changed/i.test(s.replace(/\s+/g, ' ')), s);
    check('statement denies it proves a new edition', /NOT evidence of a new edition/i.test(s.replace(/\s+/g, ' ')), s);
    check('statement lists innocent causes', /cache rebuild/i.test(s), s);
    check('statement says no content was fetched or compared', /No content was fetched or compared/i.test(s), s);
    check(
      'the word "re-upload" never appears as an assertion',
      !/\bwas re-uploaded\b/i.test(s),
      s,
    );
  }

  // Matching must be unaffected by the token itself.
  const keys = matchKeys(f.url, []);
  check('the match key has the ver token stripped', keys.every((k) => !k.includes('ver=')), JSON.stringify(keys));
}

console.log('\n[6] The PROVIDER_OVERRIDES trap');
{
  const ebiProgramme = GUIDELINES_DATA.find((g) => g.id === 'nhs-ebi-programme');
  check('the nhs-ebi-programme entry still exists', Boolean(ebiProgramme));
  if (ebiProgramme) {
    const set = publisherSetOf(ebiProgramme.source);
    check(
      'its publisher set includes NHS EBI Programme via the whole-string override',
      set.includes('NHS EBI Programme'),
      JSON.stringify(set),
    );
    check(
      'and also its split co-publishers',
      set.includes('AoMRC') && set.includes('NICE') && set.includes('GIRFT'),
      JSON.stringify(set),
    );
  }
}

console.log('\n[7] Publishers named in a discovered title are found by lookup, not guesswork');
{
  const found = publishersStatedInTitle(
    'BOFAS / BOA Guidelines on Mobilisation and Weightbearing after Surgery',
    index.knownPublisherLabels,
  );
  check('BOFAS found', found.includes('BOFAS'), JSON.stringify(found));
  check('BOA found', found.includes('BOA'), JSON.stringify(found));
  check('"BOAST" is not treated as a publisher', !found.includes('BOAST'), JSON.stringify(found));
  check(
    'ordinary clinical words are not treated as publishers',
    publishersStatedInTitle('Management of ankle fractures in adults', index.knownPublisherLabels).length === 0,
  );
}

console.log('\n[8] Tokeniser behaviour that the real data forced');
{
  const t = discoveryTokens('BOFAS Position Statement on Total Ankle Replacement', ['BOFAS']);
  check('publisher acronym removed even after singularisation (bofas→bofa)', !t.has('bofa') && !t.has('bofas'), JSON.stringify([...t]));
  check('document-type words removed', !t.has('position') && !t.has('statement'), JSON.stringify([...t]));
  check('subject words kept', t.has('ankle') && t.has('replacement'), JSON.stringify([...t]));

  const hy = discoveryTokens('Mobilisation & weight-bearing after orthopaedic surgery / injury', []);
  check('hyphenated compound contributes its parts', hy.has('weight') && hy.has('bearing'), JSON.stringify([...hy]));
  check('hyphenated compound also contributes its joined form', hy.has('weightbearing'), JSON.stringify([...hy]));

  check('"arthritis" is not mangled by singularisation', discoveryTokens('ankle arthritis').has('arthritis'));
  check('"osteoporosis" is not mangled', discoveryTokens('osteoporosis risk').has('osteoporosis'));
  check('"fractures" singularises to "fracture"', discoveryTokens('ankle fractures').has('fracture'));
  check('a bare year is dropped', !discoveryTokens('subacromial shoulder pain 2025').has('2025'));
  check('subject words survive the year drop', discoveryTokens('subacromial shoulder pain 2025').has('subacromial'));
}

console.log('\n[9] The matcher does not over-fire');
{
  // Sibling BESS pathways: same publisher, genuinely different documents.
  const siblings = softMatches('Frozen Shoulder', ['BESS', 'BOA'], index);
  check(
    'a BESS sibling title does not soft-match subacromial pain',
    !siblings.some((m) => m.guidelineId === 'bess-subacromial-shoulder-pain'),
    JSON.stringify(siblings.map((m) => m.guidelineId)),
  );
  check(
    'it does match its own entry',
    siblings.some((m) => m.guidelineId === 'bess-frozen-shoulder'),
    JSON.stringify(siblings.map((m) => m.guidelineId)),
  );

  // Publisher overlap is required: the same title from an unrelated society
  // must not match.
  const noOverlap = softMatches('Management of ankle fractures', ['BSCOS'], index);
  check(
    'no publisher overlap means no soft match, however similar the title',
    !noOverlap.some((m) => m.guidelineId === 'ankle-fracture'),
    JSON.stringify(noOverlap.map((m) => m.guidelineId)),
  );

  // An empty or stopword-only title cannot match anything.
  eq('a stopword-only title yields no matches', softMatches('Guidelines and standards', ['BOA'], index).length, 0);
  eq('an empty title yields no matches', softMatches('', ['BOA'], index).length, 0);
}

console.log('\n[10] NHS EBI baseline — recorded 2026-10-12, pinned as a regression fixture');
{
  // The 17 interventions the musculoskeletal-spine term carried on that date,
  // with the titles and URLs as published.
  const E = 'https://ebi.aomrc.org.uk/interventions';
  const EBI_FIXTURE: Array<[string, string]> = [
    ['MRI scan of the hip for arthritis', `${E}/mri-scan-of-the-hip-for-arthritis/`],
    ['Carpal tunnel syndrome release', `${E}/carpal-tunnel-syndrome-release/`],
    ['Dupuytren’s contracture release in adults', `${E}/dupuytrens-contracture-release-in-adults/`],
    ['Fusion surgery for mechanical axial low back pain', `${E}/fusion-surgery-for-mechanical-axial-low-back-pain-2/`],
    ['Lumbar radiofrequency facet joint denervation', `${E}/lumbar-radiofrequency-facet-joint-denervation/`],
    ['Ganglion excision', `${E}/ganglion-excision/`],
    ['Injections for isolated lower back pain without sciatica', `${E}/injections-for-nonspecific-low-back-pain-without-sciatica-2/`],
    ['Low back pain imaging', `${E}/low-back-pain-imaging-2/`],
    ['Knee arthroscopy for patients with osteoarthritis', `${E}/knee-arthroscopy-for-patients-with-osteoarthritis/`],
    ['Lumbar discectomy', `${E}/lumbar-discectomy/`],
    ['Arthroscopic surgery for meniscal tears', `${E}/arthroscopic-surgery-for-meniscal-tears/`],
    ['Arthroscopic shoulder decompression for subacromial pain', `${E}/arthroscopic-shoulder-decompression-for-subacromial-pain/`],
    ['Knee MRI for suspected meniscal tears', `${E}/knee-mri-for-suspected-meniscal-tears/`],
    ['Knee MRI when symptoms are suggestive of osteoarthritis', `${E}/knee-mri-when-symptoms-are-suggestive-of-osteoarthritis/`],
    ['Scans for shoulder pain and guided injections for shoulder pain', `${E}/scans-for-shoulder-pain-and-guided-injections-for-shoulder-pain/`],
    ['Trigger finger release in adults', `${E}/trigger-finger-release-in-adults/`],
    ['Vertebral augmentation for painful osteoporotic vertebral fractures', `${E}/vertebral-augmentation-for-painful-osteoporotic-vertebral-fractures/`],
  ];

  eq('the fixture records 17 interventions', EBI_FIXTURE.length, 17);

  const results = EBI_FIXTURE.map(([topic, url]) =>
    classify({
      provider: 'NHS EBI',
      providerName: 'NHS Evidence-Based Interventions programme',
      surface: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/',
      topic,
      discoveredUrl: url,
      discoveredAt: AT,
      index,
    }),
  );
  const matched = results.filter((r) => r === null).length;
  eq('all 17 fixture URLs match the catalogue', matched, 17);
  eq('so the fixture produces no candidates', results.filter((r) => r !== null).length, 0);

  // The point of the baseline: an 18th item SHOULD be reported.
  const invented = classify({
    provider: 'NHS EBI',
    providerName: 'NHS Evidence-Based Interventions programme',
    surface: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/',
    topic: 'Shoulder replacement for glenohumeral arthropathy',
    discoveredUrl: `${E}/shoulder-replacement-for-glenohumeral-arthropathy/`,
    discoveredAt: AT,
    index,
  });
  check(
    'a hypothetical 18th intervention is reported rather than absorbed',
    invented !== null,
    'the classifier must not silently match an unknown URL',
  );
}

console.log('\n[10b] REGRESSION: an EBI possible edition whose title does not name EBI');
{
  // The bug this pins: the registry key 'NHS EBI' does NOT canonicalise to
  // 'NHS EBI Programme' (PROVIDER_ALIASES maps the long form and
  // 'nhs ebi programme', not the bare 'nhs ebi'), while every EBI catalogue
  // entry does. Comparing publishers on the registry key gave
  // ['NHS EBI'] vs ['NHS EBI Programme', 'AoMRC'] — empty intersection — so EBI
  // soft matching could never fire. It produced no visible symptom because
  // every live EBI item matched by URL.
  //
  // The title here deliberately does NOT contain "EBI" or any publisher name,
  // so publishersStatedInTitle contributes nothing and the match depends
  // ENTIRELY on the provider identity being canonicalised correctly.
  const entry = PROVIDER_REGISTRY.find((p) => p.key === 'NHS EBI')!;
  check('the registry entry exists', Boolean(entry));
  check(
    'and the two labels really do differ (otherwise this test proves nothing)',
    entry.key !== entry.catalogueProvider,
    `key=${entry.key} catalogueProvider=${entry.catalogueProvider}`,
  );
  eq(
    'the bare registry key still does not canonicalise to the catalogue label',
    publisherSetOf(entry.key).includes('NHS EBI Programme'),
    false,
  );
  check(
    'but the catalogueProvider does',
    publisherSetOf(entry.catalogueProvider).includes('NHS EBI Programme'),
    JSON.stringify(publisherSetOf(entry.catalogueProvider)),
  );

  const titleWithNoPublisherName = 'Lumbar discectomy';
  eq(
    'the title names no publisher at all',
    publishersStatedInTitle(titleWithNoPublisherName, index.knownPublisherLabels).length,
    0,
  );

  const r = classify({
    provider: entry.key,
    catalogueProvider: entry.catalogueProvider,
    providerName: entry.name,
    surface: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/',
    topic: titleWithNoPublisherName,
    discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/lumbar-discectomy-2024-revision/',
    discoveredAt: AT,
    index,
  });
  check('a candidate is produced', r !== null);
  eq('classified as POSSIBLE_NEW_EDITION', r?.classification, 'POSSIBLE_NEW_EDITION');
  eq('pointing at the existing EBI entry', r?.matchedGuidelineId, 'ebi-lumbar-discectomy');
  check(
    'the shared publisher is the canonical catalogue label',
    r?.softMatch?.sharedPublishers.includes('NHS EBI Programme') ?? false,
    JSON.stringify(r?.softMatch?.sharedPublishers),
  );
  eq(
    'and none of the publisher evidence came from the title',
    r?.softMatch?.publishersFromTitle.length,
    0,
  );

  // The pre-fix behaviour, pinned so a regression is unmistakable: comparing on
  // the registry key alone yields NEW_GUIDELINE.
  const onKeyAlone = classify({
    provider: entry.key,
    providerName: entry.name,
    surface: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/',
    topic: titleWithNoPublisherName,
    discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/lumbar-discectomy-2024-revision/',
    discoveredAt: AT,
    index,
  });
  eq(
    'comparing on the registry key alone is what used to break it',
    onKeyAlone?.classification,
    'NEW_GUIDELINE',
  );
}

console.log('\n[10c] Every active registry entry names a publisher the catalogue actually uses');
{
  // Guards the whole class of bug above: a catalogueProvider that matches
  // nothing in the catalogue silently disables soft matching for that provider.
  for (const p of PROVIDER_REGISTRY) {
    check(
      `${p.key}: catalogueProvider is set`,
      typeof p.catalogueProvider === 'string' && p.catalogueProvider.length > 0,
    );
    const known = index.knownPublisherLabels.includes(p.catalogueProvider);
    if (p.participation === 'active' || p.participation === 'awaiting-approval') {
      check(
        `${p.key}: catalogueProvider "${p.catalogueProvider}" is a label the catalogue uses`,
        known,
        `known labels: ${JSON.stringify(index.knownPublisherLabels)}`,
      );
      check(
        `${p.key}: it canonicalises to itself (so it really is canonical)`,
        publisherSetOf(p.catalogueProvider).includes(p.catalogueProvider),
        JSON.stringify(publisherSetOf(p.catalogueProvider)),
      );
    }
  }
  eq('validateRegistry still reports no problems', validateRegistry().length, 0);
}

console.log('\n[10d] REGRESSION: a surface redirect cannot make a document count as matched');
{
  // The vector: an index page is fetched, the server redirects, and the redirect
  // target is recorded. If that joined the match keys it would do so for EVERY
  // item on the page — and the ROS publications surface IS a catalogue document
  // key (it is a version URL on exactly two entries, inside
  // GENERIC_URL_MAX_OWNERS), so all nine ROS documents would have matched
  // ros-clinical-quality-toolkits and been reported as already held.
  const rosSurface =
    'https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/';

  check(
    'the premise holds: that surface URL really is a catalogue document key',
    index.byUrlKey.has(normaliseCandidateUrl(rosSurface)),
    'if this fails the test no longer exercises the vector',
  );
  eq(
    'and it keys the entry we expect',
    index.byUrlKey.get(normaliseCandidateUrl(rosSurface))?.guideline.id,
    'ros-clinical-quality-toolkits',
  );

  const redirect = surfaceRedirectAlternative('https://theros.org.uk/some-index', rosSurface, {
    status: 200,
    contentType: 'text/html',
    reportedContentLength: null,
    checkedAt: AT,
  });
  eq('the redirect is surface-scoped', redirect.scope, 'surface');

  const unrelatedDoc = 'https://theros.org.uk/media/zzzzzzzz/some-unrelated-document.pdf';
  const keys = matchKeys(unrelatedDoc, [redirect]);
  eq('matchKeys yields only the document itself', keys.length, 1);
  check(
    'the surface URL is not a match key',
    !keys.includes(normaliseCandidateUrl(rosSurface)),
    JSON.stringify(keys),
  );

  // End to end through the classifier: the document must NOT come back matched.
  const r = classify({
    provider: 'ROS',
    catalogueProvider: 'ROS',
    providerName: 'Royal Osteoporosis Society (ROS)',
    surface: rosSurface,
    topic: 'An unrelated document that shares no title tokens with any entry',
    discoveredUrl: unrelatedDoc,
    urlAlternatives: [redirect],
    discoveredAt: AT,
    index,
  });
  check(
    'the unrelated document is NOT silently counted as matched',
    r !== null,
    'classify returned null, meaning it matched the catalogue via the surface redirect',
  );
  eq('it is reported as new, not absorbed', r?.classification, 'NEW_GUIDELINE');
  check(
    'and it is not attributed to the surface-redirect entry',
    r?.matchedGuidelineId !== 'ros-clinical-quality-toolkits',
    `matchedGuidelineId=${r?.matchedGuidelineId}`,
  );

  // A document-scoped alternative, by contrast, MUST still participate.
  const docAlt = coPublisherAlternative(
    'https://example.test/discovered.pdf',
    'https://theros.org.uk/media/0dillsrh/ros-op-standards-november-2017.pdf',
    'ros-osteoporosis-quality-standards',
    ['ROS'],
  );
  eq('a co-publisher alternative is document-scoped', docAlt.scope, 'document');
  const docKeys = matchKeys('https://example.test/discovered.pdf', [docAlt]);
  eq('so it DOES contribute a match key', docKeys.length, 2);
  const viaAlt = classify({
    provider: 'ROS',
    catalogueProvider: 'ROS',
    providerName: 'Royal Osteoporosis Society (ROS)',
    surface: rosSurface,
    topic: 'Quality standards for osteoporosis',
    discoveredUrl: 'https://example.test/discovered.pdf',
    urlAlternatives: [docAlt],
    discoveredAt: AT,
    index,
  });
  eq('and a document-scoped alternative can still produce a match', viaAlt, null);
}

console.log('\n[11] DiscoveryClass cannot leak into the database-facing union');
{
  eq('NEW_GUIDELINE is the one class that maps', toChangeReason('NEW_GUIDELINE'), 'NEW_GUIDELINE');
  for (const cls of ['POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED'] as const) {
    let threw = false;
    let message = '';
    try {
      toChangeReason(cls);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    }
    check(`${cls} is refused, not coerced`, threw, 'expected a throw');
    check(
      `${cls} refusal explains the live approve path`,
      /42809|duplicate row/i.test(message),
      message,
    );
  }
  // The exact agreed members, in order — not a count. The seventh,
  // POSSIBLE_SAME_DOCUMENT, was added deliberately for sync-providers' loose-only
  // URL matches (see supabase/DISCOVERY-QUEUE-CONTRACT.md); it is not a discovery
  // class. Any other change to the shared union must fail here.
  // `eq` in this file is Object.is (reference equality), so compare
  // element by element: same length, same members, same order.
  const AGREED_CHANGE_REASONS = [
    'NEW_GUIDELINE',
    'REVISED',
    'WITHDRAWN',
    'CONTENT_DRIFT',
    'URL_MOVED',
    'UNREACHABLE_LINK',
    'POSSIBLE_SAME_DOCUMENT',
  ];
  check(
    'the shared ChangeReason union is exactly the seven agreed members, in order',
    ALL_CHANGE_REASONS.length === AGREED_CHANGE_REASONS.length
      && AGREED_CHANGE_REASONS.every((r, i) => ALL_CHANGE_REASONS[i] === r),
    `expected ${JSON.stringify(AGREED_CHANGE_REASONS)}, got ${JSON.stringify(ALL_CHANGE_REASONS)}`,
  );
  check(
    'and contains no discovery-only member',
    !(ALL_CHANGE_REASONS as readonly string[]).includes('POSSIBLE_NEW_EDITION') &&
      !(ALL_CHANGE_REASONS as readonly string[]).includes('EDITION_TOKEN_CHANGED'),
    JSON.stringify(ALL_CHANGE_REASONS),
  );
}

console.log('\n[12] Index sanity against the live catalogue export');
{
  check('catalogue is non-empty', GUIDELINES_DATA.length > 0);
  check('document URL keys were indexed', index.byUrlKey.size > 0);
  check('publisher labels were collected', index.knownPublisherLabels.length > 10);
  check(
    'shared fallback index pages were excluded from document keys',
    !index.byUrlKey.has('https://www.boa.ac.uk/standards-guidance/boasts.html'),
    'a page used by many entries must not key a single document',
  );
  check(
    'ROS entries are visible to the matcher via the authoritative splitter',
    index.entries.filter((e) => e.publishers.includes('ROS')).length === 4,
    `got ${index.entries.filter((e) => e.publishers.includes('ROS')).length}`,
  );
  check(
    'jaccard and containment agree on identical sets',
    jaccard(new Set(['a', 'b']), new Set(['a', 'b'])) === 1 &&
      containment(new Set(['a', 'b']), new Set(['a', 'b'])) === 1,
  );
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
