import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ExternalLink, EyeOff, History, RefreshCw } from 'lucide-react';
import {
  changeReasonLabel,
  filterOutRejected,
  type DisplayCandidate,
} from '../lib/candidates';
import {
  allowedActions,
  groupOpenRows,
  isCollisionFiledId,
  isOpenFollowUp,
  outcomeLabel,
  RESOLVE_ACTION_META,
  type ResolveAction,
} from '../lib/review-actions';
import {
  needsFollowUpConfirmation,
  stagedService,
  type HistoryLoad,
  type StagedLoad,
} from '../lib/staged-service';
import { isFeatureUnavailable } from '../lib/schema-compat';
import { classifyWriteFailure, isAlreadyProcessedWrite, UNCONFIRMED_SAVE_MESSAGE } from '../lib/write-result';
import { cn } from '../lib/utils';

/**
 * The review queue, read from `public.staged_guidelines`: every OPEN row,
 * grouped Pending and Deferred.
 *
 * What may be done with a row is decided by ONE matrix,
 * src/lib/review-actions.ts `allowedActions()`, and the database re-checks
 * every action. In particular "Review & publish" — the only route to
 * approve_staged_guideline() — is offered for NEW_GUIDELINE pending rows only.
 * Comparison and edition rows get decision controls instead, which record a
 * decision and never publish or change the catalogue.
 *
 * Still not an authorization surface. Publication happens in the Edit modal,
 * through the RPC, and the database checks the editor allowlist on the way in.
 *
 * The queue is editor-only (RLS), and an unauthenticated SELECT returns an
 * EMPTY LIST rather than an error — so "sign in to see this" and "the queue is
 * empty" are rendered as distinct states deliberately. So is "this database
 * does not have the review-queue upgrade": that is shown as unavailable, never
 * as an empty queue.
 */

/** How long the undo toast stays on screen after a dismiss. */
const UNDO_TIMEOUT_MS = 6000;

function formatDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/** The outcome of an attempted write, phrased without guessing. */
function describeFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (isFeatureUnavailable(err) || isAlreadyProcessedWrite(err)) return msg;
  return classifyWriteFailure(err) !== 'refused' ? `${UNCONFIRMED_SAVE_MESSAGE} ${msg}` : msg;
}

export interface CatalogueEntryRef {
  topic: string;
  url?: string;
}

