import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { Guideline } from '../data/guidelines-data';
import {
  candidateToGuidelineDraft,
  changeReasonLabel,
  filterOutRejected,
  type DisplayCandidate,
} from '../lib/candidates';
import { stagedService, type StagedLoad } from '../lib/staged-service';
import { cn } from '../lib/utils';

/**
 * The Pending Review queue, read from `public.staged_guidelines`.
 *
 * Previously this rendered a static JSON fixture (src/data/mock-candidates.json)
 * because there was no queue table and no write policy, so nothing here could
 * ever be persisted. Both are now true: the sync GitHub Action populates
 * staged_guidelines with the service-role key, and
 * `approve_staged_guideline()` publishes a reviewed row atomically. See
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql.
 *
 * Still not an authorization surface. "Review & Edit" opens the existing Edit
 * Guideline modal prefilled, for a human to complete editorially; publication
 * happens there, through the RPC, and the database checks the editor allowlist
 * on the way in. Nothing in this component writes.
 *
 * The queue is editor-only (RLS), and an unauthenticated SELECT returns an
 * EMPTY LIST rather than an error — so "sign in to see this" and "the queue is
 * empty" are rendered as distinct states deliberately. Collapsing them would
 * tell a signed-out reader the pipeline had found nothing, which is the same
 * class of bug as showing a stale snapshot as if it were live.
 */

/** How long the undo toast stays on screen after a dismiss. */
const UNDO_TIMEOUT_MS = 6000;

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

export default function ReviewDashboard({
  signedIn,
  onEditCandidate,
}: {
  /**
   * Drives a refetch on sign-in/sign-out. Not a permission check — the
   * database decides what this session can read; this only means the fetch is
   * worth repeating because the answer will have changed.
   */
  signedIn: boolean;
  onEditCandidate: (draft: Guideline, stagedId?: string) => void;
}) {
  const [load, setLoad] = useState<StagedLoad | 'loading'>('loading');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // The most recent dismissal, kept only long enough to offer an undo.
  const [undo, setUndo] = useState<{ id: string; topic: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by the Refresh button; also the effect's re-run trigger.
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    stagedService.listPending().then(result => {
      if (!cancelled) setLoad(result);
    });
    return () => { cancelled = true; };
  }, [signedIn, reloadToken]);

  // Clear any pending timer on unmount so a fired timeout cannot setState on an
  // unmounted component.
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const handleDismiss = (candidateId: string, topic: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(candidateId);
      return next;
    });
    // A second dismiss replaces the first toast, so only the newest is undoable.
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ id: candidateId, topic });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
  };

  const handleUndo = () => {
    if (!undo) return;
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.delete(undo.id);
      return next;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  };

  if (load === 'loading') {
    return (
      <div className="mt-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the review queue…</span>
        {[0, 1].map(i => (
          <div key={i} className="border border-slate-200 rounded-md bg-white p-3 mb-2.5">
            <div className="h-3.5 w-1/2 bg-slate-200 rounded animate-pulse mb-2" />
            <div className="h-2.5 w-1/3 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!load.ok) {
    return (
      <div className="mt-3 border border-slate-200 bg-white rounded-md px-3.5 py-3 max-w-lg">
        <p className="text-[12px] font-medium text-slate-800">
          {load.reason === 'signed-out' ? 'Editor sign-in required'
            : load.reason === 'static' ? 'Review queue unavailable offline'
            : load.reason === 'no-table' ? 'Review queue not set up yet'
            : 'Could not load the review queue'}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{load.message}</p>
        {load.reason !== 'static' && (
          <button
            onClick={refresh}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 rounded
                       text-[11px] text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3 h-3 shrink-0" />
            Try again
          </button>
        )}
      </div>
    );
  }

  const visible = filterOutRejected(load.candidates, dismissedIds);

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[11px] text-slate-500 max-w-xl leading-relaxed">
          Discovered items awaiting manual editorial review, read live from the staging queue.
          Nothing here is published automatically — "Review &amp; Edit" opens the guideline form
          prefilled for a human to complete, and saving it publishes the entry and its change note
          in one atomic step. "Dismiss" only hides the card in this browser tab and does not
          persist, so it returns on reload.
        </p>
        <button
          onClick={refresh}
          title="Re-read the staging queue"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 rounded
                     text-[11px] text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3 shrink-0" />
          Refresh
        </button>
      </div>

      {load.candidates.length === 0 ? (
        <p className="text-[12px] text-slate-500">
          The staging queue is empty — the sync pipeline has not filed any candidates awaiting review.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-[12px] text-slate-500">All candidates in this session have been dismissed.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map(candidate => (
            <CandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              onEdit={() => onEditCandidate(candidateToGuidelineDraft(candidate), candidate.stagedId)}
              onDismiss={() => handleDismiss(candidate.candidateId, candidate.topic)}
            />
          ))}
        </div>
      )}

      {undo && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
                     rounded-md bg-slate-900 text-white shadow-lg px-3.5 py-2.5 max-w-[92vw]"
        >
          <span className="text-[12px] truncate">
            Dismissed <span className="font-medium">{undo.topic}</span>
          </span>
          <button
            onClick={handleUndo}
            className="text-[12px] font-semibold underline underline-offset-2 shrink-0
                       hover:text-slate-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-white rounded"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  onEdit,
  onDismiss,
}: {
  candidate: DisplayCandidate;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const discovered = formatDate(candidate.discoveredAt);

  return (
    <div className="border border-slate-200 rounded-md bg-white p-3 flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-800">{candidate.topic}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {candidate.providerName ?? candidate.provider}
            {discovered && <> · discovered {discovered}</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="text-[10px] px-1.5 py-px rounded border border-amber-200 bg-amber-50 text-amber-800">
            {changeReasonLabel(candidate.changeReason)}
          </span>
          {candidate.fromLegacyFallback && (
            <span
              className="text-[10px] px-1.5 py-px rounded border border-slate-200 bg-slate-50 text-slate-500"
              title="Derived from the legacy newCandidates fallback format, not the structured candidate schema."
            >
              legacy schema
            </span>
          )}
        </div>
      </div>

      {candidate.sourceUrl && (
        <a
          href={candidate.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 underline underline-offset-2 w-fit"
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          {candidate.sourceUrl}
        </a>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          onClick={onEdit}
          className={cn(
            'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
            'bg-[#0F172A] text-white hover:bg-slate-800'
          )}
        >
          Review &amp; Edit
        </button>
        <button
          onClick={onDismiss}
          title="Hides this card for the rest of this browser session. Not persisted — it returns on reload."
          className="px-3 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
