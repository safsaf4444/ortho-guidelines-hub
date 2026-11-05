/**
 * src/lib/search/index.ts
 * ───────────────────────
 * Public surface of the search module. Pure TypeScript, no React, no
 * network, no new dependencies.
 */
export {
  buildSearchIndex,
  searchIndex,
  searchGuidelines,
  analyseQuery,
  FIELD_WEIGHTS,
  STATUS_ADJUSTMENTS,
} from './engine';
export type {
  SearchableRecord,
  SearchIndex,
  SearchResult,
  SearchOptions,
  MatchDetail,
  MatchVia,
  SearchField,
  StatusNote,
  PhraseMatch,
  QueryGroup,
} from './engine';
export { TERMINOLOGY, terminologyEntry } from './terminology';
export type { TermEntry } from './terminology';
export { normaliseText, tokenise, tokeniseDetailed, tokenSet, singularise, editDistance, typoAllowance, SEARCH_STOPWORDS } from './normalise';
export type { DetailedToken } from './normalise';
export { legacySubstringSearch } from './legacy';
export { applySearchToCatalogue } from './app-adapter';
export type { CatalogueSearchOutcome } from './app-adapter';
