/**
 * Pure changelog load-state types and classification.
 *
 * Deliberately free of browser dependencies (no Supabase client, no
 * import.meta.env) so it can be imported by offline tsx tests as well as by
 * the browser service — the same split guidelines-mapper.ts uses.
 */

export type ChangelogEntry = {
  id: string;
  guidelineId: string;
  description: string;
  createdAt: string; // ISO timestamp
};

/**
 * A load result that distinguishes the three genuinely different outcomes.
 * Previously all three collapsed to `[]`, so a hard query failure was shown to
 * the user as "no entries yet" — a real error masquerading as an empty state.
 *
 *   ok          — the query succeeded; `entries` may legitimately be empty
 *   unavailable — the feature is not provisioned (static mode, or the
 *                 guideline_changelog table does not exist yet). Expected, not
 *                 a fault: there is nothing to retry.
 *   error       — a genuine fetch/query failure. Worth surfacing and retrying.
 */
export type ChangelogLoad =
  | { ok: true; entries: ChangelogEntry[] }
  | { ok: false; reason: 'unavailable'; message: string }
  | { ok: false; reason: 'error'; message: string };

export const STATIC_MODE_MESSAGE =
  'The live database isn’t connected, so the changelog is unavailable in static mode.';

export const NO_TABLE_MESSAGE =
  'The changelog isn’t available yet — it hasn’t been set up on the database.';

/**
 * PostgREST reports a missing table as PGRST205 ("Could not find the table …
 * in the schema cache"); the underlying Postgres code is 42P01
 * (undefined_table). Either way the feature simply has not been provisioned,
 * which is a different thing from the query failing.
 *
 * Note 42P01 is undefined_TABLE; 42703 is undefined_COLUMN and is a real error.
 */
export function isMissingTableError(code?: string, message?: string): boolean {
  if (code === 'PGRST205' || code === '42P01') return true;
  return /could not find the table|relation .* does not exist/i.test(message ?? '');
}
