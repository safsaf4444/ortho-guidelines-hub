/**
 * scripts/tests/bsg-discovery-adapter.test.ts
 * ───────────────────────────────────────────
 * Offline parse tests for scripts/adapters/bsg.ts (Discovery V2). NO NETWORK.
 * Fixtures are compact synthetic HTML in the shape of the live Divi page
 * (verified 2026-11-05); no publisher content is reproduced beyond titles.
 *
 * Run:   npx tsx scripts/tests/bsg-discovery-adapter.test.ts
 * Exit:  0 = all passed, 1 = at least one failure.
 */
import { parseBsgGuidelinesIndex, gateBsgScope, BSG_GUIDELINES_SURFACE } from '../adapters/bsg';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const promo = (header: string | null, para: string | null, href: string | null, button = 'View Guidelines') => `
<div class="et_pb_module et_pb_promo">
  <div class="et_pb_promo_description">
    ${header === null ? '' : `<h2 class="et_pb_module_header">${header}</h2>`}
    ${para === null ? '' : `<div><p>${para}</p></div>`}
  </div>
  ${href === null ? '' : `<div class="et_pb_button_wrapper"><a class="et_pb_button et_pb_promo_button" href="${href}">${button}</a></div>`}
</div>`;

const FIXTURE = `
<nav><a href="/about/">About</a><a href="/wp-content/uploads/2025/12/privacy-policy.pdf">Privacy Policy</a></nav>
<div class="et_pb_section"><h1 class="et_pb_module_heading">Guidelines</h1></div>
<div class="et_pb_section"><h1>BSG Clinical Guidelines</h1>
  ${promo('STS Guidelines 2024', 'UK BSG Guidelines for the Management of Soft Tissue Sarcomas', 'https://www.nature.com/articles/s41416-024-02674-y')}
  ${promo('Rehab Guidelines 2024', 'UK BSG Guidelines for rehabilitation after diagnosis of bone and soft tissue tumours', '/wp-content/uploads/2026/02/DEVELO1.pdf')}
  ${promo('GIST Guidelines 2024', 'UK BSG Guidelines for the Management of Gastrointestinal Stromal Tumour (GIST)', 'https://www.nature.com/articles/s41416-024-02672-0.epdf?sharing_token=abc')}
  ${promo('STS Guidelines 2024', 'UK BSG Guidelines for the Management of Soft Tissue Sarcomas', 'https://www.nature.com/articles/s41416-024-02674-y')}
</div>
<div class="et_pb_section"><h1><span>Service Requirements</span></h1>
  ${promo(null, 'National Institute for Health and Care Excellence (NICE) sarcoma overview', 'https://www.nice.org.uk/guidance/conditions-and-diseases/cancer/sarcoma', 'View here')}
  ${promo(null, 'Wales – National Standards for Sarcoma Services 2009. Not currently available', null, '')}
</div>
<div class="et_pb_section"><h1>Other Resources</h1>
  ${promo('Management of Primary Retroperitoneal Sarcoma (RPS) in the Adult', 'A Consensus Approach From the Trans-Atlantic RPS Working Group – 2014', 'https://link.springer.com/article/10.1245/s10434-014-3965-2', 'View here')}
  ${promo('Orphan module with header but no link', 'Some subtitle', null)}
</div>
<div class="et_pb_section"><h1>Useful Links</h1><h3>Research</h3><a href="https://example.org/trial">A trial</a></div>
`;

console.log('\n[1] normal index parse');
{
  const r = parseBsgGuidelinesIndex(FIXTURE, BSG_GUIDELINES_SURFACE);
  eq('items parsed (duplicate, header-less and link-less modules excluded)', r.items.length, 4);
  eq('excluded count', r.excluded.length, 4);
  const sts = r.items[0];
  eq('label-style module: topic is the paragraph (the full title), not the short header', sts.topic, 'UK BSG Guidelines for the Management of Soft Tissue Sarcomas');
  eq('…the short header is kept as a stated label', sts.statedLabels.find((l) => l.fieldLabel === 'module heading')?.value, 'STS Guidelines 2024');
  eq('…button text kept as anchor-text label', sts.statedLabels.find((l) => l.origin === 'anchor-text')?.value, 'View Guidelines');
  eq('…section heading is the preceding h1, not the module header', sts.sectionHeading, 'BSG Clinical Guidelines');
  eq('…external journal href preserved verbatim', sts.discoveredUrl, 'https://www.nature.com/articles/s41416-024-02674-y');
  eq('relative href resolved against the surface', r.items[1].discoveredUrl, 'https://britishsarcomagroup.org.uk/wp-content/uploads/2026/02/DEVELO1.pdf');
  eq('query string on an href preserved (not stripped by the parser)', r.items[2].discoveredUrl.includes('?sharing_token=abc'), true);
  const rps = r.items[3];
  eq('title-style module: the header IS the title', rps.topic, 'Management of Primary Retroperitoneal Sarcoma (RPS) in the Adult');
  eq('…the paragraph is kept as a subtitle label', rps.statedLabels.find((l) => l.fieldLabel === 'subtitle')?.value, 'A Consensus Approach From the Trans-Atlantic RPS Working Group – 2014');
  eq('…under the Other Resources heading (a different Divi section)', rps.sectionHeading, 'Other Resources');
  check('duplicate URL excluded with a reason', r.excluded.some((e) => /duplicate/.test(e.reason)));
  check('header-less service references excluded, naming their section', r.excluded.filter((e) => /without a module header under "Service Requirements"/.test(e.reason)).length === 2);
  check('module with a header but no link excluded', r.excluded.some((e) => /has no document link/.test(e.reason)));
  check('the privacy-policy PDF in the nav never becomes an item', !r.items.some((i) => /privacy/i.test(i.discoveredUrl)));
  check('the Useful Links anchor never becomes an item', !r.items.some((i) => /example\.org/.test(i.discoveredUrl)));
}

