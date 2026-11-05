import type { Guideline } from '../data/guidelines-data';
import { applySearchToCatalogue } from './search/app-adapter';

/**
 * The browse view's filter, as a pure function so it can be tested offline.
 *
 * Preserve section/link filters and the accessible UI contract; delegate
 * ranked, full-concept search to V2. Archived flags remain excluded. Clinical
 * status labels are not changed or inferred by retrieval.
 */
export interface GuidelineFilter {
  section: string;      // 'All' or a section name
  linkStatus: string;   // 'All' or a linkVerificationStatus value
  query: string;
}

export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function filterGuidelines(guidelines: Guideline[], f: GuidelineFilter): Guideline[] {
  const scoped = guidelines.filter(g => {
    if (f.section !== 'All' && g.section !== f.section) return false;
    if (f.linkStatus !== 'All' && (g.linkVerificationStatus ?? 'unchecked') !== f.linkStatus) return false;
    return true;
  });
  return applySearchToCatalogue(scoped,normaliseQuery(f.query)).ordered;
}

export function hasActiveFilters(f: GuidelineFilter): boolean {
  return normaliseQuery(f.query) !== '' || f.linkStatus !== 'All' || f.section !== 'All';
}

/** Plain-language result count for the live region and the filter row. */
export function resultCountText(shown: number, total: number): string {
  if (shown === total) return `${total} guideline${total === 1 ? '' : 's'}`;
  return `${shown} of ${total} guideline${total === 1 ? '' : 's'} match`;
}

/**
 * The empty-result message. Names what is narrowing the list, so "No results"
 * never reads as "the hub has nothing" when a forgotten filter is the cause.
 */
export function emptyResultText(f: GuidelineFilter, linkStatusLabel: (s: string) => string): string {
  const q = f.query.trim();
  const parts: string[] = [];
  if (q) parts.push(`“${q}”`);
  if (f.linkStatus !== 'All') parts.push(`link check “${linkStatusLabel(f.linkStatus)}”`);
  if (f.section !== 'All') parts.push(`section “${f.section}”`);
  return parts.length
    ? `No guidelines match ${parts.join(', ')}.`
    : 'No guidelines to show.';
}

/** Attributes every link that opens a new tab must carry. */
export const NEW_TAB_REL = 'noopener noreferrer';
