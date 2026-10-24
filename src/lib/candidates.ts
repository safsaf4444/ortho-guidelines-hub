import type { Guideline } from '../data/guidelines-data';
import { proposeGuidelineId } from './guideline-id';

/**
 * UI-side mirror of the ingestion candidate schema owned by
 * scripts/lib/ingestion.ts and scripts/lib/provider-adapter.ts.
 *
 * Not imported directly from those files: scripts/lib/ingestion.ts pulls in
 * `node:crypto` for candidate-ID generation, which has no place in a browser
 * bundle, and scripts/ isn't part of tsconfig.app.json's program. Only the
 * TYPE SHAPES are duplicated here — none of the ID-generation logic. Keep
 * `CANDIDATE_SCHEMA_VERSION` in sync with the same export in
 * scripts/lib/ingestion.ts by hand.
 */
export const CANDIDATE_SCHEMA_VERSION = 2;

/**
 * Every value public.staged_guidelines.change_reason can hold (its CHECK, as of
 * supabase/migrations/20261024_discovery_review_queue.sql). This is the
 * DATABASE-facing set, so it is wider than scripts/lib/ingestion.ts's
 * ChangeReason: it also carries the two discovery classes, which are staged
 * only by stage_discovery_candidate(). See supabase/DISCOVERY-QUEUE-CONTRACT.md.
 */
export type ChangeReason =
  | 'NEW_GUIDELINE'
  | 'REVISED'
  | 'WITHDRAWN'
  | 'CONTENT_DRIFT'
  | 'URL_MOVED'
  | 'UNREACHABLE_LINK'
  | 'POSSIBLE_SAME_DOCUMENT'
  | 'POSSIBLE_NEW_EDITION'
  | 'EDITION_TOKEN_CHANGED';

/**
 * Every review status a queue row can hold. Open: pending, deferred. Closed:
 * accepted (a new entry was PUBLISHED), rejected, resolved (a decision was
 * recorded and NOTHING was published).
 */
export type ReviewStatus = 'pending' | 'deferred' | 'accepted' | 'rejected' | 'resolved';

export interface CandidateVersionLink {
  label: string;
  url: string;
  date?: string;
}

/** Structured candidate — mirrors IngestionCandidate in scripts/lib/ingestion.ts. */
export interface StructuredCandidate {
  candidateId: string;
  pipeline: string;
  provider: string;
  providerName: string;
  topic: string;
  summary?: string;
  versions: CandidateVersionLink[];
  primaryUrl: string;
  changeReason: ChangeReason;
  reviewStatus: ReviewStatus;
  discoveredAt: string;
  matchedGuidelineId: string | null;
  providerRef: string | null;
  notes?: string;
}

/**
 * Legacy pre-Phase-1 shape — mirrors DiscoveredItem (nee DiscoveredGuideline)
 * in scripts/lib/provider-adapter.ts. Used ONLY as a fallback when a report
 * has no structured `candidates`.
 */
export interface LegacyDiscoveredItem {
  topic: string;
  source: string;
  summary?: string;
  versions: CandidateVersionLink[];
}

/** One adapter's run within a candidates.json payload. */
export interface CandidateReportInput {
  pipeline?: string;
  adapter: string;
  provider: string;
  generatedAt?: string;
  totalDiscovered?: number;
  matchedExisting?: number;
  skippedBlocked?: number;
  /** Primary schema. */
  candidates?: StructuredCandidate[];
  /** @deprecated Fallback only — read when `candidates` is absent/empty. */
  newCandidates?: LegacyDiscoveredItem[];
  error?: string;
}

/** Top-level shape written by scripts/sync-providers.ts to candidates.json. */
export interface CandidatesPayload {
  schemaVersion?: number;
  generatedAt?: string;
  note?: string;
  existingGuidelineCount?: number;
  totalCandidates?: number;
  reports: CandidateReportInput[];
}

/** A candidate normalised for display, regardless of which schema it came from. */
export interface DisplayCandidate {
  candidateId: string;
  /**
   * The `staged_guidelines.id` uuid, when this candidate came from that table
   * (see src/lib/staged-service.ts). It is the only identifier
   * `approve_staged_guideline()` accepts, so its presence is also what marks a
   * candidate as publishable through the atomic RPC.
   *
   * Absent for candidates read from a candidates.json payload, which have no
   * row in the queue and therefore nothing to approve.
   */
  stagedId?: string;
  topic: string;
  provider: string;
  providerName?: string;
  changeReason: ChangeReason;
  sourceUrl: string;
  /** Absent when the source data didn't carry one — never fabricated. */
  discoveredAt?: string;
  /** True when derived from the legacy `newCandidates` fallback, not the structured schema. */
  fromLegacyFallback: boolean;
  /** Queue rows only. Absent for candidates read from a candidates.json payload. */
  reviewStatus?: ReviewStatus;
  /** Latest recorded decision on a comparison/edition row; may be an OPEN follow-up. */
  reviewOutcome?: string | null;
  /** The catalogue entry a comparison/edition row concerns. */
  matchedGuidelineId?: string | null;
  /** Producer notes, verbatim (for a comparison row: the comparison reason). */
  notes?: string | null;
  /**
   * Which pipeline filed the row. NULL means it was filed BEFORE the review-queue
   * migration, whose stored URL was lowercased — its original case is unknown.
   */
  producer?: string | null;
}

