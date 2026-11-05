/**
 * src/lib/search/app-adapter.ts
 * ─────────────────────────────
 * The one function the public UI would call if it adopted the v2 engine.
 * Used through the accessibility-safe guideline-filter.ts seam. Kept separate from engine.ts so
 * the engine stays free of app conventions.
 *
 * Semantics chosen to match what App.tsx does today:
 *   - an empty query returns every visible guideline in catalogue
 *     order (the app shows the whole catalogue, grouped by section);
 *   - a non-empty query returns only matching guidelines, best first, so the
 *     existing section grouping keeps its order within each section;
 *   - the existing archived flag remains hidden; clinical status labels are
 *     preserved, and partial/related-only suggestions are not full results.
 */
import type { Guideline } from '../../data/guidelines-data';
import { searchGuidelines, type SearchResult } from './engine';

export interface CatalogueSearchOutcome {
  /** Guidelines to display, in rank order (or catalogue order when the query is empty). */
  ordered: Guideline[];
  /** Per-id ranking explanation; empty when the query is empty. */
  explanations: ReadonlyMap<string, SearchResult>;
  /** True when a non-empty query produced no results. */
  noResults: boolean;
}

export function applySearchToCatalogue(guidelines: readonly Guideline[], query: string): CatalogueSearchOutcome {
  const visible = guidelines.filter(g=>!g.archived);
  if (query.trim() === '') {
    return { ordered: visible, explanations: new Map(), noResults: false };
  }
  const results = searchGuidelines(visible, query, {minCoverage:1,allowRelated:false});
  const explanations = new Map<string, SearchResult>();
  const ordered: Guideline[] = [];
  for (const r of results) {
    explanations.set(r.id, r);
    ordered.push(r.record as Guideline);
  }
  return { ordered, explanations, noResults: ordered.length === 0 };
}
