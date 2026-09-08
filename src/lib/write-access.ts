/**
 * The single source of truth for "can this browser tab write right now?" —
 * used by both the UI (hide/disable controls) and the actual write handlers
 * in App.tsx (refuse to call Supabase), so the two can never disagree.
 *
 * Two independent conditions, both required:
 *   - writesEnabled:  a hardcoded build-time kill switch (see App.tsx).
 *   - localEditorMode: this bundle was served by `vite dev` with a
 *     service-role key present, i.e. the hub is running locally on an
 *     editor's machine (see src/lib/supabase.ts).
 *
 * There is no sign-in, no account and no editor allowlist: editing is a
 * local-only capability, and the deployed public site has
 * localEditorMode === false baked in at build time.
 *
 * Neither this function nor its callers are the real boundary. The real
 * boundary is that the deployed bundle only ever holds the public anon key,
 * and `guidelines` has no write policy for it — so a public visitor cannot
 * write even by calling the API directly with devtools open. This is the
 * UI/app-layer gate that avoids showing a control that would fail anyway.
 */
export function canWrite(writesEnabled: boolean, localEditorMode: boolean): boolean {
  return writesEnabled && localEditorMode;
}

/**
 * Human-readable reason writes are unavailable, or null when they're not
 * blocked. Distinguishes the two failure modes so the UI can explain the
 * right one instead of a generic "not allowed" or a raw Supabase error.
 */
export function writeBlockedReason(writesEnabled: boolean, localEditorMode: boolean): string | null {
  if (canWrite(writesEnabled, localEditorMode)) return null;
  if (!writesEnabled) return 'Read-only mode — publication is disabled.';
  return 'Editing is available only when running the hub locally.';
}
