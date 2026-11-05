/**
 * scripts/lib/status-wording.ts
 * ─────────────────────────────
 * One rule for "does this publisher text declare an archived / withdrawn /
 * superseded / replaced / retired status", shared by the coverage-gap tool
 * and index-diff monitoring so they cannot drift.
 *
 * Negation is respected: "Not withdrawn: current guidance", "no longer
 * archived", "unarchived", "never superseded" declare nothing. The guard is
 * deliberately narrow — a negation word within the three words before the
 * status word — because anything looser starts parsing English. Review wording
 * such as "withdrawn recommendations" is still a declaration (the publisher
 * withdrew something), which is what a reviewer should see.
 */
const STATUS_WORD = /\b(archived|withdrawn|superseded|replaced|retired)\b/gi;
const NEGATION = /\b(?:not|no longer|never|isn't|is not|was not|wasn't)(?:\s+[a-z'-]+){0,2}\s*$|\bun[-\s]*$/i;

/** The status word found, or null when none (or only negated ones) is present. */
export function declaredStatusWording(text: string | undefined | null): string | null {
  if (!text) return null;
  text = text.replace(/[‘’]/g,"'");
  for (const m of text.matchAll(STATUS_WORD)) {
    const before = text.slice(Math.max(0, m.index! - 80), m.index!).split(/[.!?;:,\n]/).pop() ?? '';
    // "un" glued to the word (unarchived) or a negation in the preceding words.
    const glued = /\bun$/i.test(text.slice(Math.max(0, m.index! - 2), m.index!));
    if (glued || NEGATION.test(before)) continue;
    return m[1];
  }
  return null;
}

export function hasDeclaredStatus(text: string | undefined | null): boolean {
  return declaredStatusWording(text) !== null;
}
