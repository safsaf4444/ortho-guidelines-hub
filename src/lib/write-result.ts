/**
 * Deciding whether a Supabase write actually changed anything.
 *
 * Lives in its own browser-dependency-free module, like src/lib/changelog-load.ts,
 * so the offline test suite can import it without pulling in the Supabase
 * client (which reads `import.meta.env` and cannot be loaded under tsx).
 *
 * ── WHY THIS IS NOT A ONE-LINER WORTH INLINING ──────────────────────────────
 * A blocked INSERT returns PostgREST error 42501. A blocked UPDATE returns
 * NOTHING: Row Level Security filters the row out of the statement's scope, so
 * the update succeeds against zero rows and reports no error at all.
 *
 * Taken at face value that tells an editor their clinical edit was saved when
 * the database discarded it. Counting affected rows is the only way to tell
 * "updated" from "silently refused", so every UPDATE path must do it, and the
 * decision is kept here where it can be tested rather than repeated inline.
 */

/**
 * True when a write returned successfully but changed no rows.
 *
 * Call with the result of `.select('id')` on an update. `null` (PostgREST
 * returning no body) counts as zero — the caller cannot prove anything changed,
 * and for a write that is the same problem as proving nothing did.
 */
export function isZeroRowWrite(data: unknown[] | null | undefined): boolean {
  return !data || data.length === 0;
}

/**
 * Message for a write that returned no error and changed nothing.
 *
 * Names both possible causes rather than guessing. The client genuinely cannot
 * tell them apart — RLS does not report that it filtered a row — and naming
 * the likely one first is more useful than a bare "0 rows affected".
 */
export function refusedOrMissingMessage(op: string, id: string): string {
  return (
    `${op} affected no rows for "${id}". Either the database refused the write `
    + '(the signed-in account is not on the editor allowlist, or the session expired) '
    + 'or that entry no longer exists. Nothing was saved.'
  );
}
