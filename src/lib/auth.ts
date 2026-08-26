import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isEditorUuid } from './editor-allowlist';
import { prepareMagicLinkRequest } from './magic-link';

/**
 * Editor authentication via Supabase magic-link email sign-in.
 *
 * Uses signInWithOtp (no password to manage or leak) — Supabase emails the
 * user a sign-in link; completing it establishes a normal Auth session in
 * this browser tab, restored automatically on reload via getSession().
 *
 * This module only decides `isEditor` for the UI. It never uses the
 * service-role key (that key is server-side only — see SECURITY.md) and it
 * never enables writes by itself: `isEditor` is one of two independent
 * conditions write controls check (see src/lib/write-access.ts), and RLS is
 * the actual server-side boundary regardless of what this reports.
 */

export type MagicLinkStatus = 'idle' | 'sending' | 'sent' | 'error';

export type EditorAuth = {
  userId: string | null;
  isEditor: boolean;
  /** False until the initial session restore attempt has completed. */
  ready: boolean;
  status: MagicLinkStatus;
  errorMessage: string | null;
  requestMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export function useEditorAuth(): EditorAuth {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<MagicLinkStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Static/offline mode: no auth backend. Degrade to "not signed in, not an
    // editor" quietly rather than erroring — browsing must still work.
    if (!supabase) {
      setReady(true);
      return;
    }
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const requestMagicLink = async (email: string) => {
    const prepared = prepareMagicLinkRequest(email, supabase !== null);
    if (!prepared.ok) {
      setStatus('error');
      setErrorMessage(prepared.error);
      return;
    }
    setStatus('sending');
    setErrorMessage(null);
    // emailRedirectTo must be an allowed Supabase Auth redirect URL — the
    // production URL is added manually in the Supabase dashboard, not here
    // (see SECURITY.md "Manual prerequisites"). Locally this is whatever
    // origin Vite is serving from, which Supabase allows by default in dev.
    const { error } = await supabase!.auth.signInWithOtp({
      email: prepared.email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }
    setStatus('sent');
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setStatus('idle');
    setErrorMessage(null);
  };

  const isEditor = isEditorUuid(userId);

  return { userId, isEditor, ready, status, errorMessage, requestMagicLink, signOut };
}
