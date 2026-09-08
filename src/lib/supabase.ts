import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://xutjahmbyrvifcltpxxu.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_MdOTKiEJr1RMUuMEY2lJNQ_Lhggiv3M';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY;

/**
 * Local-editor mode.
 *
 * __LOCAL_EDITOR_KEY__ is substituted at bundle time by vite.config.ts: the
 * service-role key from .env.local under `vite dev`, and the empty string in
 * every build. So this constant is true only when the hub is running locally
 * on an editor's own machine, and is hardcoded false in the deployed site.
 *
 * When true, the client below is created with the service-role key, which
 * bypasses RLS — that is how editing works without any sign-in, account or
 * allowlist. It also means the SERVER-SIDE security posture is unchanged by
 * this feature: `guidelines` still has exactly one policy
 * (guidelines_public_read) and no write policy at all, so the public site and
 * the public anon key remain read-only, permanently and by construction.
 *
 * The trade this makes: anyone with a checkout AND the service-role key in
 * their own .env.local can edit. That file is gitignored, the key is never
 * passed to GitHub Actions (see .github/workflows/deploy.yml), and it never
 * enters a built bundle — but it is a real key on a real machine, so treat it
 * the way SECURITY.md already describes for scripts/*.ts.
 */
export const LOCAL_EDITOR_MODE: boolean = __LOCAL_EDITOR_KEY__.length > 0;

const key = LOCAL_EDITOR_MODE ? __LOCAL_EDITOR_KEY__ : anonKey;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // The service-role key is not a user session and must never be
        // persisted to localStorage or refreshed as one. Harmless for the
        // anon key too — this app has no sign-in of any kind any more.
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isSupabaseEnabled = supabase !== null;
