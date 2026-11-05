/**
 * scripts/adapters/bofas.ts
 * ──────────────────────────
 * Publisher-stated labels for the BOFAS publications index.
 *
 * The BOFAS parser itself (parseBofasPublicationsIndex in sync-providers.ts) is
 * deliberately unchanged — it decides WHAT the items are. This module only adds
 * WHAT THE PAGE SAYS ABOUT THEM, which that parser discards: on
 * /clinician/research/bofas-publications each link sits in its own block with a
 * year in brackets after the anchor, e.g.
 *
 *   <a href="…/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf">BOFAS / BOA
 *   Speciality Standards …</a> (2025)
 *
 * Without that year a reviewer comparing a candidate against a catalogue entry
 * dated "April 2025" has nothing from the publisher to compare with.
 *
 * Rules, matching the rest of batch 1:
 *   * The value is recorded VERBATIM — "(2025)", brackets included — and never
 *     parsed into a date. A bracketed year next to a link is the publisher's
 *     label; whether it is a publication, revision or upload year is not stated.
 *   * Only a bracketed four-digit year that is the ENTIRE text following the
 *     anchor in its block is taken. Anything looser would be guessing which
 *     number belongs to which document.
 *   * A link with no such year gets no label. Absence is not "undated".
 *   * Filenames are not read for dates ("… v1.0 - 2025-06.pdf"): a filename is
 *     an upload artefact, not a statement to a reader.
 */
import * as cheerio from 'cheerio';
import type { StatedLabel } from '../lib/discovery-classification';
import type { DiscoveredRecord, SurfaceParse } from './types';

const TRAILING_YEAR = /^\(\s*(\d{4})\s*\)$/;

/**
 * Map from each PDF link's resolved URL — resolved exactly as
 * parseBofasPublicationsIndex resolves it, so the keys line up — to the labels
 * the page states for it.
 */
export function parseBofasStatedLabels(html: string, surfaceUrl: string): Map<string, StatedLabel[]> {
  const $ = cheerio.load(html);
  const out = new Map<string, StatedLabel[]>();

  $('a[href*=".pdf"]').each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    if (!rawHref) return;
    const fullUrl = rawHref.startsWith('http') ? rawHref : new URL(rawHref, surfaceUrl).href;
    if (out.has(fullUrl)) return;

    const block = link.closest('p, li, td, div');
    const blockText = block.text().replace(/\s+/g, ' ').trim();
    const anchorText = link.text().replace(/\s+/g, ' ').trim();
    const at = blockText.indexOf(anchorText);
    if (!anchorText || at < 0) return;

    const after = blockText.slice(at + anchorText.length).trim();
    if (!TRAILING_YEAR.test(after)) return;

    out.set(fullUrl, [{ origin: 'page-body', value: after, readFrom: surfaceUrl }]);
  });

  return out;
}

// ─── Discovery V2: full surface parse ───────────────────────────────────────
//
// Everything above this line is batch 1 and is unchanged. What follows gives
// the discovery pipeline a BOFAS parser with the same SurfaceParse contract as
// bess.ts / ebi.ts / bsg.ts, so filtering is visible and section headings and
// stated labels travel with each item. `parseBofasPublicationsIndex` in
// scripts/sync-providers.ts stays the sync pipeline's parser and is not
// touched; ownership for staging is unchanged (staging-ownership.ts).
export const BOFAS_PUBLICATIONS_SURFACE = 'https://www.bofas.org.uk/clinician/research/bofas-publications';
export const BOFAS_ROUND_TABLE_SURFACE = 'https://www.bofas.org.uk/clinician/education/round-table-consensus-booklets';

const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Is this href a PDF, by path — not by anything in the query string. */
function isPdfHref(resolved: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(resolved).pathname);
  } catch {
    return false;
  }
}

/**
 * Nearest preceding h1/h2/h3 in document order. The publications page is one
 * DNN content block with `<h2>` section headings and one `<p><a>…</a> (year)</p>`
 * per document, so "the heading before this paragraph" is the section.
 */
function sectionBefore($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): string | undefined {
  const block = $(el).closest('p, li, td, div');
  const candidates = block.prevAll('h1, h2, h3');
  if (candidates.length > 0) return collapseWs(candidates.first().text()) || undefined;
  const parentPrev = block.parent().prevAll('h1, h2, h3');
  return collapseWs(parentPrev.first().text()) || undefined;
}

/**
 * The BOFAS publications index as a SurfaceParse.
 *
 * Rules:
 *   * Only anchors whose PATH ends in .pdf are documents. A `.pdf` elsewhere
 *     in the href (a query value, a fragment) is not, and is excluded visibly.
 *   * The href is resolved against the surface URL and otherwise preserved —
 *     the `?ver=` cache token stays in `discoveredUrl` exactly as published;
 *     the url-key functions decide what it means (they strip it).
 *   * Title = anchor text, collapsed. An anchor with empty text is excluded,
 *     not given a filename as its title.
 *   * Stated labels: the "(YYYY)" the page prints after the anchor (same rule
 *     as parseBofasStatedLabels), plus the section heading as a 'page-body'
 *     label so a reviewer sees "BOFAS Position Statements" beside the item.
 *   * A PDF with NO heading before it (navigation, sidebar, footer) is not a
 *     document on this page and is excluded with that reason.
 *   * Duplicate hrefs are excluded with a reason.
 */
