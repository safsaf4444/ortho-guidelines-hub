import type { Guideline } from '../data/guidelines-data';
import { canonicalProvider } from './providers';
import { associatedSections } from './public-presentation';

/** Presentation facet intersection only; retains Search V2 order and scoring. */
export function filterPresentation(records: readonly Guideline[], publisher: string, specialty: string): Guideline[] {
  return records.filter(g => (publisher === 'All' || canonicalProvider(g.source) === publisher)
    && (specialty === 'All' || associatedSections(g).includes(specialty)));
}
