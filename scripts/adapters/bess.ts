/**
 * scripts/adapters/bess.ts
 * ─────────────────────────
 * British Elbow & Shoulder Society (bess.ac.uk).
 *
 * PURE PARSER. No network.
 *
 * ─── THE PAGE, AND THE TRAP IN IT ───────────────────────────────────────────
 *
 * `/patient-care-pathways-and-guidelines/` is a WordPress page built from
 * CoBlocks accordions: nine `<details>` items under two `<h3>` headings
 * ("Patient Care Pathways", "Guidelines"). Each accordion holds a
 * `.wp-block-file` with TWO anchors to the same PDF — the file link and a
 * styled "Download" button.
 *
 * The trap is the title. The file anchor's text is THE FILENAME:
 *
 *     <summary><strong>Atraumatic Shoulder Instability</strong></summary>
 *     ...
 *     <a href=".../Atraumatic-Shoulder-Instability.pdf">Atraumatic-Shoulder-Instability</a>
 *
 * A parser that takes anchor text would feed "Atraumatic-Shoulder-Instability",
 * "PJI-Guidance" and "TER-SPG" into title matching as document titles. So the
 * title is taken from the accordion's `<summary>`, which is what the provider
 * shows a reader, and the anchor text is kept as a STATED LABEL instead —
 * where it is useful, because it is sometimes richer than the summary: the
 * summary reads "Subacromial Shoulder Pain" while the link text reads
 * "Subacromial Shoulder Pain – 2025", and that year is the provider's own
 * edition assertion.
 *
 * ─── WHAT THIS SURFACE CANNOT SEE ───────────────────────────────────────────
 *
 * `/national-guidelines/` is a wp-file-download manager whose category tree
 * loads over admin-ajax.php; its static HTML contains no document links. Three
 * existing catalogue entries use WPFD URLs of the form
 * `/download/<catId>/<cat-slug>/<fileId>/<file>.pdf`, which this surface does
 * not expose. BESS coverage is therefore declared `partial` in the registry
 * with those gaps named — the adapter is not silently complete.
 */
import * as cheerio from 'cheerio';
import type { DiscoveredRecord, SurfaceParse } from './types';
import type { StatedLabel } from '../lib/discovery-classification';

export const BESS_PATHWAYS_SURFACE = 'https://bess.ac.uk/patient-care-pathways-and-guidelines/';

/** A year, or a date-ish fragment, as the provider wrote it. */
const YEAR_LIKE = /\b(19|20)\d{2}\b/;

function filenameOf(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
  } catch {
    return '';
  }
}

export function parseBessPathwaysIndex(html: string, surfaceUrl: string): SurfaceParse {
  const $ = cheerio.load(html);
  const items: DiscoveredRecord[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  const seen = new Set<string>();

  $('details').each((_, el) => {
    const details = $(el);
    const topic = details.find('summary').first().text().replace(/\s+/g, ' ').trim();

    // The nearest preceding <h3> is the section this accordion sits under.
    const sectionHeading =
      details.closest('.wp-block-coblocks-accordion').prevAll('h3').first().text().replace(/\s+/g, ' ').trim() ||
      details.prevAll('h3').first().text().replace(/\s+/g, ' ').trim() ||
      undefined;

    // Candidate PDF anchors inside this accordion, button duplicates rejected.
    const anchors = details.find('a[href]').toArray();
    let chosen: { url: string; text: string } | null = null;

    for (const a of anchors) {
      const link = $(a);
      const rawHref = link.attr('href')?.trim();
      if (!rawHref) continue;

      let resolved: string;
      try {
        resolved = new URL(rawHref, surfaceUrl).href;
      } catch {
        continue;
      }
      if (!/\.pdf(?:$|[?#])/i.test(resolved)) continue;

      const isButton = (link.attr('class') ?? '').includes('wp-block-file__button');
      if (isButton) {
        excluded.push({ url: resolved, reason: 'styled "Download" button duplicating the file link' });
        continue;
      }
      if (chosen) {
        excluded.push({ url: resolved, reason: 'additional PDF anchor in an accordion that already yielded one' });
        continue;
      }
      chosen = { url: resolved, text: link.text().replace(/\s+/g, ' ').trim() };
    }

    if (!topic) {
      if (chosen) excluded.push({ url: chosen.url, reason: 'accordion has no <summary> text to use as a title' });
      return;
    }
    if (!chosen) return; // An accordion with no PDF is not an omission; it is not a document.

    if (seen.has(chosen.url)) {
      excluded.push({ url: chosen.url, reason: 'duplicate of an item already collected' });
      return;
    }
    seen.add(chosen.url);

    const statedLabels: StatedLabel[] = [];

    // The anchor text, when it says something the summary does not. This is
    // where BESS puts an edition year ("Subacromial Shoulder Pain – 2025").
    if (chosen.text && chosen.text !== topic) {
      statedLabels.push({
        origin: 'anchor-text',
        value: chosen.text,
        readFrom: surfaceUrl,
      });
    }

    // The filename, when it carries a year or a date. BESS encodes editions
    // there too ("BESS-PJI-guidance-Aug-2018.pdf", "BESS-TER-SPG-21.5.18.pdf").
    // Recorded verbatim as a provider-stated string, NOT parsed into a date:
    // an upload-folder year is a CMS artefact, and even a year in a filename is
    // the provider's shorthand rather than a publication date we verified.
    const filename = filenameOf(chosen.url);
    if (filename && YEAR_LIKE.test(filename)) {
      statedLabels.push({
        origin: 'filename',
        value: filename,
        readFrom: chosen.url,
      });
    }

    items.push({
      topic,
      discoveredUrl: chosen.url,
      statedLabels,
      sectionHeading,
    });
  });

  return { items, excluded };
}
