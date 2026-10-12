/**
 * scripts/adapters/ebi.ts
 * ────────────────────────
 * NHS Evidence-Based Interventions programme (ebi.aomrc.org.uk).
 *
 * PURE PARSERS. No network — the caller fetches via
 * scripts/lib/discovery-cache.ts and hands the HTML in.
 *
 * ─── WHY THE SPECIALTY TERM AND NOT THE A–Z ─────────────────────────────────
 *
 * The programme publishes 63 interventions. Its own taxonomy carries a
 * `musculoskeletal-spine` term listing 17 of them, which is the publisher's
 * classification of what is musculoskeletal — not a keyword guess of ours. The
 * `/interventions/` A–Z has no filter controls at all, so sweeping it would
 * re-discover the other 46 and leave us inventing a scope rule the publisher
 * already applied.
 *
 * ─── THE SELECTOR, AND WHY IT IS NARROW ─────────────────────────────────────
 *
 * The page wraps each item in `div.intervention-link`. That is used rather than
 * `a[href*="/interventions/"]`, which on this page also matches:
 *
 *   - the primary-nav and mobile-nav links to the A–Z index,
 *   - a breadcrumb link to the A–Z index,
 *   - a row of Heateor social-share anchors (`class="heateor_sss_*"`,
 *     `aria-label="Email"` and friends) whose hrefs are the FULL intervention
 *     URLs, which is the trap — they look exactly like content links.
 *
 * Anything matched but rejected is returned in `excluded` so the filtering is
 * visible in the report rather than implied.
 *
 * ─── RETIRED GUIDANCE ───────────────────────────────────────────────────────
 *
 * `/specialty/retired-guidance/` is parsed by the same function. Membership of
 * that term is a PUBLISHER ASSERTION that the programme has retired the
 * guidance. It is reported as an assertion, attributed to the surface it was
 * read from, and changes no catalogue status by itself — a retired-guidance
 * listing is not a withdrawal we have verified, and this adapter never says it
 * is.
 */
import * as cheerio from 'cheerio';
import type { DiscoveredRecord, SurfaceParse } from './types';
import type { StatedLabel } from '../lib/discovery-classification';

export const EBI_MSK_SURFACE = 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/';
export const EBI_RETIRED_SURFACE = 'https://ebi.aomrc.org.uk/specialty/retired-guidance/';

/** Any link into the interventions area, index page included. */
const INTERVENTIONS_AREA = /^\/interventions\/?/;
/** A link to a SPECIFIC intervention: one path segment past /interventions/. */
const SPECIFIC_INTERVENTION = /^\/interventions\/[^/]+\/?$/;

/**
 * Parse a specialty-term listing page.
 *
 * Returns one record per intervention, with the anchor text as the title
 * verbatim. The EBI listing's anchor text IS the document title here (unlike
 * BESS), so no further lookup is needed.
 */
export function parseEbiSpecialtyIndex(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();

  // Everything that looks like an intervention link anywhere on the page, so
  // that rejections can be counted rather than never seen.
  $('a[href]').each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    if (!rawHref) return;

    let resolved: string;
    try {
      resolved = new URL(rawHref, surfaceUrl).href;
    } catch {
      return;
    }
    const pathname = new URL(resolved).pathname;
    if (!INTERVENTIONS_AREA.test(pathname)) return;

    // A link to the A–Z index itself is not a document. Recorded rather than
    // skipped silently: it is precisely what a loose href filter would collect,
    // so the report should show that the parser saw it and declined it.
    if (!SPECIFIC_INTERVENTION.test(pathname)) {
      excluded.push({
        url: resolved,
        reason: 'link to the /interventions/ A–Z index, not to a specific intervention',
      });
      return;
    }

    const insideContent = link.closest('.intervention-link').length > 0;
    if (!insideContent) {
      const why = link.attr('aria-label')
        ? 'social-share anchor (carries aria-label, outside .intervention-link)'
        : link.closest('nav, .breadcrumb, header, footer, .menu-item').length > 0
          ? 'navigation or breadcrumb link'
          : 'outside the .intervention-link content container';
      excluded.push({ url: resolved, reason: why });
      return;
    }

    const topic = link.text().replace(/\s+/g, ' ').trim();
    if (!topic) {
      excluded.push({ url: resolved, reason: 'anchor has no text to use as a title' });
      return;
    }

    if (seen.has(resolved)) {
      excluded.push({ url: resolved, reason: 'duplicate of an item already collected' });
      return;
    }
    seen.add(resolved);

    items.push({
      topic,
      discoveredUrl: resolved,
      statedLabels: [],
      sectionHeading: $('h1.page-title').first().text().replace(/\s+/g, ' ').trim() || undefined,
    });
  });

  return { items, excluded };
}

/**
 * Publisher-stated dates on a single intervention page.
 *
 * The page states them in its own words — "Published January 2020",
 * "Last reviewed September 2024". Both are captured VERBATIM, with the label
 * the page gave them, and neither is parsed into a date: see the scope
 * document §3 on why a server timestamp and a publisher assertion are not the
 * same kind of thing.
 *
 * NOT CALLED BY THE BATCH-1 SWEEP. Reading it would mean one request per
 * intervention — 17 extra requests per run for metadata no classification
 * depends on. Kept and tested so a later batch can enable it deliberately
 * rather than reimplement it.
 */
export function parseEbiInterventionDates(html: string, pageUrl: string): StatedLabel[] {
  const $ = cheerio.load(html);
  const labels: StatedLabel[] = [];
  const text = $('body').text().replace(/\s+/g, ' ');

  for (const [fieldLabel, pattern] of [
    ['Published', /Published\s+([A-Z][a-z]+\s+\d{4})/],
    ['Last reviewed', /Last\s+reviewed\s+([A-Z][a-z]+\s+\d{4})/],
  ] as const) {
    const m = text.match(pattern);
    if (m) {
      labels.push({
        origin: 'page-body',
        value: m[1],
        readFrom: pageUrl,
        fieldLabel,
      });
    }
  }

  return labels;
}
