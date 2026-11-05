/**
 * scripts/adapters/bsg.ts
 * ────────────────────────
 * British Sarcoma Group (britishsarcomagroup.org.uk) — discovery parser.
 *
 * PURE PARSER. No network. Same contract as bess.ts / ebi.ts (SurfaceParse).
 *
 * NOT the same thing as `parseBsgIndex` in scripts/sync-providers.ts, which
 * stays untouched: that parser feeds the sync-providers pipeline, which owns
 * BSG for staging (scripts/lib/staging-ownership.ts). This parser feeds the
 * discovery pipeline (scripts/discover.ts, dry-run and coverage reporting);
 * under current ownership its BSG items can never be staged (`not-owner`).
 *
 * ─── THE PAGE ───────────────────────────────────────────────────────────────
 *
 * `/guidelines-2/` is a Divi page. The catalogue's recorded fallback index,
 * `/guidelines/`, now carries only a privacy-policy link (observed 5 Nov 2026);
 * the real index is this page. Documents are Divi "promo" modules:
 *
 *     <h1>BSG Clinical Guidelines</h1>                         ← section heading
 *     <div class="et_pb_promo">
 *       <div class="et_pb_promo_description">
 *         <h2 class="et_pb_module_header">STS Guidelines 2024</h2>   ← short label
 *         <div><p>UK BSG Guidelines for the Management of …</p></div> ← full title
 *       </div>
 *       <a class="et_pb_promo_button" href="https://www.nature.com/…">View Guidelines</a>
 *     </div>
 *
 * Three traps, each handled explicitly rather than by accident:
 *
 *   1. The module header is a SHORT LABEL ("STS Guidelines 2024"), not the
 *      document title. The title the publisher presents is the paragraph under
 *      it. Taking the header as the topic would feed "STS Guidelines 2024" into
 *      title matching against a catalogue entry called "UK guidelines for the
 *      management of soft tissue sarcomas" and miss. So: topic = paragraph when
 *      present, header otherwise; the header is kept as a STATED LABEL (it is
 *      where the publisher puts the edition year).
 *
 *   2. Section headings are `<h1>` elements in SEPARATE Divi sections, so
 *      `closest('.et_pb_section')` gives the wrong heading for the modules
 *      under "Service Requirements". The heading is therefore the nearest
 *      preceding h1/h2/h3 in DOCUMENT ORDER that is not itself a module header.
 *
 *   3. Modules WITHOUT a module header are external references ("NICE sarcoma
 *      overview", "Scottish Sarcoma Network", a Welsh standard marked "Not
 *      currently available" with no link). They are not BSG documents. They
 *      are EXCLUDED with a visible reason, matching the sync-providers parser's
 *      long-standing "exactly 9 documents" behaviour, never silently dropped.
 *
 * Journal-hosted guidelines (nature.com, link.springer.com, ejcancer.com) are
 * kept: the publisher lists them as its guidance. Whether a DOI landing page and
 * a doi.org link are the same document is the classifier's question, not this
 * parser's — it preserves the href as published.
 */
import * as cheerio from 'cheerio';
import type { DiscoveredRecord, SurfaceParse } from './types';
import type { StatedLabel } from '../lib/discovery-classification';

export const BSG_GUIDELINES_SURFACE = 'https://britishsarcomagroup.org.uk/guidelines-2/';

/** Section headings on this surface whose modules are BSG's OWN guidance. */
export const BSG_GUIDANCE_SECTIONS = ['BSG Clinical Guidelines'] as const;

/**
 * Section headings KNOWN to hold curated third-party material, not BSG's own
 * guidance. The scope gate filters ONLY these. A heading it has never seen
 * (the page was reorganised, a section was renamed or added) is admitted for
 * editorial review rather than silently dropped: section drift must fail open,
 * because a reviewer can discard a stray item but cannot see one that was
 * never reported.
 */
