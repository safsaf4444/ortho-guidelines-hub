import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { resolveBrowserDatabase } from './supabase-config';

export const supabaseConfiguration = resolveBrowserDatabase({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  allowRemoteInLocal: import.meta.env.VITE_ALLOW_REMOTE_SUPABASE_IN_LOCAL,
}, {
  productionBuild: import.meta.env.PROD,
  mode: import.meta.env.MODE,
  origin: typeof window === 'undefined' ? undefined : window.location.origin,
});

/**
 * The one and only Supabase client, built from the PUBLIC anon key.
 *
 * There is no second, privileged client and no build-time key injection: the
 * former local-editor mode (a service-role key injected for `vite dev` only)
 * has been removed. Reads AND writes both go through this same anon client
 * when the explicit configuration and browser-origin policy permit it.
 * Missing or invalid local inputs leave the app in static mode.
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
 * Local tests require explicit loopback configuration. Remote local access is
 * an opt-in workflow, never inferred from missing variables or a preview build.
 */
export const supabase: SupabaseClient | null =
  supabaseConfiguration.enabled
    ? createClient(supabaseConfiguration.url, supabaseConfiguration.anonKey, {
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
