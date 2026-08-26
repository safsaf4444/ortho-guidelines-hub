/**
 * Explicit editor allowlist for the magic-link write path.
 *
 * Deliberately NOT "any signed-in user is an editor" — Supabase magic-link
 * sign-in has no admin approval step, so anyone who can type an email address
 * can obtain a valid session. Editor status is a separate check against a
 * fixed set of Auth user UUIDs, mirrored server-side by the RLS policies in
 * supabase-migration-add-editor-writes-and-changelog.sql (prepared, not run).
 *
 * Configured via VITE_EDITOR_UUIDS, a comma-separated list of Auth user UUIDs
 * — public build configuration, not a secret (see SECURITY.md). Unset or
 * empty falls back to a placeholder that is not a valid UUID and so can never
 * match a real signed-in user: fails closed, not open.
 */

const PLACEHOLDER_EDITOR_UUID = 'REPLACE-WITH-EDITOR-UUID';

function parseAllowlist(raw: string | undefined): string[] {
  const ids = (raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : [PLACEHOLDER_EDITOR_UUID];
}

// Optional chaining on `import.meta.env` is deliberate: it's a Vite-only
// global, undefined under a plain Node/tsx run (e.g. scripts/tests/*), and
// this module must stay importable there so its logic is offline-testable.
export const EDITOR_UUID_ALLOWLIST: readonly string[] = parseAllowlist(
  import.meta.env?.VITE_EDITOR_UUIDS as string | undefined
);

/** True only when every entry is still the unconfigured placeholder. */
export function isAllowlistConfigured(allowlist: readonly string[] = EDITOR_UUID_ALLOWLIST): boolean {
  return allowlist.some(id => id !== PLACEHOLDER_EDITOR_UUID);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a signed-in user's id is an approved editor.
 *
 * Pure — takes the allowlist as a parameter (defaulting to the build-time
 * one) so it's testable without env-var juggling.
 *
 * Requires `userId` to actually look like a UUID, not just to literal-match
 * an allowlist entry. A real Supabase `auth.uid()` always is one, so this
 * changes nothing in practice — it exists so the unconfigured placeholder
 * (not a valid UUID, by design) can never match, even in a hypothetical
 * caller that passed the placeholder string itself as a "userId".
 */
export function isEditorUuid(
  userId: string | null | undefined,
  allowlist: readonly string[] = EDITOR_UUID_ALLOWLIST
): boolean {
  if (!userId) return false;
  if (!UUID_RE.test(userId)) return false;
  return allowlist.includes(userId);
}
