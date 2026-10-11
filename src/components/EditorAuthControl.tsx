import { useEffect, useRef, useState } from 'react';
import { KeyRound, Lock, LogOut, User } from 'lucide-react';
import {
  editorAuth,
  useRecoveryFlow,
  MIN_PASSWORD_LENGTH,
  type EditorSession,
} from '../lib/editor-session';
import { cn } from '../lib/utils';

/**
 * Minimal editor sign-in, in the header, plus the password-recovery flow.
 *
 * Exists because writes are gated on `public.is_editor()` in the database — a
 * UUID allowlist checked by RLS — so without a session every write is refused
 * by Postgres. See
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql.
 *
 * This control is NOT the write boundary. It creates a session; the database
 * decides what that session may do. Signing in with an account that is not on
 * the allowlist will show the write controls and then fail the write with a
 * clear message, which is the honest outcome — the refusal comes from the
 * place that actually enforces it.
 *
 * ── Header width ───────────────────────────────────────────────────────────
 * An "Editor sign in" control used to live here and was removed because the
 * header overflowed at ~798px (see the measurement note in App.tsx). This
 * version is icon-only up to `xl` and shows its label only above that, so it
 * costs ~28px at the widths where the old one broke the layout. Do not add a
 * text label at a smaller breakpoint without re-measuring scrollWidth >
 * clientWidth at 798px.
 */
export default function EditorAuthControl({ session }: { session: EditorSession }) {
  const recovery = useRecoveryFlow();
  const [open, setOpen] = useState(false);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const [rotating, setRotating] = useState(false);

  // A recovery link was followed and exchanged for a session: the whole point
  // of this page load is to set a password, so it takes over the screen rather
  // than hiding in a header popover the user has no reason to look for.
  const showRecoveryDialog = recovery.status === 'active' && !recoveryDismissed;

  // A dead link has to surface somewhere. Opening the sign-in panel puts the
  // message next to the "send me a new link" button that fixes it.
  useEffect(() => {
    if (recovery.status === 'error') setOpen(true);
  }, [recovery.status]);

  return (
    <>
      {showRecoveryDialog && (
        <PasswordDialog mode="recovery" session={session} onDone={() => setRecoveryDismissed(true)} />
      )}
      {rotating && !showRecoveryDialog && (
        <PasswordDialog mode="rotate" session={session} onDone={() => setRotating(false)} />
      )}
      <HeaderControl
        session={session}
        open={open}
        setOpen={setOpen}
        onChangePassword={() => setRotating(true)}
        recoveryError={recovery.status === 'error' ? recovery.message : null}
        recoveryWorking={recovery.status === 'working'}
      />
    </>
  );
}

/**
 * Set-or-change-password dialog. One component, two entry points:
 *
 *   'recovery' — a live recovery session from an emailed link. No current
 *                password is asked for, because the whole premise is that the
 *                user does not have one; possession of the one-time link is
 *                the proof.
 *   'rotate'   — an ordinary signed-in session. The current password IS
 *                required, and verified before anything is written. See
 *                editorAuth.changePassword for why that matters.
 *
 * The confirm field is not ceremony in either mode: a mistyped password locks
 * the only editor account out of its own catalogue, and the way back in is an
 * email round-trip that has already proved rate-limitable.
 */
