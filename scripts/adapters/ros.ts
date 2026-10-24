/**
 * scripts/adapters/ros.ts
 * ────────────────────────
 * Royal Osteoporosis Society (theros.org.uk).
 *
 * PURE PARSER. No network — and for ROS specifically, NOTHING MAY FETCH THIS
 * SURFACE AT ALL.
 *
 * ─── ACCESS APPROVAL IS UNRESOLVED ──────────────────────────────────────────
 *
 * ROS's terms of use expressly permit LINKING to their site, and separately
 * prohibit "reproduction, storage, modification, distribution or republication"
 * of their Material without prior written consent. Permission to place a
 * hyperlink is NOT permission for automated retrieval or storage, and the terms
 * do not address automated access at all. Whether a scraped title and a stored
 * URL fall under that prohibition is a question for ROS, not one to settle by
 * reading their linking clause generously.
 *
 * So the registry marks ROS `awaiting-approval`, the runner never fetches it,
 * and this module exists only as a tested parser ready for the day the question
 * is answered. Writing and testing a parser against fixture HTML is not
 * collection; running it against the live site would be.
 *
 * ─── THE FIXTURE IS HAND-BUILT, NOT A CAPTURED PAGE ─────────────────────────
 *
 * The fixture in scripts/tests/discovery-adapters.test.ts was written by hand to
 * match the STRUCTURE observed during the single pre-coding read that produced
 * the scope document. It is not a saved copy of the provider's page, and no ROS
 * page is stored in this repository. If approval is granted, the first thing to
 * do is re-check the live structure against this fixture before trusting the
 * parser — a hand-built fixture proves the parser self-consistent, not correct
 * against the live page.
 *
 * ─── WHAT MAKES ROS INTERESTING ANYWAY ──────────────────────────────────────
 *
 * Every PDF href on the publications list points at
 * `royal-osteoporosis-society.uksouth01.umbraco.io` — the Umbraco origin host,
 * not the canonical public site — while the catalogue's four existing ROS
 * entries store their PDFs under `theros.org.uk/media/...`. So the discovered
 * URL and the catalogue URL for the same document differ only by hostname, and
 * a URL-only match on the discovered form would match none of them.
 *
 * The adapter's response is to PRESERVE the discovered href verbatim and record
 * the canonical-host form as an alternative, unprobed and with equivalence
 * explicitly unasserted (see scripts/lib/url-alternatives.ts). It does not
 * rewrite the provider's URL, and it does not claim the two serve the same
 * bytes.
 */
import * as cheerio from 'cheerio';
import type { DiscoveredRecord, SurfaceParse } from './types';
import type { StatedLabel } from '../lib/discovery-classification';

export const ROS_PUBLICATIONS_SURFACE =
  'https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/';

/** The provider's canonical public hostname. */
export const ROS_CANONICAL_HOST = 'theros.org.uk';

/**
 * Edition-ish strings ROS writes into anchor text and filenames:
 * "August 2025", "2022 revision", "v2", "March 2019".
 */
const EDITION_LIKE = [
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2}\b/i,
  /\b(?:19|20)\d{2}\s+revision\b/i,
  /\bv\d+(?:\.\d+)?\b/i,
  /\b(?:19|20)\d{2}\b/,
];

function firstEditionLike(text: string): string | null {
  for (const pattern of EDITION_LIKE) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return null;
}

function filenameOf(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  } catch {
    return '';
  }
}

export function parseRosPublicationsIndex(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();

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
    if (!/\.pdf(?:$|[?#])/i.test(resolved)) return;

    // Navigation and chrome do not link PDFs on this page, but a theme change
    // could; rejecting them visibly is cheaper than discovering it later.
    if (link.closest('nav, header, footer, .breadcrumb').length > 0) {
      excluded.push({ url: resolved, reason: 'PDF link inside navigation or page chrome' });
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

    const statedLabels: StatedLabel[] = [];

    const fromTitle = firstEditionLike(topic);
    if (fromTitle) {
      statedLabels.push({ origin: 'anchor-text', value: fromTitle, readFrom: surfaceUrl });
    }

    const filename = filenameOf(resolved);
    const fromFilename = filename ? firstEditionLike(filename) : null;
    if (fromFilename) {
      statedLabels.push({ origin: 'filename', value: filename, readFrom: resolved });
    }

    items.push({ topic, discoveredUrl: resolved, statedLabels });
  });

  return { items, excluded };
}
