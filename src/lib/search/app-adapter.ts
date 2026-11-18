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
import { normaliseText } from './normalise';
import type { Guideline } from '../../data/guidelines-data';
import { analyseQuery, searchGuidelines, type SearchResult } from './engine';

export interface CatalogueSearchOutcome {
  /** Guidelines to display, in rank order (or catalogue order when the query is empty). */
  ordered: Guideline[];
  /** Per-id ranking explanation; empty when the query is empty. */
  explanations: ReadonlyMap<string, SearchResult>;
  /** True when a non-empty query produced no results. */
  noResults: boolean;
  /** Present only for an explicitly disclosed, qualifier-relaxed fallback. */
  notice?: string;
}

/** Use the same parsed token boundaries as retrieval, including punctuation. */
export function rankSearchGroups(query: string): boolean {
  const groups = analyseQuery(query);
  return groups.length === 1 && groups[0].tokens.length === 1
    && ['thr','tha','tkr','tka'].includes(groups[0].tokens[0]);
}

export function applySearchToCatalogue(guidelines: readonly Guideline[], query: string): CatalogueSearchOutcome {
  const visible = guidelines.filter(g=>!g.archived);
  if (query.trim() === '') {
    return { ordered: visible, explanations: new Map(), noResults: false };
  }
  let results = searchGuidelines(visible, query, {minCoverage:1,allowRelated:false});
  let notice: string | undefined;
  // Do not relax arbitrary unknown or diagnostic terms. This narrow fallback
  // handles a standalone painful qualifier in a prosthesis query without treating
  // pain as infection, loosening, fracture or any other diagnosis.
  const groups = analyseQuery(query);
  const qualifiers = groups.filter(group => group.tokens.length === 1 && group.tokens[0] === 'painful');
  const reducedQuery = qualifiers.length === 1
    ? groups.filter(group => group !== qualifiers[0]).map(group => group.text).join(' ')
    : undefined;
  if (results.length === 0 && reducedQuery && !/\b(?:not|no|without|except|excluding|exclude|denies)\b/.test(normaliseText(query)) && analyseQuery(reducedQuery).some(group =>
    group.alternatives.some(alternative => alternative.entryId === 'thr' || alternative.entryId === 'tkr'))) {
    const coreIds = new Set(searchGuidelines(visible, reducedQuery, {minCoverage:1,allowRelated:false}).map(result => result.id));
    if (coreIds.size) {
      // Keep all query concepts in partial explanations, rather than claiming
      // that the missing qualifier was found. Every other constraint must
      // still match the reduced query in full, and related-only hits stay out.
      results = searchGuidelines(visible, 'painful ' + reducedQuery, {minCoverage:0.5,allowRelated:false})
        .filter(result => coreIds.has(result.id));
      if (results.length) notice = 'Partial matches: “painful” was not matched. Results match “'
        + reducedQuery + '”. Check each source guidance.';
    }
  }
  const explanations = new Map<string, SearchResult>();
  const ordered: Guideline[] = [];
  for (const r of results) {
    explanations.set(r.id, r);
    ordered.push(r.record as Guideline);
  }
  return { ordered, explanations, noResults: ordered.length === 0, ...(notice ? {notice} : {}) };
}
