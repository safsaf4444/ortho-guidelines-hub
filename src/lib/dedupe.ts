/**
 * Editorial merge: combines a duplicate record into a chosen canonical
 * record without losing information. Pure function — the caller decides
 * whether/when to persist the result and delete the duplicate.
 */
import type { Guideline, GuidelineVersion } from '../data/guidelines-data';
import { normalizeUrl } from './duplicate-detection';

export function mergeVersions(canonical: GuidelineVersion[], other: GuidelineVersion[]): GuidelineVersion[] {
  const seen = new Set(
    canonical.map(v => normalizeUrl(v.url)).filter((u): u is string => u !== null)
  );
  const merged = [...canonical];
  for (const v of other) {
    const key = normalizeUrl(v.url);
    if (key === null || !seen.has(key)) {
      merged.push(v);
      if (key !== null) seen.add(key);
    }
  }
  return merged;
}

function mergeCrossListedIn(canonical: Guideline, other: Guideline): string[] | undefined {
  const others = new Set<string>([
    ...(canonical.crossListedIn ?? []),
    other.section,
    ...(other.crossListedIn ?? []),
  ]);
  others.delete(canonical.section);
  return others.size > 0 ? [...others] : undefined;
}

function mergeText(canonical?: string, other?: string): string | undefined {
  const c = canonical?.trim();
  const o = other?.trim();
  if (!o) return c || undefined;
  if (!c) return o;
  if (c === o) return c;
  return `${c}\n\n${o}`;
}

function preferNonEmpty(a: string, b: string): string {
  return a.trim() ? a : b;
}

function laterDate(a?: string, b?: string): string | undefined {
  return [a, b].filter(Boolean).sort().slice(-1)[0];
}

/** Combines `duplicate` into `canonical`. Returns the merged record (same id as canonical). */
export function computeMerge(canonical: Guideline, duplicate: Guideline): Guideline {
  return {
    ...canonical,
    versions: mergeVersions(canonical.versions, duplicate.versions),
    crossListedIn: mergeCrossListedIn(canonical, duplicate),
    notes: mergeText(canonical.notes, duplicate.notes),
    summary: preferNonEmpty(canonical.summary, duplicate.summary),
    regionalVariation: canonical.regionalVariation || duplicate.regionalVariation,
    localOverlayNeeded: canonical.localOverlayNeeded || duplicate.localOverlayNeeded,
    lastChecked: laterDate(canonical.lastChecked, duplicate.lastChecked) ?? canonical.lastChecked,
    priority: canonical.priority ?? duplicate.priority,
    sourceAccessStatus: canonical.sourceAccessStatus ?? duplicate.sourceAccessStatus,
    linkVerificationStatus:
      canonical.linkVerificationStatus && canonical.linkVerificationStatus !== 'unchecked'
        ? canonical.linkVerificationStatus
        : duplicate.linkVerificationStatus ?? canonical.linkVerificationStatus,
    linkLastVerified: canonical.linkLastVerified ?? duplicate.linkLastVerified,
    linkVerificationNotes: mergeText(canonical.linkVerificationNotes, duplicate.linkVerificationNotes),
  };
}
