import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Editor sign-in state.
 *
 * WHAT THIS IS NOT: an access control. The write boundary is
 * `public.is_editor()` in the database — a hardcoded UUID allowlist checked by
 * RLS on every write (see
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql). This
 * module only reports whether a session EXISTS, so the UI can show the right
 * controls and the right error.
 *
 * The allowlist is deliberately NOT mirrored here. Duplicating those UUIDs in
 * the bundle would create a second source of truth that could silently drift
 * from the policy, and it would buy nothing: a signed-in non-editor already
 * gets refused by Postgres. So a signed-in user sees the write controls, and if
 * they are not on the allowlist the write fails with `notAnEditor` below — a
 * clear refusal from the real boundary rather than a guess from the client.
 */

export interface EditorSession {
  /** A session exists. NOT a statement that this account may write. */
  signedIn: boolean;
  email: string | null;
  userId: string | null;
  /** True until the stored session has been read back at startup. */
  loading: boolean;
}

const SIGNED_OUT: EditorSession = { signedIn: false, email: null, userId: null, loading: false };

/**
 * Subscribes to Supabase auth state.
 *
 * Starts in `loading` because reading a persisted session from localStorage is
 * async. Treating that moment as "signed out" would flash the read-only UI at
 * an editor who is in fact signed in, and — worse — let `canWrite` briefly
 * report false, so a write attempted in that window would be dropped by the
 * app's own gate before it ever reached the database.
 */
export function useEditorSession(): EditorSession {
  const [state, setState] = useState<EditorSession>(
    supabase ? { ...SIGNED_OUT, loading: true } : SIGNED_OUT
  );

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user ?? null;
      setState({
        signedIn: user !== null,
        email: user?.email ?? null,
        userId: user?.id ?? null,
        loading: false,
      });
    });

    // Covers sign-in, sign-out, and token refresh, including from another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState({
        signedIn: user !== null,
        email: user?.email ?? null,
        userId: user?.id ?? null,
        loading: false,
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Stricter than Supabase's own default (6). This account can rewrite clinical
 * guidance for a whole department; the cost of a longer password is nil.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const editorAuth = {
  /**
   * Sign in with email and password.
   *
   * Password rather than magic link, for two reasons specific to this
   * deployment: a magic link needs its redirect URL registered in the Supabase
   * dashboard's allowlist (config this app cannot carry), and the implicit-flow
   * callback arrives in the URL hash — which this app already uses for its own
   * routing. Password sign-in needs neither.
   *
   * Returns an error message rather than throwing: this is a form submission,
   * and every outcome is something to render next to the field.
   */
  async signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!supabase) {
      return { ok: false, error: 'Sign-in needs the live database — not available in offline/static mode.' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      // Supabase returns the same generic message for a wrong password and an
      // unknown address, on purpose — it does not confirm whether an account
      // exists. Passed through rather than embellished.
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  /**
   * Email a password-recovery link to `email`.
   *
   * `redirectTo` must be registered in Supabase under Authentication → URL
   * Configuration → Redirect URLs, or the link in the email will refuse to
   * come back here. Register both the deployed base URL and
   * http://localhost:5173 for local work.
   *
   * Succeeds silently for an unknown address — Supabase does not disclose
   * whether an account exists, and neither does the message shown.
   */
  async sendRecoveryEmail(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!supabase) {
      return { ok: false, error: 'Password reset needs the live database — not available in offline/static mode.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /**
   * Set a new password on the currently signed-in user.
   *
   * Requires a session — including the short-lived recovery session that
   * `consumeRecoveryLink()` establishes from the emailed link. Without one
   * this fails with "Auth session missing", which is exactly what happened
   * before recovery links were parsed at all.
   */
  async setPassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!supabase) {
      return { ok: false, error: 'Setting a password needs the live database — not available in offline/static mode.' };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /**
   * Rotate the password on an already-signed-in session.
   *
   * RE-VERIFIES THE CURRENT PASSWORD FIRST, which `updateUser` does not do on
   * its own. Without that step, any live session is enough to seize the
   * account permanently — an unlocked laptop, a borrowed ward machine, a
   * restored browser tab — and the rightful owner is locked out of the one
   * account that can edit the catalogue. Supabase calls this reauthentication;
   * here it is simply a sign-in with the supplied current password.
   *
   * A failed `signInWithPassword` does not disturb the existing session, so a
   * wrong current password costs the user nothing but the message.
   */
  async changePassword(
    email: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!supabase) {
      return { ok: false, error: 'Changing a password needs the live database — not available in offline/static mode.' };
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (newPassword === currentPassword) {
      return { ok: false, error: 'That is the same password you are already using.' };
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: currentPassword,
    });
    if (reauthError) {
      return { ok: false, error: 'Current password is not correct. Nothing was changed.' };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },
};

// ─── Password recovery links ────────────────────────────────────────────────
/**
 * `detectSessionInUrl` is OFF on the client (see src/lib/supabase.ts), because
 * leaving it on would have the auth client inspect a URL hash this app uses for
 * its own routing (#/catalogue, #/about). The cost is that nothing parses the
 * recovery link Supabase emails, so no recovery session is established and
 * `updateUser({ password })` fails with "Auth session missing".
 *
 * This consumes that link explicitly instead: narrow, deliberate, and it only
 * ever acts on a URL that actually carries auth parameters. Routing hashes are
 * untouched.
 */

export type RecoveryState =
  | { status: 'none' }
  /** A recovery link is present and being exchanged for a session. */
  | { status: 'working' }
  /** A recovery session is live; the user may now set a password. */
  | { status: 'active' }
  | { status: 'error'; message: string };

/**
 * Consumed at most ONCE per page load, and the result is cached here.
 *
 * Module-level rather than in component state because the act of consuming is
 * destructive: the tokens are removed from the URL so a refresh or a shared
 * link cannot replay them. React StrictMode double-invokes effects in
 * development, and the second invocation would find the hash already cleared
 * and conclude there was no recovery link at all — closing the form the user
 * is standing in front of. Caching the promise makes the second run reuse the
 * first run's answer.
 */
let recoveryPromise: Promise<RecoveryState> | null = null;

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/** True when the URL carries something only an auth redirect would put there. */
function hasAuthParams(): boolean {
  const h = hashParams();
  if (h.has('access_token') || h.has('error') || h.has('error_code')) return true;
  // PKCE-style recovery arrives as ?code=... instead. Nothing else in this app
  // uses a `code` query parameter.
  return new URLSearchParams(window.location.search).has('code');
}

/**
 * Strip the auth parameters, leaving the rest of the URL alone.
 *
 * `replaceState` rather than assigning to location.hash: assigning would add a
 * history entry and fire hashchange, which this app's router listens to.
 */
function clearAuthParamsFromUrl(): void {
  const search = new URLSearchParams(window.location.search);
  search.delete('code');
  const query = search.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (query ? `?${query}` : ''),
  );
}

async function consumeRecoveryLink(): Promise<RecoveryState> {
  if (!supabase) {
    return { status: 'error', message: 'No database is configured for this build, so the link cannot be used.' };
  }

  const h = hashParams();

  // Supabase reports a dead link in the hash rather than by HTTP status. The
  // overwhelmingly common case is an expired one-time token, so say that
  // plainly instead of showing the raw code.
  const errorCode = h.get('error_code');
  if (h.has('error') || errorCode) {
    clearAuthParamsFromUrl();
    const described = h.get('error_description')?.replace(/\+/g, ' ');
    const expired = errorCode === 'otp_expired' || /expired/i.test(described ?? '');
    return {
      status: 'error',
      message: expired
        ? 'That reset link has expired or has already been used. Request a new one below.'
        : described || 'That reset link could not be used. Request a new one below.',
    };
  }

  const accessToken = h.get('access_token');
  const refreshToken = h.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    clearAuthParamsFromUrl();
    if (error) return { status: 'error', message: error.message };
    return { status: 'active' };
  }

  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    clearAuthParamsFromUrl();
    if (error) return { status: 'error', message: error.message };
    return { status: 'active' };
  }

  // Auth params were present but not a shape handled here — a magic link or an
  // invite, neither of which this app issues. Cleared so it cannot linger.
  clearAuthParamsFromUrl();
  return { status: 'none' };
}

