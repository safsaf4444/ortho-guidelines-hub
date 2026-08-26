/**
 * The single source of truth for "can this browser tab write right now?" —
 * used by both the UI (hide/disable controls) and the actual write handlers
 * in App.tsx (refuse to call Supabase), so the two can never disagree.
 *
 * Two independent conditions, both required:
 *   - WRITES_ENABLED: a hardcoded build-time kill switch (see App.tsx).
 *   - isEditor: the signed-in user's id is in the explicit editor allowlist.
 *
 * Neither this function nor its callers are the real security boundary —
 * Supabase RLS is (see supabase-migration-add-editor-writes-and-changelog.sql,
 * prepared but not run). This is the UI/app-layer convenience gate that
 * avoids showing or attempting a write that would fail server-side anyway.
 */
export function canWrite(writesEnabled: boolean, isEditor: boolean): boolean {
  return writesEnabled && isEditor;
}

/**
 * Human-readable reason writes are unavailable, or null when they're not
 * blocked. Distinguishes the two failure modes so the UI can explain the
 * right one instead of a generic "not allowed" or a raw Supabase error.
 */
export function writeBlockedReason(writesEnabled: boolean, isEditor: boolean): string | null {
  if (canWrite(writesEnabled, isEditor)) return null;
  if (!writesEnabled) return 'Read-only mode — publication is disabled.';
  return 'Sign in as an approved editor to save changes.';
}