function PasswordDialog({
  mode,
  session,
  onDone,
}: {
  mode: 'recovery' | 'rotate';
  session: EditorSession;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const isRotate = mode === 'rotate';

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  // Escape closes the rotation dialog — it is an optional errand the user can
  // abandon. The recovery dialog has no such exit: dismissing it silently
  // would leave an account with no password and no obvious way to notice.
  useEffect(() => {
    if (!isRotate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isRotate, onDone]);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH
    && password === confirm
    && (!isRotate || current.length > 0)
    && !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = isRotate
      ? await editorAuth.changePassword(session.email ?? '', current, password)
      : await editorAuth.setPassword(password);
    setBusy(false);
    if (result.ok) {
      setCurrent('');
      setSaved(true);
      return;
    }
    setError(result.error);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-start justify-center p-4 pt-[12vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="set-password-heading"
        className="w-full max-w-[380px] rounded-md border border-slate-200 bg-white shadow-xl p-4"
      >
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
          <h2 id="set-password-heading" className="text-[14px] font-semibold text-slate-800">
            {saved ? 'Password changed' : isRotate ? 'Change your password' : 'Set your editor password'}
          </h2>
        </div>

        {saved ? (
          <>
            <p className="text-[12px] text-slate-600 leading-relaxed mt-2">
              {isRotate
                ? 'Your new password is in force. The old one no longer works — including the temporary '
                  + 'one set through the Admin API. You remain signed in here.'
                : 'You are signed in and the write controls are now available.'}
              {' '}Whether a given change is accepted is still decided by the database — your account
              must be listed in <code className="mx-0.5">public.is_editor()</code>.
            </p>
            <button
              onClick={onDone}
              autoFocus
              className="mt-3 w-full px-3 py-1.5 rounded text-[12px] font-medium bg-[#0F172A] text-white
                         hover:bg-slate-800 transition-colors"
            >
              {isRotate ? 'Done' : 'Continue'}
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2">
            <p className="text-[11px] text-slate-500 leading-relaxed mb-1">
              {isRotate
                ? `Changing the password for ${session.email ?? 'this account'}. Your current password is `
                  + 'required, so a borrowed session cannot take the account over.'
                : 'Your reset link is valid for this page load only. Set a password now — it becomes the '
                  + 'way you sign in from here on.'}
            </p>

            {isRotate && (
              <>
                <label className="text-[11px] font-medium text-slate-600" htmlFor="current-password">
                  Current password
                </label>
                <input
                  id="current-password"
                  ref={firstFieldRef}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  className="border border-slate-200 rounded px-2 py-1.5 text-[12px]
                             focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                />
              </>
            )}

            <label className={cn('text-[11px] font-medium text-slate-600', isRotate && 'mt-1')} htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              ref={isRotate ? undefined : firstFieldRef}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-describedby="new-password-hint"
              className="border border-slate-200 rounded px-2 py-1.5 text-[12px]
                         focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            />
            <p id="new-password-hint" className={cn('text-[10px]', tooShort ? 'text-amber-700' : 'text-slate-500')}>
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>

            <label className="text-[11px] font-medium text-slate-600 mt-1" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-[12px]
                         focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            />
            {mismatch && (
              <p className="text-[10px] text-amber-700">The two passwords do not match.</p>
            )}

            {error && (
              <p role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-1 px-3 py-1.5 rounded text-[12px] font-medium bg-[#0F172A] text-white
                         hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? 'Saving…' : isRotate ? 'Change password' : 'Save password'}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600
                         hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            {!isRotate && (
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Skipping leaves the account with no password. You can request another link from the
                sign-in panel at any time.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function HeaderControl({
  session,
  open,
  setOpen,
  onChangePassword,
  recoveryError,
  recoveryWorking,
}: {
  session: EditorSession;
  open: boolean;
  setOpen: (o: boolean) => void;
  onChangePassword: () => void;
  recoveryError: string | null;
  recoveryWorking: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape and on a click outside. Returning focus to the trigger
  // matters here: without it a keyboard user is dropped at the top of the
  // document on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (open) emailRef.current?.focus();
  }, [open]);

  // Nothing to show until the stored session has been read back — rendering
  // "Sign in" first would flicker to "Sign out" for an editor who already is.
  // A recovery exchange in flight is held in the same placeholder.
  if (session.loading || recoveryWorking) {
    return <div className="w-[34px] h-[30px]" aria-hidden="true" />;
  }

  if (session.signedIn) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          title={`Signed in as ${session.email ?? 'an editor account'}. Write permission is decided by the database, not by this badge.`}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                     border bg-sky-50 text-sky-800 border-sky-200 max-w-[180px]"
        >
          <User className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{session.email ?? 'Editor'}</span>
        </span>
        {/* Icon-only at every width, deliberately: the header's measured budget
            is tight (see the width note at the top of this file) and this is a
            rare errand, not a primary action. */}
        <button
          onClick={onChangePassword}
          title="Change your password — requires your current one"
          aria-label="Change your password"
          className="flex items-center px-2 py-1.5 text-xs font-medium rounded-md
                     text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
        </button>
        <button
          onClick={() => void editorAuth.signOut()}
          title="Sign out — the site stays fully readable, but editing controls go away"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md
                     text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline">Sign out</span>
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await editorAuth.signIn(email, password);
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setPassword('');
      return;
    }
    setError(result.error);
  };

  const handleSendLink = async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then request the link.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await editorAuth.sendRecoveryEmail(email);
    setBusy(false);
    if (result.ok) {
      // Deliberately does not confirm the address exists — Supabase does not,
      // and saying "sent" for a non-account would be a lie either way round.
      setNotice('If that address has an editor account, a link is on its way. Open it in this browser.');
      return;
    }
    setError(result.error);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Sign in as an editor to make changes. Reading needs no account."
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
          open ? 'bg-[#0F172A] text-white' : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
        )}
      >
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden xl:inline">Editor sign in</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Editor sign in"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-md border border-slate-200
                     bg-white shadow-lg p-3"
        >
          {recoveryError && (
            <p role="alert" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
              {recoveryError}
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-slate-600" htmlFor="editor-email">
              Email
            </label>
            <input
              id="editor-email"
              ref={emailRef}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-[12px]
                         focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            />

            <label className="text-[11px] font-medium text-slate-600 mt-1" htmlFor="editor-password">
              Password
            </label>
            <input
              id="editor-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="border border-slate-200 rounded px-2 py-1.5 text-[12px]
                         focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            />

            {error && (
              <p role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 px-3 py-1.5 rounded text-[12px] font-medium bg-[#0F172A] text-white
                         hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Working…' : 'Sign in'}
            </button>

            {/* The only route in for an account that has never had a password
                set — which is the state the single editor account starts in. */}
            <button
              type="button"
              onClick={() => void handleSendLink()}
              disabled={busy}
              className="text-[11px] text-slate-600 underline underline-offset-2 hover:text-slate-800
                         disabled:opacity-50 text-left"
            >
              Set or reset my password by email
            </button>

            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
              Editor accounts are created by hand in Supabase and must be listed in
              <code className="mx-0.5">public.is_editor()</code>. There is no sign-up:
              an account alone grants nothing.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
