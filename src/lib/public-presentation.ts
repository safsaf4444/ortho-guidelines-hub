import type { Guideline } from '../data/guidelines-data';

/** Presentation only: never re-score or re-filter Search V2 results. */
export function uniqueRankedResults(records: readonly Guideline[]): Guideline[] {
  const seen = new Set<string>();
  return records.filter(record => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export const SECTION_ORDER = [
  'Emergencies', 'Trauma', 'Elective', 'Bone Health', 'Hand & Wrist',
  'Shoulder & Elbow', 'Hip', 'Knee', 'Foot & Ankle', 'Spine', 'Paediatrics',
  'Infection & Tumour', 'Rehabilitation', 'Imaging', 'Older Adult',
  'Limb Reconstruction', 'Sports Injuries', 'Service & Commissioning',
  'Quick Reference', 'Local Overlay',
];
export function sortSections(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a), bi = SECTION_ORDER.indexOf(b);
    return (ai < 0 ? SECTION_ORDER.length : ai) - (bi < 0 ? SECTION_ORDER.length : bi)
      || a.localeCompare(b, 'en');
  });
}
export function associatedSections(record: Guideline): string[] {
  return sortSections([...new Set([record.section, ...(record.crossListedIn ?? [])])]);
}
/** Do not offer a primary shortcut for an unsafe URL or a recorded failed/retired source. */
export function primarySourceShortcut(record: Guideline): string | undefined {
  const url = record.versions[0]?.url;
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  if (['broken', 'withdrawn', 'superseded'].includes(record.linkVerificationStatus ?? '')) return undefined;
  return url;
}
export function linkCheckContext(record: Guideline): string {
  return `Recorded link check: ${record.linkLastVerified || 'date not recorded'}. Applies to the entry; individual versions may not have been checked. Not a clinical review or confirmation of current guidance.`;
}

/** Qualify legacy free-text edition labels without changing stored metadata. */
export function editionLabel(label?: string): string | undefined {
  return label?.trim().toLowerCase() === 'current' ? 'Recorded as current (currency unconfirmed)' : label;
}
