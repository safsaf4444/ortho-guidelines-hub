/**
 * The single source of truth for "can this browser tab write right now?" —
 * used by both the UI (hide/disable controls) and the actual write handlers
 * in App.tsx (refuse to call Supabase), so the two can never disagree.
 *
 * Two independent conditions, both required:
 *   - writesEnabled:   a hardcoded build-time kill switch (see App.tsx). The
 *     one remaining way to turn editing off everywhere without a DB change.
 *   - supabaseEnabled: a live database is actually configured. In static
 *     fallback mode `supabase` is null and every write would throw, so there
 *     is no point offering the control.
 *
 * NOTE: neither condition is an access control any more, and this module is
 * NOT a security boundary. Write permission is granted publicly at the
 * database layer — `guidelines` carries insert/update/delete RLS policies for
 * the anon role — so any visitor to the deployed site can edit, and could do
 * so with curl even if this gate returned false. See SECURITY.md.
 *
 * This is now purely a UI-consistency gate: it decides whether to *show* the
 * controls, not who is *allowed* to use them.
 */
export function canWrite(writesEnabled: boolean, supabaseEnabled: boolean): boolean {
  return writesEnabled && supabaseEnabled;
}

/**
 * Human-readable reason writes are unavailable, or null when they're not
 * blocked. Distinguishes the two failure modes so the UI can explain the
 * right one instead of a generic "not allowed" or a raw Supabase error.
 */
export function writeBlockedReason(writesEnabled: boolean, supabaseEnabled: boolean): string | null {
  if (canWrite(writesEnabled, supabaseEnabled)) return null;
  if (!writesEnabled) return 'Read-only mode — publication is disabled.';
  return 'Editing needs the live database — not available in offline/static mode.';
}
