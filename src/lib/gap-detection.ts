import type { Guideline } from '../data/guidelines-data';

/**
 * A search term only shows as a "known gap" (rather than a generic
 * zero-result) when an editor has already written that down in a guideline's
 * notes field — never inferred or asserted here. As of 2026-09, the only
 * entry in the dataset carrying this language is the SCFE row (source-noted
 * "no UK consensus guideline exists for acute SCFE presentation"), matched
 * because the query is literally a substring of that note. A term with no
 * such editorial note (e.g. a topic that simply has no entry) correctly falls
 * through to the generic message — this deliberately does NOT hardcode a list
 * of "confirmed gap" topics, since that would assert a clinical fact ("no
 * guidance exists for X") this codebase has no source for.
 */
export const GAP_NOTE_PATTERN = /no uk consensus|no current uk guidance|\bno uk guidance\b|gaps register|no national guidance/i;

export function findGapNote(query: string, guidelines: readonly Guideline[]): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const g of guidelines) {
    const notes = g.notes ?? '';
    if (GAP_NOTE_PATTERN.test(notes) && notes.toLowerCase().includes(q)) {
      return notes;
    }
  }
  return null;
}
