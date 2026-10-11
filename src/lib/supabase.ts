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
 * has been removed. Reads AND writes both go through this same anon client
 * everywhere — local dev, preview, and the deployed site alike.
 *
 * WHAT THE KEY DOES AND DOES NOT GRANT. The anon key is a routing credential,
 * not a permission. Unauthenticated, it can only SELECT: as of
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql, `guidelines`
 * and `guideline_changelog` carry write policies gated on `public.is_editor()`,
 * a hardcoded UUID allowlist of named editor accounts. A request carrying no
 * session — or a session for any other account — is refused by Postgres. So
 * writes now require signing in as an editor, and that is enforced at the
 * database layer rather than by this app.
 *
 * Sessions are therefore persisted and refreshed: without a stored session
 * every reload would drop `auth.uid()` and every write would fail RLS. The
 * session lives in localStorage, holds only the editor's own JWT, and is
 * created solely by src/components/EditorAuthControl.tsx.
 *
 * Because local and production use the identical client and the identical
 * permissions, anything verified locally is genuinely representative of the
 * deployed site.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Required for editor writes to survive a reload — see above.
          persistSession: true,
          autoRefreshToken: true,
          // Off because this app uses the URL hash for its own routing
          // (#/catalogue, #/about), and letting the auth client claim that hash
          // means two things parsing it with different rules.
          //
          // ONE auth redirect does land back here: the password-recovery link,
          // which arrives as `#access_token=…&type=recovery`. It is parsed
          // explicitly by consumeRecoveryLink() in src/lib/editor-session.ts,
          // which acts only on a URL that actually carries auth parameters and
          // strips them once used. If you ever flip this to true, delete that
          // function — two consumers racing for the same one-time tokens means
          // whichever loses reports a dead link.
          detectSessionInUrl: false,
        },
      })
    : null;

export const isSupabaseEnabled = supabase !== null;