console.log('\n[2] scope gate (visible filtering, not parsing)');
{
  const r = parseBsgGuidelinesIndex(FIXTURE, BSG_GUIDELINES_SURFACE);
  eq('soft-tissue sarcoma guideline admitted', gateBsgScope(r.items[0]), null);
  check('GIST guideline filtered, with the reason naming the scope decision', /gastrointestinal stromal/i.test(gateBsgScope(r.items[2]) ?? ''));
  check('Other Resources item filtered as a curated third-party resource', /Other Resources/.test(gateBsgScope(r.items[3]) ?? ''));
  eq('an item with no section heading is admitted (the gate only filters on positive evidence)', gateBsgScope({ topic: 'x', discoveredUrl: 'https://example.org/x' }), null);
}

console.log('\n[3] empty and malformed pages');
{
  eq('empty page parses to 0 items (the runner treats that as a parse failure on this surface)', parseBsgGuidelinesIndex('', BSG_GUIDELINES_SURFACE).items.length, 0);
  eq('a page with no promo modules parses to 0 items', parseBsgGuidelinesIndex('<html><body><h1>BSG Clinical Guidelines</h1><p>coming soon</p></body></html>', BSG_GUIDELINES_SURFACE).items.length, 0);
  const broken = parseBsgGuidelinesIndex('<div class="et_pb_promo"><div class="et_pb_promo_description"><h2 class="et_pb_module_header">Broken 2024</h2><p>Unclosed', BSG_GUIDELINES_SURFACE);
  eq('malformed HTML without a link: nothing invented, excluded with a reason', broken.items.length, 0);
  check('…and the exclusion is recorded', broken.excluded.length === 1 && /no document link/.test(broken.excluded[0].reason));
  const badHref = parseBsgGuidelinesIndex(promo('Bad 2024', 'A title', 'http://'), BSG_GUIDELINES_SURFACE);
  eq('an unresolvable href is excluded, not thrown', badHref.items.length, 0);
}

console.log('\n[4] determinism');
{
  const a = JSON.stringify(parseBsgGuidelinesIndex(FIXTURE, BSG_GUIDELINES_SURFACE));
  const b = JSON.stringify(parseBsgGuidelinesIndex(FIXTURE, BSG_GUIDELINES_SURFACE));
  eq('two parses of the same HTML are byte-identical', a === b, true);
}


console.log('\n[5] P2-5: section drift fails OPEN — only known non-guidance sections are filtered');
{
  const item = (section?: string) => ({ topic: 'UK guidelines for the management of bone sarcomas (2025)', discoveredUrl: 'https://doi.org/10.1186/s13569-025-00000-0', sectionHeading: section });
  eq('known guidance section admitted', gateBsgScope(item('BSG Clinical Guidelines')), null);
  for (const known of ['Other Resources', 'Service Requirements', 'Useful Links', 'other resources']) {
    check(`known non-guidance section "${known}" filtered (case-insensitive)`, /curated third-party/.test(gateBsgScope(item(known)) ?? ''));
  }
  eq('RENAMED guidance section (drift) is admitted for review, not dropped', gateBsgScope(item('Clinical Guidelines & Standards')), null);
  eq('a NEW, never-seen section is admitted for review, not dropped', gateBsgScope(item('Guidance 2026')), null);
  eq('no section heading at all: admitted', gateBsgScope(item(undefined)), null);
  check('GIST scope filter still applies regardless of section', /gastrointestinal stromal/.test(gateBsgScope({ topic: 'Gastrointestinal stromal tumours: UK guidelines', discoveredUrl: 'https://doi.org/10.1186/x', sectionHeading: 'BSG Clinical Guidelines' }) ?? ''));
  // End to end: a reorganised page where the guidance module sits under a renamed heading.
  const drifted = parseBsgGuidelinesIndex(
    `<div class="et_pb_section"><h1>Clinical Guidance (updated)</h1>${promo('Bone Sarcoma Guidelines 2025', 'UK guidelines for the management of bone sarcomas', 'https://doi.org/10.1186/s13569-025-00000-0')}</div>`,
    BSG_GUIDELINES_SURFACE,
  );
  eq('parsed under the drifted heading', [drifted.items.length, drifted.items[0]?.sectionHeading], [1, 'Clinical Guidance (updated)']);
  eq('… and the gate lets it through to review', gateBsgScope(drifted.items[0]), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
