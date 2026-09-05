import { useState, useEffect, type FormEvent } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { EditorAuth } from '../lib/auth';
import { cn } from '../lib/utils';

/**
 * Minimal editor sign-in/out control — magic-link only, no password field.
 *
 * Signing in does not grant write access by itself: `auth.isEditor` also
 * requires the signed-in user's id to be in the explicit allowlist (see
 * src/lib/editor-allowlist.ts), and every write control additionally
 * requires WRITES_ENABLED (see src/lib/write-access.ts). This component only
 * reports sign-in state and lets a visitor request a magic link — it makes
 * no authorization decision of its own.
 *
 * Presentation only, Phase 4: the signed-out default used to render the full
 * email input + "Send magic link" button unconditionally in the header,
 * competing with search for every clinician who has no reason to sign in.
 * `expanded` is a local UI toggle — it does not touch `auth` at all — so a
 * signed-out visitor sees a small "Editor sign in" action and the form only
 * appears once they deliberately ask for it. No authentication logic changed.
 *
 * Follow-up fix: the expanded form used to render inline in the header's
 * flex row (input + button + up to a 160px error message, side by side).
 * Measured at ~385px wide, plus the ~367px logo/title block already left of
 * it — over budget on any phone before the error message even appears. It
 * now renders as a small anchored popover instead: a fixed-width panel
 * (clamped against the viewport) positioned relative to the trigger button,
 * with the input stacked above the button rather than beside it. This is
 * self-contained to this component — a `position: relative` wrapper plus an
 * absolutely-positioned panel needs no coordination with the header's own
 * layout or its `top-[56px]` constants (unlike a "stack below the header,
 * full width" approach, which would have).
 */
export default function EditorAuthControl({ auth }: { auth: EditorAuth }) {
  const [email, setEmail] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Escape closes the popover, matching standard overlay behaviour. Only
  // attached while open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (!auth.ready) return null;

  if (auth.userId) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={cn(
            'px-2 py-0.5 rounded-full border font-medium',
            auth.isEditor
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          )}
          title={auth.isEditor ? 'Signed in as an approved editor' : 'Signed in, but not an approved editor'}
        >
          {auth.isEditor ? 'Editor' : 'Signed in (not an editor)'}
        </span>
        <button
          onClick={() => auth.signOut()}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Sign out
        </button>
      </div>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    auth.requestMagicLink(email);
  };

  if (auth.status === 'sent') {
    return (
      <span className="text-[11px] text-emerald-700">
        Check your email for a sign-in link.
      </span>
    );
  }

  // `relative` here is the popover's anchor — it applies whether or not the
  // panel is open, so opening/closing never changes this element's own size
  // or position in the header's flex row.
  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
      >
        <LogIn className="w-3.5 h-3.5" />
        Editor sign in
      </button>

      {expanded && (
        <>
          {/* Transparent, full-viewport — click anywhere outside the panel
              to close it, the same convention as the app's other overlays
              (EditModal, the mobile sidebar backdrop). z-40 sits below the
              panel (z-50) and above ordinary page content. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setExpanded(false)}
          />
          <div
            role="dialog"
            aria-label="Editor sign in"
            // Anchored to the trigger button's own right edge, not the
            // viewport, so it naturally stays on-screen: this button sits
            // near the right end of the header, and extending the panel
            // leftward from that edge is the direction with room. The
            // max-w clamp is the actual safety net for any width.
            className="absolute right-0 top-full mt-2 z-50 w-[240px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-lg shadow-lg p-3"
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Editor sign in
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Editor email"
                autoFocus
                className="w-full px-2.5 py-2 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={auth.status === 'sending'}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogIn className="w-3 h-3" />
                  {auth.status === 'sending' ? 'Sending…' : 'Send magic link'}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  title="Cancel"
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  ×
                </button>
              </div>
              {auth.status === 'error' && auth.errorMessage && (
                <span className="text-[10px] text-red-600">{auth.errorMessage}</span>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