function structuredToDisplay(c: StructuredCandidate): DisplayCandidate {
  return {
    candidateId: c.candidateId,
    topic: c.topic,
    provider: c.provider,
    providerName: c.providerName,
    changeReason: c.changeReason,
    sourceUrl: c.primaryUrl || c.versions[0]?.url || '',
    discoveredAt: c.discoveredAt,
    fromLegacyFallback: false,
  };
}

function legacyToDisplay(
  item: LegacyDiscoveredItem,
  report: CandidateReportInput,
  payload: CandidatesPayload,
  index: number
): DisplayCandidate {
  return {
    // Not a real ingestion candidateId (no pipeline/reason/URL hash) — this
    // schema predates that contract. Stable within one normalisation pass,
    // which is all a read-only display list needs.
    candidateId: `legacy-${report.provider}-${index}`,
    topic: item.topic,
    provider: item.source || report.provider,
    changeReason: 'NEW_GUIDELINE',
    sourceUrl: item.versions[0]?.url ?? '',
    discoveredAt: report.generatedAt ?? payload.generatedAt,
    fromLegacyFallback: true,
  };
}

/**
 * Normalises every report in a candidates payload into flat display records.
 *
 * Structured `candidates` is the primary source. `newCandidates` is read only
 * as a fallback, and only when a report has no structured candidates at all —
 * this is what lets the dashboard render an older, pre-Phase-1 candidates.json
 * (or a hand-written one) without special-casing it at the call site.
 *
 * Reports with `error` set are skipped — an adapter failure has no candidates
 * to show, structured or legacy.
 */
export function normaliseCandidates(payload: CandidatesPayload): DisplayCandidate[] {
  const out: DisplayCandidate[] = [];
  for (const report of payload.reports ?? []) {
    if (report.error) continue;
    if (report.candidates && report.candidates.length > 0) {
      out.push(...report.candidates.map(structuredToDisplay));
    } else if (report.newCandidates && report.newCandidates.length > 0) {
      report.newCandidates.forEach((item, index) => {
        out.push(legacyToDisplay(item, report, payload, index));
      });
    }
  }
  return out;
}

/** Candidates not in `rejectedIds`, in original order. Pure — no state of its own. */
export function filterOutRejected(
  candidates: DisplayCandidate[],
  rejectedIds: ReadonlySet<string>
): DisplayCandidate[] {
  return candidates.filter(c => !rejectedIds.has(c.candidateId));
}

const CHANGE_REASON_LABELS: Record<ChangeReason, string> = {
  NEW_GUIDELINE: 'New guideline',
  REVISED: 'Revised / new edition',
  WITHDRAWN: 'Possibly withdrawn',
  CONTENT_DRIFT: 'Content changed',
  URL_MOVED: 'URL moved',
  UNREACHABLE_LINK: 'Link unreachable',
  POSSIBLE_SAME_DOCUMENT: 'Possible same document — compare',
  POSSIBLE_NEW_EDITION: 'Possible new edition',
  EDITION_TOKEN_CHANGED: 'Edition token changed',
};

export function changeReasonLabel(reason: ChangeReason): string {
  return CHANGE_REASON_LABELS[reason] ?? reason;
}

/**
 * Draft Guideline for the existing Edit modal, prefilled from a candidate.
 *
 * Only topic, source, and versions come from the candidate — everything else
 * (section, type, summary, status…) is editorial judgement that belongs to a
 * human reviewer, not this pipeline, so it's left blank/placeholder rather
 * than guessed. The modal's Save path enforces read-only separately — this
 * function only builds the prefilled draft, it never persists anything.
 *
 * The editorial-metadata fields follow the same rule. guidanceStatus is
 * 'needs-review', which is not a guess — a pipeline-discovered candidate is
 * by definition awaiting review — and inclusionReason records that
 * provenance, which also satisfies the DB constraint requiring a reason on
 * that status. sourceType has no blank member in its union, so it carries
 * the same default the database uses; the reviewer must confirm it, exactly
 * like the empty `section` and `type` above.
 */
export function candidateToGuidelineDraft(
  candidate: DisplayCandidate,
  existingIds: Iterable<string> = [],
): Guideline {
  return {
    // A readable slug the editor reviews before saving, NOT the candidate's
    // content hash. This id becomes a permanent primary key and the changelog's
    // foreign key the moment the draft is published, so
    // `candidate-boa-new-guideline-3f9a1c4e7b22` would be permanent too. See
    // src/lib/guideline-id.ts.
    //
    // `existingIds` defaults to empty so a caller with no catalogue to hand
    // still gets a sensible slug; it then carries no collision guarantee, which
    // is why the modal validates again against the real set before saving.
    id: proposeGuidelineId(candidate.provider, candidate.topic, existingIds),
    section: '',
    topic: candidate.topic,
    source: candidate.provider,
    type: '',
    summary: '',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: new Date().toISOString().split('T')[0],
    status: 'To source',
    versions: candidate.sourceUrl ? [{ label: 'Source', url: candidate.sourceUrl }] : [],
    sourceType: 'national',
    guidanceStatus: 'needs-review',
    inclusionReason: `Discovered by the ${candidate.provider} sync adapter and awaiting editorial review. Not yet confirmed as in scope.`,
  };
}