/**
 * Detects a recovery link on first render and exchanges it for a session.
 *
 * Returns `none` on every ordinary page load, so this costs nothing when no
 * link is present.
 */
export function useRecoveryFlow(): RecoveryState {
  const [state, setState] = useState<RecoveryState>(() =>
    recoveryPromise || hasAuthParams() ? { status: 'working' } : { status: 'none' }
  );

  useEffect(() => {
    let cancelled = false;
    if (!recoveryPromise) {
      if (!hasAuthParams()) {
        setState({ status: 'none' });
        return;
      }
      recoveryPromise = consumeRecoveryLink();
    }
    recoveryPromise.then(result => {
      if (!cancelled) setState(result);
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * True when a Postgres error is RLS refusing the write.
 *
 * 42501 is insufficient_privilege, raised by approve_staged_guideline() for a
 * non-editor. A policy that simply does not match is subtler: PostgREST
 * reports 42501 for a blocked INSERT, but a blocked UPDATE matches zero rows
 * and succeeds with no error at all — which is why the update path checks the
 * affected-row count rather than relying on this (see guidelines-service.ts).
 */
export function isNotAnEditorError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42501'
    || /row-level security|not an approved editor|insufficient_privilege/i.test(error.message ?? '');
}

export const NOT_AN_EDITOR_MESSAGE =
  'That account is signed in but is not on the editor allowlist, so the database refused the change. '
  + 'Nothing was saved. Ask the site owner to add your account to public.is_editor().';
