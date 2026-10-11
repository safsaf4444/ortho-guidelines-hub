/**
 * The single source of truth for "can this browser tab write right now?" —
 * used by both the UI (hide/disable controls) and the actual write handlers
 * in App.tsx (refuse to call Supabase), so the two can never disagree.
 *
 * ── This module is no longer the only thing standing between a visitor and
 * the data ─────────────────────────────────────────────────────────────────
 * It used to say, in this spot, that it was NOT a security boundary — because
 * write permission was granted publicly at the database layer and any visitor
 * could edit with curl regardless of what this returned.
 *
 * That is no longer true. As of
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql, writes to
 * `guidelines` and `guideline_changelog` are gated by RLS on
 * `public.is_editor()` — a hardcoded allowlist of editor account UUIDs. A
 * request with no session, or a session for any other account, is refused by
 * Postgres.
 *
 * So the enforcement now lives in the database, where it belongs, and this
 * module's job is to PREDICT that answer accurately enough that the UI never
 * offers a control the database would reject. Getting it wrong is a UX bug,
 * not a security hole — which is the right way round.
 *
 * One honest limit: `signedIn` says a session exists, not that the account is
 * on the allowlist. The client deliberately does not mirror those UUIDs (see
 * src/lib/editor-session.ts), so a signed-in non-editor is shown the controls
 * and gets a clear refusal from the database on save.
 */

/** The three independent conditions a write depends on. */
export interface WriteGate {
  /**
   * A hardcoded build-time kill switch (see App.tsx). The one remaining way to
   * turn editing off in the deployed bundle without touching the database.
   */
  writesEnabled: boolean;
  /**
   * A live database is actually configured. In static fallback mode `supabase`
   * is null and every write would throw, so there is no point offering the
   * control.
   */
  dbAvailable: boolean;
  /**
   * An editor session exists. Required because every write policy calls
   * `auth.uid()`; with no session the database refuses the write.
   */
  signedIn: boolean;
}

export function canWrite(gate: WriteGate): boolean {
  return gate.writesEnabled && gate.dbAvailable && gate.signedIn;
}

/**
 * Human-readable reason writes are unavailable, or null when they're not
 * blocked. Distinguishes the three failure modes so the UI can explain the
 * right one instead of a generic "not allowed" or a raw Supabase error.
 *
 * Order matters: the kill switch is checked first because it overrides
 * everything, and "sign in" is only worth suggesting once there is a database
 * to sign in to — telling an offline reader to sign in would send them after a
 * fix that cannot work.
 */
export function writeBlockedReason(gate: WriteGate): string | null {
  if (canWrite(gate)) return null;
  if (!gate.writesEnabled) return 'Read-only mode — publication is disabled.';
  if (!gate.dbAvailable) return 'Editing needs the live database — not available in offline/static mode.';
  return 'Sign in as an editor to make changes. Reading needs no account.';
}