export const BSG_NON_GUIDANCE_SECTIONS = ['Other Resources', 'Service Requirements', 'Useful Links'] as const;
const knownNonGuidance = (heading: string) => (BSG_NON_GUIDANCE_SECTIONS as readonly string[]).some((k) => k.toLowerCase() === heading.trim().toLowerCase());

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export function parseBsgGuidelinesIndex(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();

  // Document-order list of every heading and every promo module, so each module
  // can be assigned the heading that precedes it on the page.
  let currentSection: string | undefined;
  $('h1, h2, h3, div.et_pb_promo').each((_, el) => {
    const node = $(el);
    const tag = (el as unknown as { tagName?: string }).tagName?.toLowerCase();

    if (tag !== 'div') {
      // A module's own header is not a section heading.
      if (node.hasClass('et_pb_module_header')) return;
      const text = collapse(node.text());
      if (text) currentSection = text;
      return;
    }

    const header = collapse(node.find('.et_pb_module_header').first().text());
    const paragraph = collapse(node.find('.et_pb_promo_description p').first().text());
    const button = node.find('a.et_pb_promo_button[href]').first();
    const rawHref = button.attr('href')?.trim();

    let resolved: string | null = null;
    if (rawHref) {
      try {
        resolved = new URL(rawHref, surfaceUrl).href;
      } catch {
        resolved = null;
      }
    }

    if (!header) {
      excluded.push({
        url: resolved ?? '(no link)',
        reason: `promo module without a module header under "${currentSection ?? 'no heading'}": an external reference, not a BSG document${paragraph ? ` ("${paragraph.slice(0, 60)}")` : ''}`,
      });
      return;
    }
    if (!resolved) {
      excluded.push({ url: '(no link)', reason: `module "${header}" has no document link` });
      return;
    }
    if (seen.has(resolved)) {
      excluded.push({ url: resolved, reason: 'duplicate of an item already collected' });
      return;
    }
    seen.add(resolved);

    // Two module shapes exist on this page:
    //   label-style   header "STS Guidelines 2024", paragraph = the full title;
    //   title-style   header IS the title ("Management of Primary Retroperitoneal
    //                 Sarcoma (RPS) in the Adult"), paragraph = a subtitle.
    // A header that is a few words ending in a year is the label style.
    const headerIsLabel = /\b(19|20)\d{2}\s*$/.test(header) && header.split(' ').length <= 6;
    const topic = headerIsLabel && paragraph ? paragraph : header;

    const statedLabels: StatedLabel[] = [
      { origin: 'page-body', value: header, readFrom: surfaceUrl, fieldLabel: 'module heading' },
    ];
    if (!headerIsLabel && paragraph && paragraph !== header) {
      statedLabels.push({ origin: 'page-body', value: paragraph, readFrom: surfaceUrl, fieldLabel: 'subtitle' });
    }
    const buttonText = collapse(button.text());
    if (buttonText) {
      statedLabels.push({ origin: 'anchor-text', value: buttonText, readFrom: surfaceUrl });
    }

    items.push({
      topic,
      discoveredUrl: resolved,
      statedLabels,
      sectionHeading: currentSection,
    });
  });

  return { items, excluded };
}

/**
 * Scope gate for discover.ts: BSG lists a gastrointestinal stromal tumour
 * guideline and curated third-party resources beside its orthopaedic sarcoma
 * guidance. Neither is in the hub's clinical scope as the catalogue defines it
 * today (three BSG entries: bone sarcoma, soft tissue sarcoma, ultrasound
 * screening of soft-tissue masses). Filtering is VISIBLE: the runner reports
 * every filtered item with this reason.
 *
 * Returns null to admit, or the reason to filter.
 */
export function gateBsgScope(item: { topic: string; discoveredUrl: string; sectionHeading?: string }): string | null {
  if (/gastrointestinal stromal/i.test(item.topic)) {
    return 'gastrointestinal stromal tumour guidance: outside the hub\'s orthopaedic scope (editorial decision pending, see handoff)';
  }
  if (item.sectionHeading && knownNonGuidance(item.sectionHeading)) {
    return `listed under "${item.sectionHeading}", a curated third-party resource section, not BSG's own guidance`;
  }
  // Known guidance section, an unknown heading (section drift), or no heading
  // at all: admitted. Unknown headings reach the reviewer via the item's
  // "section heading" stated label and the classification's review signal.
  return null;
}
