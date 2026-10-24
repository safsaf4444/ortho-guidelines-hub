/**
 * scripts/tests/discovery-adapters.test.ts
 * ─────────────────────────────────────────
 * Offline parse tests for the batch-1 discovery adapters.
 *
 * NO NETWORK. Every fixture is inline HTML, same convention as
 * boa-adapter.test.ts and the other four adapter tests. Nothing here issues a
 * request, and the ROS parser in particular is tested ONLY this way: its
 * provider's access approval is unresolved, so the live page must not be
 * fetched.
 *
 * The fixtures are cut down from real page structure, keeping the traps that
 * actually cost something:
 *
 *   EBI   social-share anchors carrying FULL intervention URLs, plus nav and
 *         breadcrumb links to the A–Z index. A naive href filter collects all
 *         of them.
 *   BESS  each document appears twice (file link + styled Download button), and
 *         the anchor text is the FILENAME while the real title is in the
 *         accordion <summary>.
 *   ROS   hrefs on the Umbraco ORIGIN host rather than the canonical site.
 *
 * Run:   npx tsx scripts/tests/discovery-adapters.test.ts
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { parseEbiSpecialtyIndex, parseEbiInterventionDates, EBI_MSK_SURFACE } from '../adapters/ebi';
import { parseBessPathwaysIndex, BESS_PATHWAYS_SURFACE } from '../adapters/bess';
import {
  parseRosPublicationsIndex,
  ROS_PUBLICATIONS_SURFACE,
  ROS_CANONICAL_HOST,
} from '../adapters/ros';
import { canonicalHostAlternative } from '../lib/url-alternatives';
import { parseBofasStatedLabels } from '../adapters/bofas';
import { parseBofasPublicationsIndex } from '../sync-providers';

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

// ─── NHS EBI ────────────────────────────────────────────────────────────────

const EBI_FIXTURE = `
<header>
  <ul class="navbar-nav">
    <li id="menu-item-350" class="menu-item nav-item"><a href="https://ebi.aomrc.org.uk/interventions/">Interventions</a></li>
  </ul>
</header>
<nav aria-label="breadcrumb">
  <ol class="breadcrumb">
    <li class="breadcrumb-item"><a href="https://ebi.aomrc.org.uk/interventions/"><span>Interventions</span></a></li>
    <li class="breadcrumb-item active">Musculoskeletal / Spine</li>
  </ol>
</nav>
<h1 class="page-title">Musculoskeletal / Spine</h1>
<section class="content-block">
  <h3 class="block-title">Musculoskeletal / Spine</h3>
  <div class="block-content">
    <div class="intervention-link">
      <a href="https://ebi.aomrc.org.uk/interventions/mri-scan-of-the-hip-for-arthritis/">MRI scan of the hip for arthritis</a>
    </div>
    <div class="intervention-link">
      <a href="/interventions/carpal-tunnel-syndrome-release/">Carpal tunnel  syndrome release</a>
    </div>
    <div class="intervention-link">
      <a href="https://ebi.aomrc.org.uk/interventions/mri-scan-of-the-hip-for-arthritis/">MRI scan of the hip for arthritis</a>
    </div>
    <div class="intervention-link">
      <a href="https://ebi.aomrc.org.uk/interventions/ganglion-excision/"></a>
    </div>
  </div>
</section>
<div class="heateor_sss_sharing_container">
  <a aria-label="Email" class="heateor_sss_email"
     href="https://ebi.aomrc.org.uk/interventions/vertebral-augmentation-for-painful-osteoporotic-vertebral-fractures/"
     title="Email">share</a>
  <a aria-label="Facebook" class="heateor_sss_facebook"
     href="https://ebi.aomrc.org.uk/interventions/lumbar-discectomy/">share</a>
</div>
`;

console.log('\n[1] EBI specialty index — content links only, rejections counted');
{
  const r = parseEbiSpecialtyIndex(EBI_FIXTURE, EBI_MSK_SURFACE);
  eq('two genuine items collected', r.items.length, 2);
  eq('title taken verbatim from anchor text', r.items[0].topic, 'MRI scan of the hip for arthritis');
  eq(
    'absolute href preserved exactly',
    r.items[0].discoveredUrl,
    'https://ebi.aomrc.org.uk/interventions/mri-scan-of-the-hip-for-arthritis/',
  );
  eq(
    'relative href resolved against the surface URL',
    r.items[1].discoveredUrl,
    'https://ebi.aomrc.org.uk/interventions/carpal-tunnel-syndrome-release/',
  );
  eq('internal whitespace collapsed in the title', r.items[1].topic, 'Carpal tunnel syndrome release');
  eq('specialty heading captured', r.items[0].sectionHeading, 'Musculoskeletal / Spine');

  const reasons = r.excluded.map((e) => e.reason);
  check(
    'social-share anchors rejected, not collected',
    r.excluded.filter((e) => e.reason.includes('social-share')).length === 2,
    `excluded reasons: ${JSON.stringify(reasons)}`,
  );
  check(
    'nav / breadcrumb links to the A–Z index rejected and recorded',
    r.excluded.filter((e) => e.reason.includes('A–Z index')).length === 2,
    JSON.stringify(reasons),
  );
  check(
    'duplicate content link rejected and counted',
    r.excluded.some((e) => e.reason.includes('duplicate')),
    JSON.stringify(reasons),
  );
  check(
    'empty-text anchor rejected and counted',
    r.excluded.some((e) => e.reason.includes('no text')),
    JSON.stringify(reasons),
  );
  check(
    'every rejection is recorded (filtering is visible, never silent)',
    r.excluded.length === 6,
    `expected 6 rejections, got ${r.excluded.length}: ${JSON.stringify(reasons)}`,
  );
  check(
    'no share-widget URL leaked into items',
    !r.items.some((i) => i.discoveredUrl.includes('vertebral-augmentation')),
  );
}

console.log('\n[2] EBI intervention page — publisher-stated dates, verbatim and unparsed');
{
  const page = `<body><div class="meta"><p>Published January 2020</p><p>Last reviewed September 2024</p></div></body>`;
  const labels = parseEbiInterventionDates(page, 'https://ebi.aomrc.org.uk/interventions/x/');
  eq('both labels captured', labels.length, 2);
  eq('published value verbatim', labels[0].value, 'January 2020');
  eq('published field label verbatim', labels[0].fieldLabel, 'Published');
  eq('reviewed value verbatim', labels[1].value, 'September 2024');
  eq('reviewed field label verbatim', labels[1].fieldLabel, 'Last reviewed');
  check(
    'values stay strings — nothing is parsed into a Date',
    labels.every((l) => typeof l.value === 'string'),
  );
  check('origin recorded as page-body', labels.every((l) => l.origin === 'page-body'));
}

// ─── BESS ───────────────────────────────────────────────────────────────────

const BESS_FIXTURE = `
<h3>Patient Care Pathways</h3>
<div class="wp-block-coblocks-accordion">
  <div class="wp-block-coblocks-accordion-item">
    <details>
      <summary class="wp-block-coblocks-accordion-item__title"><strong>Atraumatic Shoulder Instability</strong></summary>
      <div class="wp-block-coblocks-accordion-item__content">
        <div data-wp-interactive="core/file" class="wp-block-file">
          <object class="wp-block-file__embed" data="https://bess.ac.uk/wp-content/uploads/2020/06/Atraumatic-Shoulder-Instability.pdf" type="application/pdf"></object>
          <a href="https://bess.ac.uk/wp-content/uploads/2020/06/Atraumatic-Shoulder-Instability.pdf">Atraumatic-Shoulder-Instability</a>
          <a href="https://bess.ac.uk/wp-content/uploads/2020/06/Atraumatic-Shoulder-Instability.pdf" class="wp-block-file__button wp-element-button">Download</a>
        </div>
      </div>
    </details>
  </div>
  <div class="wp-block-coblocks-accordion-item">
    <details>
      <summary><strong>Subacromial Shoulder Pain</strong></summary>
      <div class="wp-block-file">
        <a href="/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf">Subacromial Shoulder Pain &#8211; 2025</a>
        <a href="/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf" class="wp-block-file__button">Download</a>
      </div>
    </details>
  </div>
  <div class="wp-block-coblocks-accordion-item">
    <details>
      <summary><strong>A pathway with no document attached</strong></summary>
      <div class="wp-block-file"><p>Coming soon</p></div>
    </details>
  </div>
</div>
<h3>Guidelines</h3>
<div class="wp-block-coblocks-accordion">
  <div class="wp-block-coblocks-accordion-item">
    <details>
      <summary><strong>Investigation and Management of Periprosthetic Joint Infection in the Shoulder and Elbow</strong></summary>
      <div class="wp-block-file">
        <a href="https://bess.ac.uk/wp-content/uploads/2020/06/BESS-PJI-guidance-Aug-2018.pdf">PJI-Guidance</a>
        <a href="https://bess.ac.uk/wp-content/uploads/2020/06/BESS-PJI-guidance-Aug-2018.pdf" class="wp-block-file__button">Download</a>
      </div>
    </details>
  </div>
</div>
`;

console.log('\n[3] BESS pathways index — title from <summary>, never from the filename anchor');
{
  const r = parseBessPathwaysIndex(BESS_FIXTURE, BESS_PATHWAYS_SURFACE);
  eq('three documents collected (the empty accordion yields nothing)', r.items.length, 3);

  eq(
    'title comes from the accordion summary, not the anchor text',
    r.items[0].topic,
    'Atraumatic Shoulder Instability',
  );
  check(
    'the filename was NOT used as the title',
    r.items.every((i) => !i.topic.includes('-')) || r.items[0].topic !== 'Atraumatic-Shoulder-Instability',
  );
  eq('PJI title is the full summary text, not "PJI-Guidance"', r.items[2].topic,
    'Investigation and Management of Periprosthetic Joint Infection in the Shoulder and Elbow');

  eq(
    'absolute PDF href preserved verbatim',
    r.items[0].discoveredUrl,
    'https://bess.ac.uk/wp-content/uploads/2020/06/Atraumatic-Shoulder-Instability.pdf',
  );
  eq(
    'relative PDF href resolved against the surface URL',
    r.items[1].discoveredUrl,
    'https://bess.ac.uk/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf',
  );

  eq('section heading captured for the first group', r.items[0].sectionHeading, 'Patient Care Pathways');
  eq('section heading captured for the second group', r.items[2].sectionHeading, 'Guidelines');

  const subacromial = r.items[1];
  check(
    'richer anchor text kept as a stated label when it differs from the summary',
    subacromial.statedLabels.some(
      (l) => l.origin === 'anchor-text' && l.value === 'Subacromial Shoulder Pain – 2025',
    ),
    JSON.stringify(subacromial.statedLabels),
  );
  check(
    'filename with a year kept as a stated label, verbatim',
    subacromial.statedLabels.some(
      (l) => l.origin === 'filename' && l.value === 'Subacromial-Shoulder-Pain-2025.pdf',
    ),
    JSON.stringify(subacromial.statedLabels),
  );
  check(
    'the 2026 upload folder is NOT recorded as the edition year',
    !subacromial.statedLabels.some((l) => l.value === '2026'),
    JSON.stringify(subacromial.statedLabels),
  );
  check(
    'no stated label is a parsed Date — all remain verbatim strings',
    r.items.every((i) => i.statedLabels.every((l) => typeof l.value === 'string')),
  );

  check(
    'every "Download" button rejected as a duplicate of its file link',
    r.excluded.filter((e) => e.reason.includes('Download')).length === 3,
    JSON.stringify(r.excluded.map((e) => e.reason)),
  );
  check(
    'no document collected twice',
    new Set(r.items.map((i) => i.discoveredUrl)).size === r.items.length,
  );
}

// ─── ROS (offline only) ─────────────────────────────────────────────────────

const ROS_ORIGIN = 'https://royal-osteoporosis-society.uksouth01.umbraco.io';
const ROS_FIXTURE = `
<nav><a href="${ROS_ORIGIN}/media/zzzz/nav-brochure.pdf">Nav brochure</a></nav>
<div class="content">
  <ul>
    <li><a href="${ROS_ORIGIN}/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf">Guidelines for the provision of a clinical bone densitometry service August 2025</a></li>
    <li><a href="${ROS_ORIGIN}/media/j1tnbtmc/ros_summary-statement-on-the-use-of-rems-2020-and-2022-update-1.pdf">Summary statement on the use of REMS for bone mineral density measurements- 2022 revision</a></li>
    <li><a href="${ROS_ORIGIN}/media/rn4prxv5/ros-nogg-romosozumab-case-studies-v2.pdf">Clinical case studies- romosozumab</a></li>
    <li><a href="/for-healthcare-professionals/clinical-quality-hub/">Not a PDF</a></li>
  </ul>
</div>
`;

console.log('\n[4] ROS publications index — parsed offline only, hrefs preserved verbatim');
{
  const r = parseRosPublicationsIndex(ROS_FIXTURE, ROS_PUBLICATIONS_SURFACE);
  eq('three PDFs collected', r.items.length, 3);
  check(
    'the ORIGIN-host href is preserved byte-for-byte — never rewritten',
    r.items[0].discoveredUrl ===
      `${ROS_ORIGIN}/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf`,
    r.items[0].discoveredUrl,
  );
  check(
    'no item was silently moved onto the canonical host',
    r.items.every((i) => new URL(i.discoveredUrl).hostname !== ROS_CANONICAL_HOST),
  );
  check('non-PDF link ignored', !r.items.some((i) => i.topic === 'Not a PDF'));
  check(
    'nav PDF rejected and counted',
    r.excluded.some((e) => e.reason.includes('navigation')),
    JSON.stringify(r.excluded),
  );
  check(
    'month-year edition string captured verbatim from the title',
    r.items[0].statedLabels.some((l) => l.value === 'August 2025'),
    JSON.stringify(r.items[0].statedLabels),
  );
  check(
    '"2022 revision" captured verbatim',
    r.items[1].statedLabels.some((l) => l.value === '2022 revision'),
    JSON.stringify(r.items[1].statedLabels),
  );
  check(
    'a v2 filename yields a stated label',
    r.items[2].statedLabels.some((l) => l.origin === 'filename' && l.value.includes('v2')),
    JSON.stringify(r.items[2].statedLabels),
  );
}

console.log('\n[5] Canonical-host alternative — recorded, unprobed, equivalence never claimed');
{
  const discovered = `${ROS_ORIGIN}/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf`;
  const alt = canonicalHostAlternative(discovered, ROS_CANONICAL_HOST);
  check('an alternative is produced', alt !== null);
  if (alt) {
    eq('relation is canonical-host', alt.relation, 'canonical-host');
    eq(
      'only the hostname changed; path preserved',
      alt.url,
      'https://theros.org.uk/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf',
    );
    eq('derivedFrom records the discovered URL verbatim', alt.derivedFrom, discovered);
    eq('equivalence is not-probed — no request was made', alt.equivalence, 'not-probed');
    check(
      'the statement says plainly that nothing was requested',
      alt.statement.includes('NO REQUEST WAS MADE'),
      alt.statement,
    );
    check(
      'the statement does not claim the two serve the same document',
      !/\bidentical\b|\bsame bytes\b|\bequivalent\b(?! candidate)/i.test(alt.statement) ||
        alt.statement.includes('nothing here establishes'),
      alt.statement,
    );
    check(
      'byte length is not cited as evidence anywhere in the statement',
      !/byte length|content-length|\bbytes\b/i.test(alt.statement),
      alt.statement,
    );
  }
  eq(
    'no alternative when the host is already canonical',
    canonicalHostAlternative('https://theros.org.uk/media/x/y.pdf', ROS_CANONICAL_HOST),
    null,
  );
}

console.log('\n[6] BOFAS publisher-stated years — verbatim, only when unambiguous, keyed like the parser');
{
  // Mirrors the live markup of /clinician/research/bofas-publications
  // (observed 2026-10-15): one block per link, year in brackets after it.
  const BOFAS_SURFACE = 'https://www.bofas.org.uk/clinician/research/bofas-publications';
  const html = `
    <p><a href="/Portals/0/Position Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQ%3d%3d">BOFAS / BOA Speciality Standards on Management of End Stage Ankle Arthritis</a> (2025)</p>
    <p><a href="/Portals/0/Position Statements/BOFAS Flatfoot Commissioning guidelines  .pdf?ver=7dk%3d%3d">BOFAS Commissioning Guidelines on Flatfoot Deformities</a></p>
    <p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=5jg%3d%3d">BOFAS Position Statement on VTE</a></p>
    <p><a href="/Portals/0/Research/a.pdf">Ambiguous report</a> (2022) and appendix (2023)</p>
    <p><a href="/Portals/0/Research/b.pdf">Spaced year</a> ( 2019 )</p>`;

  const labels = parseBofasStatedLabels(html, BOFAS_SURFACE);
  const items = parseBofasPublicationsIndex(html, BOFAS_SURFACE);
  const urlOf = (t: string) => items.find((i) => i.topic.startsWith(t))!.versions[0].url;

  const arth = labels.get(urlOf('BOFAS / BOA Speciality Standards'));
  eq('a bracketed year after the anchor is recorded', arth?.length, 1);
  eq('verbatim, brackets included — never parsed into a date', arth?.[0].value, '(2025)');
  eq('origin is the page body', arth?.[0].origin, 'page-body');
  eq('provenance is the surface it was read from', arth?.[0].readFrom, BOFAS_SURFACE);
  eq('no field label is invented (the page gives none)', arth?.[0].fieldLabel, undefined);

  eq('a link with no year gets no label — absence is not "undated"', labels.has(urlOf('BOFAS Commissioning')), false);
  eq('a date in the FILENAME is not read', labels.has(urlOf('BOFAS Position Statement on VTE')), false);
  eq('trailing text beyond a lone year is ambiguous, so nothing is taken', labels.has(urlOf('Ambiguous report')), false);
  eq('whitespace inside the brackets is tolerated, value kept verbatim', labels.get(urlOf('Spaced year'))?.[0].value, '( 2019 )');
  check(
    'every label key is a URL the BOFAS parser itself produced',
    [...labels.keys()].every((k) => items.some((i) => i.versions[0].url === k)),
    JSON.stringify([...labels.keys()]),
  );
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
