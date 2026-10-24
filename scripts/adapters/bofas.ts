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