export function parseBofasPublicationsSurface(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();
  const years = parseBofasStatedLabels(html, surfaceUrl);
  // On the live page every document sits under an <h2>. A PDF outside every
  // headed section is navigation, a sidebar or a footer. A page with NO
  // headings at all is not the publications index as known (a template
  // change, an error or block page, a cut-down copy): every PDF on it is
  // excluded VISIBLY with its own reason, so a structural change surfaces as
  // "0 items, N excluded" (which the monitor treats as an invalid
  // observation) instead of silently admitting unrelated PDFs. Fixtures must
  // therefore carry at least one heading, as the live page does.
  const pageHasHeadings = $('h1, h2, h3').length > 0;

  $('a[href]').each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    if (!rawHref) return;
    let resolved: string;
    try {
      resolved = new URL(rawHref, surfaceUrl).href;
    } catch {
      excluded.push({ url: rawHref, reason: 'href does not resolve to a URL' });
      return;
    }
    if (!/\.pdf/i.test(resolved)) return; // not a document link; nothing to report
    if (!isPdfHref(resolved)) {
      excluded.push({ url: resolved, reason: '".pdf" appears outside the path (query or fragment); not a document link' });
      return;
    }
    const topic = collapseWs(link.text());
    if (!topic) {
      excluded.push({ url: resolved, reason: 'PDF anchor with no link text; a filename is not a title' });
      return;
    }
    if (seen.has(resolved)) {
      excluded.push({ url: resolved, reason: 'duplicate of an item already collected' });
      return;
    }
    seen.add(resolved);

    const sectionHeading = sectionBefore($, el);
    if (!pageHasHeadings) {
      excluded.push({ url: resolved, reason: 'page has no content headings: not the publications index structure this parser knows (template change, error or block page); PDF not admitted' });
      return;
    }
    if (!sectionHeading) {
      // A PDF with no heading before it, on a page that has headings, is
      // navigation, a sidebar or a footer (a newsletter, a course flyer). Not
      // every PDF link is guidance.
      excluded.push({ url: resolved, reason: 'PDF link outside any headed content section (navigation/sidebar); not treated as a document' });
      return;
    }
    const statedLabels: StatedLabel[] = [...(years.get(resolved) ?? [])];
    if (sectionHeading) {
      statedLabels.push({ origin: 'page-body', value: sectionHeading, readFrom: surfaceUrl, fieldLabel: 'section heading' });
    }
    items.push({ topic, discoveredUrl: resolved, statedLabels, sectionHeading });
  });

  return { items, excluded };
}

/**
 * The Round Table consensus booklets page: one `<p><a href="….pdf">Nth Round
 * Table Meeting - YYYY - City</a></p>` per booklet under a single `<h1>`.
 *
 * The year and city are in the anchor text; they are recorded as a stated
 * label (origin 'anchor-text') and never parsed into a date. The catalogue
 * holds this series as ONE entry (`bofas-round-table-consensus`) whose single
 * link is the newest booklet, so every earlier booklet will be reported by the
 * classifier — that is a series/edition question for the coverage-gap tool and
 * the editor, not something this parser should hide.
 */
export function parseBofasRoundTableIndex(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();
  const sectionHeading = collapseWs($('h1').first().text()) || undefined;

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
    if (!isPdfHref(resolved)) return;
    const topic = collapseWs(link.text());
    if (!topic) {
      excluded.push({ url: resolved, reason: 'PDF anchor with no link text' });
      return;
    }
    if (!/round table/i.test(topic)) {
      excluded.push({ url: resolved, reason: `PDF on the booklets page whose text does not name a Round Table meeting: "${topic.slice(0, 50)}"` });
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
      statedLabels: [
        { origin: 'anchor-text', value: topic, readFrom: surfaceUrl },
        ...(sectionHeading ? [{ origin: 'page-body' as const, value: sectionHeading, readFrom: surfaceUrl, fieldLabel: 'section heading' }] : []),
      ],
      sectionHeading,
    });
  });

  return { items, excluded };
}

/**
 * Scope gate for discover.ts: the publications page lists the UK-FALCON COVID
 * national audit report beside the position statements and guidelines. An
 * audit report is not clinical guidance. The filter is keyed on the page's own
 * section heading, not on the title, and the runner reports it visibly.
 * (The document is also on the database hold list, so it could not be staged
 * anyway; the gate keeps it out of the candidate count and the gap report.)
 */
export function gateBofasScope(item: { topic: string; discoveredUrl: string; sectionHeading?: string }): string | null {
  if (item.sectionHeading && /national covid audit|uk-falcon/i.test(item.sectionHeading)) {
    return `listed under "${item.sectionHeading}": a national audit report, not clinical guidance`;
  }
  return null;
}
