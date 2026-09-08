import type { Guideline } from '../data/guidelines-data';
import { canonicalProvider } from './providers';

/**
 * Grouping/sorting for the editorial catalogue view (#/catalogue).
 *
 * Pure and browser-dependency-free so it can be unit-tested offline — same
 * split as providers.ts and gap-detection.ts.
 *
 * The order is FIXED by design and deliberately not user-configurable: the
 * whole point of this view is a stable, predictable reference for editorial
 * verification, so a row is always findable in the same place.
 *
 *   1. Canonical provider, alphabetical  (canonicalProvider — so the 53 raw
 *      `source` spellings collapse to ~26 owning bodies, not one group per
 *      collaboration string)
 *   2. Section, alphabetical within provider
 *   3. Topic, alphabetical within section
 *
 * Note on cross-listing: a guideline is placed under its PRIMARY `section`
 * only, never duplicated into `crossListedIn` sections. The clinician browse
 * screen deliberately does the opposite (one record shown wherever it is
 * clinically relevant), but for a coverage/verification tool duplicated rows
 * would inflate the counts and make "is this actually in the data once?"
 * unanswerable. Total rows here therefore equals the catalogue size exactly.
 *
 * Sections are taken verbatim from the data and sorted alphabetically — no
 * hardcoded section list, so a section that exists in the data can never be
 * silently omitted, and none is invented.
 */

export interface CatalogueSectionGroup {
  section: string;
  items: Guideline[];
}

export interface CatalogueProviderGroup {
  provider: string;
  sections: CatalogueSectionGroup[];
  /** Rows under this provider, across all its sections. */
  total: number;
}

export function buildCatalogue(guidelines: readonly Guideline[]): CatalogueProviderGroup[] {
  const byProvider = new Map<string, Map<string, Guideline[]>>();

  for (const g of guidelines) {
    const provider = canonicalProvider(g.source);
    // Defensive: a row with no section still has to appear somewhere rather
    // than vanishing from a completeness check.
    const section = (g.section ?? '').trim() || 'Unspecified';

    let sections = byProvider.get(provider);
    if (!sections) {
      sections = new Map<string, Guideline[]>();
      byProvider.set(provider, sections);
    }
    const items = sections.get(section);
    if (items) items.push(g);
    else sections.set(section, [g]);
  }

  return [...byProvider.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([provider, sectionMap]) => {
      const sections = [...sectionMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([section, items]) => ({
          section,
          items: [...items].sort((x, y) => x.topic.localeCompare(y.topic)),
        }));
      return {
        provider,
        sections,
        total: sections.reduce((n, s) => n + s.items.length, 0),
      };
    });
}

/** Total rows across every provider — should always equal the input length. */
export function catalogueRowCount(groups: readonly CatalogueProviderGroup[]): number {
  return groups.reduce((n, g) => n + g.total, 0);
}
