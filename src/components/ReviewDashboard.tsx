import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Guideline } from '../data/guidelines-data';
import {
  candidateToGuidelineDraft,
  changeReasonLabel,
  filterOutRejected,
  normaliseCandidates,
  type CandidatesPayload,
  type DisplayCandidate,
} from '../lib/candidates';
import mockCandidates from '../data/mock-candidates.json';
import { cn } from '../lib/utils';

/**
 * Read-only Pending Review UI.
 *
 * This is a manual review tool, not an authorization or publication surface —
 * there is no sign-in, and nothing here writes anywhere. "Review & Edit"
 * opens the existing Edit Guideline modal, prefilled, for a human to complete
 * editorially; the modal itself refuses to save while WRITES_ENABLED is
 * false (enforced at the modal's save-handler source, not just here).
 * "Reject" only hides a card from this browser tab's session — it is not
 * persisted and does not touch the candidate source data.
 */

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

export default function ReviewDashboard({
  payload = mockCandidates as CandidatesPayload,
  onEditCandidate,
}: {
  payload?: CandidatesPayload;
  onEditCandidate: (draft: Guideline) => void;
}) {
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  const allCandidates = normaliseCandidates(payload);
  const visible = filterOutRejected(allCandidates, rejectedIds);

  const handleReject = (candidateId: string) => {
    setRejectedIds(prev => {
      const next = new Set(prev);
      next.add(candidateId);
      return next;
    });
  };

  if (allCandidates.length === 0) {
    return <p className="text-[12px] text-slate-400 mt-3">No pending candidates in this data source.</p>;
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] text-slate-400 mb-3">
        Discovered items awaiting manual editorial review. Nothing here is published automatically —
        "Review &amp; Edit" opens the guideline form prefilled for a human to complete; "Reject" only
        hides the card in this browser tab.
      </p>

      {visible.length === 0 ? (
        <p className="text-[12px] text-slate-400">All candidates in this session have been rejected.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map(candidate => (
            <CandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              onEdit={() => onEditCandidate(candidateToGuidelineDraft(candidate))}
              onReject={() => handleReject(candidate.candidateId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  onEdit,
  onReject,
}: {
  candidate: DisplayCandidate;
  onEdit: () => void;
  onReject: () => void;
}) {
  const discovered = formatDate(candidate.discoveredAt);

  return (
    <div className="border border-slate-200 rounded-md bg-white p-3 flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-800">{candidate.topic}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {candidate.providerName ?? candidate.provider}
            {discovered && <> · discovered {discovered}</>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className="text-[10px] px-1.5 py-px rounded border border-amber-200 bg-amber-50 text-amber-700">
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
          onClick={onReject}
          className="px-3 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
