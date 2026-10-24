/**
 * Recognising "this database does not have the review-queue upgrade yet".
 *
 * Dependency-free (like write-result.ts) so the offline suite can test it.
 *
 * The frontend can be deployed before supabase/migrations/20261024_… and
 * 20261025_… are applied (a merge to main redeploys it). Against such a
 * database the new queue features must say "unavailable" — never render an
 * empty queue, and never report an action as done.
 *
 * Deliberately NARROW: an error counts as "missing schema" only when its code
 * says so AND it names one of the specific objects this feature needs. Any other
 * failure — permissions, a network drop, a bug, a different missing object —
 * is reported as the error it is, not disguised as a compatibility gap.
 */

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export type SchemaObjectKind = 'table' | 'column' | 'function';

function codesFor(kind: SchemaObjectKind): Set<string> {
  return kind === 'table' ? MISSING_TABLE_CODES : kind === 'column' ? MISSING_COLUMN_CODES : MISSING_FUNCTION_CODES;
}

/** True only when `err` reports that one of `names` (of this kind) does not exist. */
export function isMissingSchemaObject(err: unknown, kind: SchemaObjectKind, names: readonly string[]): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  if (typeof e.code !== 'string' || !codesFor(kind).has(e.code)) return false;
  const text = [e.message, e.details, e.hint].filter((x) => typeof x === 'string').join(' ');
  return names.some((n) => text.includes(n));
}

/** Columns added to staged_guidelines by 20261024 that the queue view depends on. */
export const QUEUE_UPGRADE_COLUMNS = ['review_outcome', 'producer', 'changed_url', 'identity_key'] as const;

export const QUEUE_UPGRADE_UNAVAILABLE_MESSAGE =
  'Feature unavailable: this database does not have the review-queue upgrade '
  + '(supabase/migrations/20261024_discovery_review_queue.sql) applied, so the queue cannot be shown '
  + 'safely. Nothing was changed.';

export const REJECT_OPEN_UNAVAILABLE_MESSAGE =
  'Feature unavailable: rejecting a deferred item, or confirming the closure of an open follow-up, needs '
  + 'supabase/migrations/20261025_reject_open_candidate.sql, which this database does not have. Nothing was changed.';

export const RESOLVE_UNAVAILABLE_MESSAGE =
  'Feature unavailable: recording a comparison/edition decision needs the review-queue upgrade, which this '
  + 'database does not have. Nothing was changed.';

export const HISTORY_UNAVAILABLE_MESSAGE =
  'Feature unavailable: evidence and decision history need the review-queue upgrade, which this database '
  + 'does not have.';

/** Marks an Error as "this feature is not available on this database". Nothing was written. */
export function markFeatureUnavailable<E extends Error>(error: E): E {
  (error as E & { featureUnavailable?: boolean; writeOutcome?: string }).featureUnavailable = true;
  // The server answered (it said the function does not exist), so nothing was written.
  (error as E & { writeOutcome?: string }).writeOutcome = 'refused';
  return error;
}

export function isFeatureUnavailable(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { featureUnavailable?: unknown }).featureUnavailable === true);
}
