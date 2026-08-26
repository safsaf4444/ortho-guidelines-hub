/**
 * Pure validation gate for a magic-link sign-in request.
 *
 * Split out of src/lib/auth.ts specifically so it has no dependency on
 * src/lib/supabase.ts (which reads `import.meta.env` at module load time —
 * a Vite-only global that doesn't exist under a plain Node/tsx run). This
 * lets scripts/tests/auth-editor.test.ts exercise the exact validation logic
 * requestMagicLink runs before it ever touches the network, offline.
 */
export function prepareMagicLinkRequest(
  email: string,
  supabaseConfigured: boolean
): { ok: true; email: string } | { ok: false; error: string } {
  if (!supabaseConfigured) {
    return { ok: false, error: 'Sign-in is unavailable — the live database is not configured.' };
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter an email address.' };
  }
  return { ok: true, email: trimmed };
}
