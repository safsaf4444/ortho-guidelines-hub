import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://xutjahmbyrvifcltpxxu.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_MdOTKiEJr1RMUuMEY2lJNQ_Lhggiv3M';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY;

/**
 * The one and only Supabase client, built from the PUBLIC anon key.
 *
 * There is no second, privileged client and no build-time key injection: the
 * former local-editor mode (a service-role key injected for `vite dev` only)
 * has been removed. Reads AND writes now go through this same anon client
 * everywhere — local dev, preview, and the deployed site alike — because write
 * permission is granted at the database layer by RLS, not by holding a secret.
 *
 * See supabase-migration-public-write-access.sql and SECURITY.md: `guidelines`
 * now carries public insert/update/delete policies for the `anon` role, so any
 * visitor can modify guideline content without signing in. That is a deliberate
 * decision by the site owner, not a misconfiguration.
 *
 * Because local and production use the identical client and the identical
 * permissions, anything verified locally is genuinely representative of the
 * deployed site.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // No sign-in of any kind exists in this app, so there is no session to
        // persist or refresh.
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isSupabaseEnabled = supabase !== null;
