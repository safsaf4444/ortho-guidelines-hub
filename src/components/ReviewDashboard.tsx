import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ExternalLink, EyeOff, RefreshCw } from 'lucide-react';
import {
  changeReasonLabel,
  filterOutRejected,
  type DisplayCandidate,
} from '../lib/candidates';
import { stagedService, type StagedLoad } from '../lib/staged-service';
import { classifyWriteFailure, UNCONFIRMED_SAVE_MESSAGE } from '../lib/write-result';
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
  /**
   * Hands the whole candidate up, not a prefilled draft. Building the draft
   * needs the full set of existing guideline ids to propose a non-colliding
   * one, and that belongs to App, not to a review list.
   */
  onEditCandidate: (candidate: DisplayCandidate) => void;
}) {
  const [load, setLoad] = useState<StagedLoad | 'loading'>('loading');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // The most recent dismissal, kept only long enough to offer an undo.
  const [undo, setUndo] = useState<{ id: string; topic: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by the Refresh button; also the effect's re-run trigger.
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * The reject flow, for one candidate at a time.
   *
   * `reason` is held HERE rather than inside the card so a failed attempt
   * cannot lose it to a re-render: the panel stays open with the text intact
   * and the editor can correct and retry. Same principle as the edit modal.
   */
  const [rejecting, setRejecting] = useState<
    { stagedId: string; candidateId: string; topic: string; reason: string; busy: boolean; error: string | null } | null
  >(null);
  /** Shown only after the database confirms a rejection. */
  const [rejected, setRejected] = useState<{ topic: string; candidateId: string } | null>(null);

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

  const openReject = (stagedId: string | undefined, candidateId: string, topic: string) => {
    if (!stagedId) return;   // not a queue row, so there is nothing to reject
    setRejected(null);
    setRejecting({ stagedId, candidateId, topic, reason: '', busy: false, error: null });
  };

  /**
   * Confirms the rejection against the database before claiming anything.
   *
   * Success is reported only after the RPC resolves. A refusal and an
   * unconfirmed outcome are reported differently, and neither is guessed at: a
   * dropped response may or may not have committed, so the editor is told to
   * refresh and look rather than being told it failed.
   */
  const confirmReject = async () => {
    if (!rejecting || rejecting.busy) return;
    const reason = rejecting.reason.trim();
    if (!reason) {
      setRejecting({ ...rejecting, error: 'Give a reason before rejecting. It is the only record of why.' });
      return;
    }
    setRejecting({ ...rejecting, busy: true, error: null });
    try {
      await stagedService.reject(rejecting.stagedId, reason);
      // Confirmed. Only now is anything claimed, and the queue is re-read so
      // what ends up on screen came back from the database.
      setRejected({ topic: rejecting.topic, candidateId: rejecting.candidateId });
      setRejecting(null);
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const unconfirmed = classifyWriteFailure(err) !== 'refused';
      // The reason survives either way.
      setRejecting({
        ...rejecting,
        busy: false,
        error: unconfirmed ? `${UNCONFIRMED_SAVE_MESSAGE} ${msg}` : msg,
      });
    }
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
          in one atomic step. <strong>Reject</strong> records a permanent, attributed decision with
          your reason, so the item stops reappearing each week. <strong>Hide</strong> is temporary
          and local to this browser tab — it writes nothing, and the card returns on reload.
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

      {rejected && (
        <div role="status" aria-live="polite"
          className="mb-3 border border-emerald-200 bg-emerald-50 rounded-md px-3 py-2 text-[11px] text-emerald-900">
          Rejected <span className="font-medium">{rejected.topic}</span> and recorded your reason. It will
          not reappear in future discovery runs.
        </div>
      )}

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
              onEdit={() => onEditCandidate(candidate)}
              onDismiss={() => handleDismiss(candidate.candidateId, candidate.topic)}
              onReject={() => openReject(candidate.stagedId, candidate.candidateId, candidate.topic)}
              canReject={Boolean(candidate.stagedId)}
              reject={rejecting && rejecting.candidateId === candidate.candidateId ? {
                reason: rejecting.reason,
                busy: rejecting.busy,
                error: rejecting.error,
                setReason: (r: string) => setRejecting(prev => (prev ? { ...prev, reason: r } : prev)),
                confirm: confirmReject,
                cancel: () => setRejecting(null),
              } : null}
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

interface RejectPanel {
  reason: string;
  busy: boolean;
  error: string | null;
  setReason: (r: string) => void;
  confirm: () => void;
  cancel: () => void;
}

function CandidateCard({
  candidate,
  onEdit,
  onDismiss,
  onReject,
  canReject,
  reject,
}: {
  candidate: DisplayCandidate;
  onEdit: () => void;
  onDismiss: () => void;
  onReject: () => void;
  /** False for a candidate with no queue row — there is nothing to record against. */
  canReject: boolean;
  /** Non-null while THIS card's reject panel is open. */
  reject: RejectPanel | null;
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

      {/* flex-wrap: three actions no longer fit one line at phone width. */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
        <button
          onClick={onEdit}
          className={cn(
            'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
            'bg-[#0F172A] text-white hover:bg-slate-800'
          )}
        >
          Review &amp; Edit
        </button>
        {/* PERSISTENT. Deliberately styled and worded apart from Hide below:
            one writes an attributed decision to the database, the other
            changes nothing outside this tab. These were a single, ambiguous
            "Dismiss" before. */}
        {canReject && (
          <button
            onClick={onReject}
            disabled={Boolean(reject)}
            title="Record a permanent, attributed rejection with a reason. This item will not reappear in future discovery runs."
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium
                       border border-red-200 text-red-700 bg-red-50 hover:bg-red-100
                       disabled:opacity-50 transition-colors"
          >
            <Ban className="w-3 h-3 shrink-0" />
            Reject…
          </button>
        )}

        {/* TEMPORARY, and says so. */}
        <button
          onClick={onDismiss}
          title="Hides this card for the rest of this browser session only. Writes nothing, and the card returns on reload."
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded
                     text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <EyeOff className="w-3 h-3 shrink-0" />
          Hide
        </button>
      </div>

      {reject && (
        <div
          role="group"
          aria-label={'Reject ' + candidate.topic}
          className="border border-red-200 bg-red-50/60 rounded-md p-2.5 flex flex-col gap-2"
        >
          {/* Names the target, so a mis-click on a long list is visible before
              anything is written. */}
          <p className="text-[11px] text-red-900 leading-relaxed">
            Reject <span className="font-semibold">{candidate.topic}</span>? This records a permanent
            decision against your account, and the item will not be offered again.
          </p>
          <label className="text-[10px] font-medium text-red-900" htmlFor={`reject-reason-${candidate.candidateId}`}>
            Reason (required)
          </label>
          <textarea
            id={`reject-reason-${candidate.candidateId}`}
            value={reject.reason}
            onChange={e => reject.setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Course material, not clinical guidance"
            className="border border-red-200 rounded px-2 py-1.5 text-[12px] bg-white
                       focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
          />
          {reject.error && (
            <p role="alert" className="text-[11px] text-red-800 bg-red-100 border border-red-200 rounded px-2 py-1.5">
              {reject.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={reject.confirm}
              disabled={reject.busy || reject.reason.trim().length === 0}
              className="px-3 py-1.5 rounded text-[12px] font-medium bg-red-700 text-white
                         hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reject.busy ? 'Rejecting…' : 'Confirm rejection'}
            </button>
            <button
              onClick={reject.cancel}
              disabled={reject.busy}
              className="px-3 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600
                         bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
