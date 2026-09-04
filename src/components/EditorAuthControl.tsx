import { useState, type FormEvent } from 'react';
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
 */
export default function EditorAuthControl({ auth }: { auth: EditorAuth }) {
  const [email, setEmail] = useState('');
  const [expanded, setExpanded] = useState(false);

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

  // Compact default: a clinician with no reason to sign in sees one small
  // action, not a live form. Clicking it reveals the exact same form below —
  // nothing about what the form does or submits has changed.
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
      >
        <LogIn className="w-3.5 h-3.5" />
        Editor sign in
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Editor email"
        autoFocus
        className="px-2 py-1 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 w-[140px]"
      />
      <button
        type="submit"
        disabled={auth.status === 'sending'}
        className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogIn className="w-3 h-3" />
        {auth.status === 'sending' ? 'Sending…' : 'Send magic link'}
      </button>
      {auth.status === 'error' && auth.errorMessage && (
        <span className="text-[10px] text-red-600 max-w-[160px]">{auth.errorMessage}</span>
      )}
      <button
        type="button"
        onClick={() => setExpanded(false)}
        title="Hide editor sign-in"
        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
      >
        ×
      </button>
    </form>
  );
}
