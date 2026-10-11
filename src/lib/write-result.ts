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

// ─── Did the write fail, or do we simply not know? ──────────────────────────
/**
 * These are NOT the same thing, and conflating them is how a UI comes to lie.
 *
 * A PostgREST error code is a decision the server reached and reported: the
 * request arrived, Postgres refused it, nothing was committed. Saying "nothing
 * was saved" there is a fact.
 *
 * A dropped connection, a timeout or an aborted request is an ABSENCE of an
 * answer. The server may never have seen the request — or may have committed it
 * and lost the response on the way back. Those are indistinguishable from the
 * client, so "nothing was saved" is a guess, and in the committed-then-lost
 * case it is wrong in the most damaging direction: the editor is told their
 * change did not land, retries, and writes it twice.
 *
 * So the classification is deliberately asymmetric. 'refused' requires positive
 * evidence of a server decision; everything else is 'unconfirmed'. When in
 * doubt the honest answer is "I don't know", and the user is told to look.
 */
export type WriteFailure = 'refused' | 'unconfirmed';

/** Marks an Error as a confirmed server-side refusal. */
export function markRefused<E extends Error>(error: E): E {
  (error as E & { writeOutcome?: WriteFailure }).writeOutcome = 'refused';
  return error;
}

/**
 * A Postgres SQLSTATE (five alphanumerics, e.g. 42501, 23505) or a PostgREST
 * code (PGRST…). Both mean the server answered.
 *
 * supabase-js turns a network failure into an error object too, but with an
 * EMPTY code and a `FetchError:`/`TypeError` message — which is exactly why
 * presence of a real code is the test, rather than presence of an error.
 */
function looksLikeServerCode(code: unknown): boolean {
  if (typeof code !== 'string' || code === '') return false;
  return /^[0-9A-Za-z]{5}$/.test(code) || code.startsWith('PGRST');
}

export function classifyWriteFailure(err: unknown): WriteFailure {
  if (err && typeof err === 'object') {
    const e = err as { writeOutcome?: unknown; code?: unknown };
    if (e.writeOutcome === 'refused') return 'refused';
    if (looksLikeServerCode(e.code)) return 'refused';
  }
  return 'unconfirmed';
}

/**
 * Shown when the outcome is unknown. Wording is deliberate and should not be
 * softened into a claim either way: it reports what happened (no confirmation),
 * what is safe (the draft), and what to do (look before retrying).
 */
export const UNCONFIRMED_SAVE_MESSAGE =
  'Save could not be confirmed. Your draft is preserved. Check the stored entry before retrying.';

/**
 * SQLSTATE raised by approve_staged_guideline() for a candidate that is no
 * longer `pending` — `object_not_in_prerequisite_state`.
 *
 * This is a REFUSAL with a specific meaning, and the distinction matters for
 * what the user is told. An ordinary refusal rolled everything back, so the
 * candidate is still pending and retrying is correct. This one means the
 * opposite: the candidate was already processed, so the work is DONE and
 * retrying would be pointless. Telling the editor to retry here would be
 * wrong, and is exactly what the previous blanket message did.
 */
export const ALREADY_PROCESSED_CODE = '55000';

export function isAlreadyProcessedWrite(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; alreadyProcessed?: unknown };
  return e.alreadyProcessed === true || e.code === ALREADY_PROCESSED_CODE;
}

/** Marks an Error as "the target was already processed". Implies refused. */
export function markAlreadyProcessed<E extends Error>(error: E): E {
  (error as E & { alreadyProcessed?: boolean }).alreadyProcessed = true;
  return markRefused(error);
}

// ─── Multi-step writes ──────────────────────────────────────────────────────
/**
 * Which steps of a multi-step write are known to have landed.
 *
 * The duplicate merge is two separate requests — update the canonical row, then
 * archive the loser — and they are NOT atomic. Its failure message used to say
 * "no changes were made", which is false whenever the first step succeeded and
 * the second did not: the catalogue is then left mid-merge, with the merged
 * content saved and the duplicate still live. Reporting that as "nothing
 * happened" sends the editor looking for a problem that is actually a
 * half-finished job in the opposite direction.
 *
 * So progress is tracked explicitly and reported, rather than inferred from
 * which exception came out.
 */
export interface MergeProgress {
  /** The canonical row's merged content is confirmed saved. */
  mergedSaved: boolean;
  /** The duplicate row is confirmed archived. */
  duplicateArchived: boolean;
}

/**
 * Human description of how far a merge got. Never claims more or less than the
 * flags say.
 */
export function describeMergeProgress(p: MergeProgress): string {
  if (p.mergedSaved && p.duplicateArchived) return 'Both steps completed.';
  if (p.mergedSaved) return 'Step 1 of 2 completed: the merged content was saved.';
  return 'No step completed: the catalogue is unchanged.';
}