export default function ReviewDashboard({
  signedIn,
  onEditCandidate,
  lookupEntry,
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
   * one, and that belongs to App, not to a review list. Called ONLY for rows
   * the action matrix allows to be published.
   */
  onEditCandidate: (candidate: DisplayCandidate) => void;
  /** Read-only lookup of a catalogue entry by id, for showing what a row matched. */
  lookupEntry?: (id: string) => CatalogueEntryRef | undefined;
}) {
  const [load, setLoad] = useState<StagedLoad | 'loading'>('loading');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // The most recent dismissal, kept only long enough to offer an undo.
  const [undo, setUndo] = useState<{ id: string; topic: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by the Refresh button; also the effect's re-run trigger.
  const [reloadToken, setReloadToken] = useState(0);
  /**
   * Drafts (reject reasons and decision notes), keyed per item and action.
   * Held HERE, outside any panel, so cancelling, switching panels, a failed
   * attempt or a queue refresh (the Refresh button, or the re-read after a
   * decision) never loses what the editor typed. Cleared when the database
   * confirms the write that used it.
   *
   * Lifetime: this page session only. React state, deliberately NOT persisted:
   * a full browser reload, closing the tab, or switching away from the review
   * view (which unmounts this component) discards every draft. (The
   * end-to-end test pins the reload case.)
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = (key: string, value: string) => setDrafts(prev => ({ ...prev, [key]: value }));
  const clearDraft = (key: string) => setDrafts(prev => {
    const next = { ...prev };
    delete next[key];
    return next;
  });
  /**
   * The reject flow, for one candidate at a time. `reason` mirrors the draft so
   * a failed attempt cannot lose it to a re-render: the panel stays open with
   * the text intact and the editor can correct and retry.
   */
  const [rejecting, setRejecting] = useState<
    {
      stagedId: string; candidateId: string; topic: string; reason: string; busy: boolean; error: string | null;
      needsOpenRowSupport: boolean; needsConfirmation: boolean; confirmed: boolean;
    } | null
  >(null);
  /** Shown only after the database confirms a rejection. */
  const [rejected, setRejected] = useState<{ topic: string; candidateId: string } | null>(null);
  /** The decision (resolve) flow, for one candidate and one action at a time. */
  const [resolving, setResolving] = useState<
    { stagedId: string; candidateId: string; topic: string; action: ResolveAction; busy: boolean; error: string | null } | null
  >(null);
  /** Shown only after the database confirms a decision. Never claims publication. */
  const [decided, setDecided] = useState<{ topic: string; text: string } | null>(null);
  /** Evidence and decision history, loaded on demand per item. */
  const [history, setHistory] = useState<Record<string, HistoryLoad | 'loading'>>({});

  const refresh = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoad('loading');
    stagedService.listOpen().then(result => {
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

  const rejectKey = (stagedId: string) => `reject:${stagedId}`;
  const resolveKey = (stagedId: string, action: ResolveAction) => `resolve:${stagedId}:${action}`;

  const openReject = (candidate: DisplayCandidate) => {
    const stagedId = candidate.stagedId;
    if (!stagedId) return;   // not a queue row, so there is nothing to reject
    const actions = allowedActions(candidate.changeReason, candidate.reviewStatus, candidate.reviewOutcome);
    setRejected(null);
    setDecided(null);
    setResolving(null);
    setRejecting({
      stagedId,
      candidateId: candidate.candidateId,
      topic: candidate.topic,
      reason: drafts[rejectKey(stagedId)] ?? '',
      busy: false,
      error: null,
      needsOpenRowSupport: candidate.reviewStatus === 'deferred' || actions.rejectNeedsConfirmation,
      needsConfirmation: actions.rejectNeedsConfirmation,
      confirmed: false,
    });
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
    if (rejecting.needsConfirmation && !rejecting.confirmed) {
      setRejecting({ ...rejecting, error: 'Tick the confirmation: rejecting closes this item\'s open follow-up.' });
      return;
    }
    setRejecting({ ...rejecting, busy: true, error: null });
    try {
      await stagedService.reject(rejecting.stagedId, reason, {
        needsOpenRowSupport: rejecting.needsOpenRowSupport,
        confirmOpenFollowUp: rejecting.needsConfirmation && rejecting.confirmed,
      });
      // Confirmed. Only now is anything claimed, and the queue is re-read so
      // what ends up on screen came back from the database.
      setRejected({ topic: rejecting.topic, candidateId: rejecting.candidateId });
      clearDraft(rejectKey(rejecting.stagedId));
      setRejecting(null);
      refresh();
    } catch (err) {
      // The reason survives either way.
      setRejecting({
        ...rejecting,
        busy: false,
        // The server says confirmation is required (the row gained an open
        // follow-up since this view was loaded): show the checkbox.
        needsConfirmation: rejecting.needsConfirmation || needsFollowUpConfirmation(err),
        needsOpenRowSupport: rejecting.needsOpenRowSupport || needsFollowUpConfirmation(err),
        // describeFailure() distinguishes refused, unavailable, already-processed
        // and unconfirmed (classifyWriteFailure(err) !== 'refused' →
        // UNCONFIRMED_SAVE_MESSAGE) without guessing.
        error: describeFailure(err),
      });
    }
  };

  const openResolve = (candidate: DisplayCandidate, action: ResolveAction) => {
    if (!candidate.stagedId) return;
    setRejecting(null);
    setRejected(null);
    setDecided(null);
    setResolving({ stagedId: candidate.stagedId, candidateId: candidate.candidateId, topic: candidate.topic, action, busy: false, error: null });
  };

  const confirmResolve = async () => {
    if (!resolving || resolving.busy) return;
    const key = resolveKey(resolving.stagedId, resolving.action);
    const note = (drafts[key] ?? '').trim();
    if (!note) {
      setResolving({ ...resolving, error: 'Add a note before recording this decision. It is the only record of why.' });
      return;
    }
    setResolving({ ...resolving, busy: true, error: null });
    try {
      const result = await stagedService.resolve(resolving.stagedId, resolving.action, note);
      const meta = RESOLVE_ACTION_META[resolving.action];
      setDecided({
        topic: resolving.topic,
        text: result.open
          ? `Recorded "${meta.label}". The item stays open in the ${result.reviewStatus === 'deferred' ? 'Deferred' : 'Pending'} group`
            + `${outcomeLabel(result.reviewOutcome) ? ` (${outcomeLabel(result.reviewOutcome)})` : ''}. Nothing was published.`
          : `Recorded "${meta.label}" and closed the item. Nothing was published and the catalogue was not changed.`,
      });
      clearDraft(key);
      setResolving(null);
      refresh();
    } catch (err) {
      setResolving({ ...resolving, busy: false, error: describeFailure(err) });
    }
  };

  const toggleHistory = (stagedId: string) => {
    setHistory(prev => {
      if (prev[stagedId]) {
        const next = { ...prev };
        delete next[stagedId];
        return next;
      }
      return { ...prev, [stagedId]: 'loading' };
    });
    if (!history[stagedId]) {
      stagedService.loadHistory(stagedId).then(result => {
        setHistory(prev => (prev[stagedId] ? { ...prev, [stagedId]: result } : prev));
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
      <div className="mt-3 border border-slate-200 bg-white rounded-md px-3.5 py-3 max-w-lg" data-testid="queue-state" data-reason={load.reason}>
        <p className="text-[12px] font-medium text-slate-800">
          {load.reason === 'signed-out' ? 'Editor sign-in required'
            : load.reason === 'static' ? 'Review queue unavailable offline'
            : load.reason === 'no-table' ? 'Review queue not set up yet'
            : load.reason === 'unavailable' ? 'Review queue feature unavailable'
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
  const groups = groupOpenRows(visible);
  const totals = groupOpenRows(load.candidates);

  const renderCard = (candidate: DisplayCandidate) => {
    const actions = allowedActions(candidate.changeReason, candidate.reviewStatus, candidate.reviewOutcome);
    const stagedId = candidate.stagedId ?? '';
    return (
      <CandidateCard
        key={candidate.candidateId}
        candidate={candidate}
        canPublish={actions.publish}
        onEdit={() => onEditCandidate(candidate)}
        onDismiss={() => handleDismiss(candidate.candidateId, candidate.topic)}
        onReject={() => openReject(candidate)}
        canReject={Boolean(candidate.stagedId) && actions.reject}
        resolveActions={actions.resolve}
        onResolve={(action) => openResolve(candidate, action)}
        matchedEntry={candidate.matchedGuidelineId ? lookupEntry?.(candidate.matchedGuidelineId) : undefined}
        historyState={history[stagedId]}
        onToggleHistory={() => toggleHistory(stagedId)}
        reject={rejecting && rejecting.candidateId === candidate.candidateId ? {
          reason: rejecting.reason,
          busy: rejecting.busy,
          error: rejecting.error,
          needsConfirmation: rejecting.needsConfirmation,
          confirmed: rejecting.confirmed,
          setConfirmed: (v: boolean) => setRejecting(prev => (prev ? { ...prev, confirmed: v } : prev)),
          setReason: (r: string) => {
            setDraft(rejectKey(rejecting.stagedId), r);
            setRejecting(prev => (prev ? { ...prev, reason: r } : prev));
          },
          confirm: confirmReject,
          cancel: () => setRejecting(null),
        } : null}
        resolve={resolving && resolving.candidateId === candidate.candidateId ? {
          action: resolving.action,
          note: drafts[resolveKey(resolving.stagedId, resolving.action)] ?? '',
          setNote: (n: string) => setDraft(resolveKey(resolving.stagedId, resolving.action), n),
          busy: resolving.busy,
          error: resolving.error,
          confirm: confirmResolve,
          cancel: () => setResolving(null),
        } : null}
      />
    );
  };

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[11px] text-slate-500 max-w-xl leading-relaxed">
          Discovered items awaiting manual editorial review, read live from the staging queue.
          Nothing here is published automatically. "Review &amp; publish" is offered only for a new
          guideline: it opens the guideline form prefilled, and saving it publishes the entry and its
          change note in one atomic step. Comparison and edition items record a decision instead, which
          never publishes anything. <strong>Reject</strong> records a permanent, attributed decision with
          your reason, which discovery retries using the same candidate ID preserve.
          <strong>Hide</strong> is temporary
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
          Rejected <span className="font-medium">{rejected.topic}</span> and recorded your reason.
          This candidate has been rejected. Discovery retries using the same candidate ID will
          preserve this decision.
        </div>
      )}

      {decided && (
        <div role="status" aria-live="polite" data-testid="decision-recorded"
          className="mb-3 border border-sky-200 bg-sky-50 rounded-md px-3 py-2 text-[11px] text-sky-900">
          <span className="font-medium">{decided.topic}</span>: {decided.text}
        </div>
      )}

      {load.candidates.length === 0 ? (
        <p className="text-[12px] text-slate-500" data-testid="queue-empty">
          The staging queue has no open items — nothing is pending or deferred.
        </p>
      ) : (
        <>
          <section aria-labelledby="queue-pending-heading" data-testid="group-pending" className="mb-4">
            <h3 id="queue-pending-heading" className="text-[12px] font-semibold text-slate-700 mb-2">
              Pending ({totals.pending.length})
            </h3>
            {groups.pending.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                {totals.pending.length === 0 ? 'Nothing pending.' : 'All pending items in this session have been hidden.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">{groups.pending.map(renderCard)}</div>
            )}
          </section>
          <section aria-labelledby="queue-deferred-heading" data-testid="group-deferred">
            <h3 id="queue-deferred-heading" className="text-[12px] font-semibold text-slate-700 mb-1">
              Deferred ({totals.deferred.length})
            </h3>
            <p className="text-[11px] text-slate-500 mb-2">
              Still open. A deferred item keeps its place in the queue until a decision closes it.
            </p>
            {groups.deferred.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                {totals.deferred.length === 0 ? 'Nothing deferred.' : 'All deferred items in this session have been hidden.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">{groups.deferred.map(renderCard)}</div>
            )}
          </section>
        </>
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
  needsConfirmation: boolean;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  setReason: (r: string) => void;
  confirm: () => void;
  cancel: () => void;
}

interface ResolvePanel {
  action: ResolveAction;
  note: string;
  setNote: (n: string) => void;
  busy: boolean;
  error: string | null;
  confirm: () => void;
  cancel: () => void;
}

function CandidateCard({
  candidate,
  canPublish,
  onEdit,
  onDismiss,
  onReject,
  canReject,
  resolveActions,
  onResolve,
  matchedEntry,
  historyState,
  onToggleHistory,
  reject,
  resolve,
}: {
  candidate: DisplayCandidate;
  /** From the action matrix: NEW_GUIDELINE + pending only. */
  canPublish: boolean;
  onEdit: () => void;
  onDismiss: () => void;
  onReject: () => void;
  /** False for a candidate with no queue row — there is nothing to record against. */
  canReject: boolean;
  resolveActions: ResolveAction[];
  onResolve: (action: ResolveAction) => void;
  matchedEntry?: { topic: string; url?: string };
  historyState?: HistoryLoad | 'loading';
  onToggleHistory: () => void;
  /** Non-null while THIS card's reject panel is open. */
  reject: RejectPanel | null;
  /** Non-null while THIS card's decision panel is open. */
  resolve: ResolvePanel | null;
}) {
  const discovered = formatDate(candidate.discoveredAt);
  const followUp = isOpenFollowUp(candidate.reviewOutcome) ? outcomeLabel(candidate.reviewOutcome) : null;
  const isComparisonOrEdition = candidate.changeReason !== 'NEW_GUIDELINE';

  return (
    <div className="border border-slate-200 rounded-md bg-white p-3 flex flex-col gap-2"
      data-testid="queue-card" data-candidate-id={candidate.candidateId}
      data-change-reason={candidate.changeReason} data-review-status={candidate.reviewStatus ?? ''}>
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
          {candidate.reviewStatus === 'deferred' && (
            <span className="text-[10px] px-1.5 py-px rounded border border-slate-300 bg-slate-100 text-slate-700">Deferred</span>
          )}
          {followUp && (
            <span data-testid="follow-up" className="text-[10px] px-1.5 py-px rounded border border-violet-200 bg-violet-50 text-violet-800">
              {followUp}
            </span>
          )}
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
        <div className="text-[11px] text-slate-500">
          <span className="text-slate-600">Discovered link{candidate.producer === null ? '' : ' (as published)'}: </span>
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="discovered-url"
            className="inline-flex items-center gap-1 hover:text-slate-700 underline underline-offset-2 break-all"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            {candidate.sourceUrl}
          </a>
        </div>
      )}

      {isComparisonOrEdition && candidate.matchedGuidelineId && (
        <div className="text-[11px] text-slate-600" data-testid="matched-entry">
          Concerns catalogue entry <span className="font-mono">{candidate.matchedGuidelineId}</span>
          {matchedEntry ? <> — {matchedEntry.topic}</> : <> (not in the loaded catalogue)</>}
          {matchedEntry?.url && (
            <> · <a href={matchedEntry.url} target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2 break-all">{matchedEntry.url}</a></>
          )}
        </div>
      )}

      {isComparisonOrEdition && candidate.notes && (
        <p className="text-[11px] text-slate-600 leading-relaxed" data-testid="comparison-reason">
          {candidate.notes}
        </p>
      )}

      {candidate.producer === null && (
        <p data-testid="uncertain" className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Filed before the review-queue upgrade: its stored link was lowercased, so the original letter case is
          unknown. Matches against it are by the loose key only and are not confirmed as the same document.
        </p>
      )}
      {isCollisionFiledId(candidate.candidateId) && (
        <p data-testid="collision" className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Candidate-id collision: another document already held this item's id, so it was filed separately under
          {' '}<span className="font-mono">{candidate.candidateId}</span>. The two were not merged.
        </p>
      )}

      {/* flex-wrap: several actions no longer fit one line at phone width. */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
        {canPublish && (
          <button
            onClick={onEdit}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
              'bg-[#0F172A] text-white hover:bg-slate-800'
            )}
          >
            Review &amp; publish…
          </button>
        )}
        {resolveActions.map(action => (
          <button
            key={action}
            onClick={() => onResolve(action)}
            disabled={Boolean(resolve) || Boolean(reject)}
            title={RESOLVE_ACTION_META[action].effect}
            className="px-3 py-1.5 rounded text-[12px] font-medium border border-sky-200 text-sky-800 bg-sky-50
                       hover:bg-sky-100 disabled:opacity-50 transition-colors"
          >
            {RESOLVE_ACTION_META[action].label}…
          </button>
        ))}
        {/* PERSISTENT. Deliberately styled and worded apart from Hide below:
            one writes an attributed decision to the database, the other
            changes nothing outside this tab. These were a single, ambiguous
            "Dismiss" before. */}
        {canReject && (
          <button
            onClick={onReject}
            disabled={Boolean(reject) || Boolean(resolve)}
            title="Record a permanent, attributed rejection with a reason. Discovery retries using the same candidate ID will preserve this decision."
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium
                       border border-red-200 text-red-700 bg-red-50 hover:bg-red-100
                       disabled:opacity-50 transition-colors"
          >
            <Ban className="w-3 h-3 shrink-0" />
            Reject…
          </button>
        )}

        <button
          onClick={onToggleHistory}
          aria-expanded={Boolean(historyState)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded
                     text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <History className="w-3 h-3 shrink-0" />
          {historyState ? 'Hide history' : 'Evidence & history'}
        </button>

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

      {resolve && (
        <div role="group" aria-label={`${RESOLVE_ACTION_META[resolve.action].label}: ${candidate.topic}`}
          className="border border-sky-200 bg-sky-50/60 rounded-md p-2.5 flex flex-col gap-2">
          <p className="text-[11px] text-sky-900 leading-relaxed">
            Record <span className="font-semibold">{RESOLVE_ACTION_META[resolve.action].label}</span> for{' '}
            <span className="font-semibold">{candidate.topic}</span>? {RESOLVE_ACTION_META[resolve.action].effect}
          </p>
          <label className="text-[10px] font-medium text-sky-900" htmlFor={`resolve-note-${candidate.candidateId}`}>
            Note (required)
          </label>
          <textarea
            id={`resolve-note-${candidate.candidateId}`}
            value={resolve.note}
            onChange={e => resolve.setNote(e.target.value)}
            rows={2}
            className="border border-sky-200 rounded px-2 py-1.5 text-[12px] bg-white
                       focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          />
          {resolve.error && (
            <p role="alert" className="text-[11px] text-red-800 bg-red-100 border border-red-200 rounded px-2 py-1.5">
              {resolve.error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={resolve.confirm}
              disabled={resolve.busy || resolve.note.trim().length === 0}
              className="px-3 py-1.5 rounded text-[12px] font-medium bg-sky-700 text-white
                         hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resolve.busy ? 'Recording…' : 'Record decision'}
            </button>
            <button
              onClick={resolve.cancel}
              disabled={resolve.busy}
              className="px-3 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600
                         bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
            decision against your account. Discovery retries using the same candidate ID will
            preserve it.
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
          {reject.needsConfirmation && (
            <label className="flex items-start gap-2 text-[11px] text-red-900">
              <input
                type="checkbox"
                checked={reject.confirmed}
                onChange={e => reject.setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                This item has an open follow-up ({outcomeLabel(candidate.reviewOutcome) ?? 'recorded by the database'}).
                Rejecting it closes that follow-up. I confirm.
              </span>
            </label>
          )}
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

      {historyState && <HistoryPanel state={historyState} />}
    </div>
  );
}

function HistoryPanel({ state }: { state: HistoryLoad | 'loading' }) {
  if (state === 'loading') {
    return <p className="text-[11px] text-slate-500" aria-busy="true">Loading evidence and history…</p>;
  }
  if (!state.ok) {
    return (
      <p role="alert" data-testid="history-state" data-reason={state.reason}
        className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
        {state.reason === 'unavailable' ? state.message : `Could not load the history: ${state.message}`}
      </p>
    );
  }
  return (
    <div className="border border-slate-200 rounded-md p-2.5 text-[11px] text-slate-700 flex flex-col gap-2" data-testid="history">
      <div>
        <div className="font-semibold text-slate-800 mb-1">Evidence ({state.evidence.length} sighting{state.evidence.length === 1 ? '' : 's'})</div>
        {state.evidence.length === 0 ? <p className="text-slate-500">No sightings recorded.</p> : (
          <ul className="flex flex-col gap-1.5" data-testid="evidence-list">
            {state.evidence.map(e => (
              <li key={e.id} className="border-l-2 border-slate-200 pl-2">
                <div>{formatDate(e.observed_at) ?? e.observed_at} · {e.producer} · run <span className="font-mono">{e.discovery_run_id}</span></div>
                <div className="break-all">Link: {e.discovered_url}</div>
                {e.observed_topic && <div>Title seen: {e.observed_topic}</div>}
                {e.row_match_basis === 'legacy-match-key' && (
                  <div className="text-amber-800">Matched to this row by the loose key only (row filed before the upgrade) — not confirmed as the same document.</div>
                )}
                {e.soft_match && typeof e.soft_match === 'object' && 'reason' in e.soft_match && (
                  <div>Comparison: {String((e.soft_match as { reason?: unknown }).reason)}</div>
                )}
                {e.token_change && <div>Token change: {JSON.stringify(e.token_change)}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="font-semibold text-slate-800 mb-1">Decisions ({state.decisions.length})</div>
        {state.decisions.length === 0 ? <p className="text-slate-500">No decisions recorded yet.</p> : (
          <ol className="flex flex-col gap-1.5" data-testid="decision-list">
            {state.decisions.map(d => (
              <li key={d.id} className="border-l-2 border-sky-200 pl-2">
                <div>
                  {formatDate(d.decided_at) ?? d.decided_at} · <span className="font-medium">{d.action}</span> ·{' '}
                  {d.from_status}{d.from_outcome ? ` (${d.from_outcome})` : ''} → {d.to_status} · by{' '}
                  <span className="font-mono">{d.decided_by.slice(0, 8)}</span>
                </div>
                <div className="text-slate-600">“{d.note}”</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
