/**
 * What an editor may do with a review-queue row — ONE matrix, used by the
 * dashboard to decide which controls to render and by App to refuse opening
 * the publish form. Pure and dependency-free so the offline suite can test
 * every type × status combination.
 *
 * It is a UI rule, not the authority. Every action is re-checked by the
 * database (approve_staged_guideline refuses non-NEW_GUIDELINE rows with 42809;
 * resolve_discovery_candidate refuses actions outside its class with 22023;
 * reject_staged_candidate refuses closed rows with 55000). The matrix exists so
 * the UI never OFFERS something the database would refuse — in particular, it
 * never offers new-entry publication for a comparison or edition row.
 *
 * Mirrors supabase/DISCOVERY-QUEUE-CONTRACT.md §1. Change both together.
 */
import type { ChangeReason, ReviewStatus } from './candidates';

export type ResolveAction =
  | 'same-document'
  | 'different-document'
  | 'no-action'
  | 'new-edition'
  | 'acknowledged'
  | 'needs-document-check'
  | 'defer';

/** Review outcomes that leave the row OPEN with a follow-up still owed. */
export const OPEN_FOLLOW_UP_OUTCOMES = [
  'different-document-awaiting-refiling',
  'new-edition-awaiting-revision',
  'needs-document-check',
] as const;
export type OpenFollowUpOutcome = (typeof OPEN_FOLLOW_UP_OUTCOMES)[number];

export function isOpenFollowUp(outcome: string | null | undefined): outcome is OpenFollowUpOutcome {
  return (OPEN_FOLLOW_UP_OUTCOMES as readonly string[]).includes(outcome ?? '');
}

/** Resolve actions per class, in the order the dashboard offers them. */
const RESOLVE_ACTIONS: Partial<Record<ChangeReason, readonly ResolveAction[]>> = {
  POSSIBLE_SAME_DOCUMENT: ['same-document', 'different-document', 'defer'],
  POSSIBLE_NEW_EDITION: ['same-document', 'no-action', 'different-document', 'new-edition', 'defer'],
  EDITION_TOKEN_CHANGED: ['acknowledged', 'needs-document-check', 'defer'],
};

/** The open outcome an action produces, so it is not offered again on a row that already has it. */
const ACTION_OPEN_OUTCOME: Partial<Record<ResolveAction, OpenFollowUpOutcome>> = {
  'different-document': 'different-document-awaiting-refiling',
  'new-edition': 'new-edition-awaiting-revision',
  'needs-document-check': 'needs-document-check',
};

export interface AllowedActions {
  /** Open the publish form (approve_staged_guideline). NEW_GUIDELINE + pending only. */
  publish: boolean;
  /** reject_staged_candidate. Any OPEN row (pending or deferred). */
  reject: boolean;
  /** Rejecting will close an open follow-up and needs explicit confirmation. */
  rejectNeedsConfirmation: boolean;
  /** resolve_discovery_candidate actions available for this row. */
  resolve: ResolveAction[];
}

const NONE: AllowedActions = { publish: false, reject: false, rejectNeedsConfirmation: false, resolve: [] };

export function isOpenStatus(status: ReviewStatus | undefined): boolean {
  return status === 'pending' || status === 'deferred';
}

/**
 * `held`: the row's document is on the editorial hold list. Publishing is then
 * withheld (approve_staged_guideline refuses it with RQ002 regardless); reject
 * and decisions stay available, because closing a held item is not publishing.
 */
export function allowedActions(
  changeReason: ChangeReason,
  reviewStatus: ReviewStatus | undefined,
  reviewOutcome?: string | null,
  held = false,
): AllowedActions {
  if (!isOpenStatus(reviewStatus)) return NONE;
  const resolve = (RESOLVE_ACTIONS[changeReason] ?? []).filter((a) => {
    if (a === 'defer' && reviewStatus === 'deferred') return false;          // already deferred
    const produces = ACTION_OPEN_OUTCOME[a];
    return !(produces && produces === reviewOutcome);                       // already recorded
  });
  return {
    // The ONLY route to publishing a new entry. Never for comparison/edition
    // rows, and never for a deferred row (approve requires 'pending').
    publish: changeReason === 'NEW_GUIDELINE' && reviewStatus === 'pending' && !held,
    reject: true,
    rejectNeedsConfirmation: isOpenFollowUp(reviewOutcome),
    resolve: [...resolve],
  };
}

export interface ResolveActionMeta {
  label: string;
  /** True when the action closes the row (status → resolved or deferred stays open). */
  closes: boolean;
  /** What the editor is told the action does — never implies publication. */
  effect: string;
}

export const RESOLVE_ACTION_META: Record<ResolveAction, ResolveActionMeta> = {
  'same-document': {
    label: 'Same document',
    closes: true,
    effect: 'Closes this item as the document already catalogued. Nothing is published and the catalogue is not changed.',
  },
  'no-action': {
    label: 'No action needed',
    closes: true,
    effect: 'Closes this item with no change. Nothing is published and the catalogue is not changed.',
  },
  acknowledged: {
    label: 'Acknowledge',
    closes: true,
    effect: 'Closes this item as a routine link-token change. Nothing is published and the catalogue is not changed.',
  },
  'different-document': {
    label: 'Different document',
    closes: false,
    effect: 'Records that this is a separate document. The item STAYS OPEN, awaiting re-filing; nothing is published.',
  },
  'new-edition': {
    label: 'New edition',
    closes: false,
    effect: 'Records that this is a new edition. The item STAYS OPEN, awaiting a revision path; nothing is published.',
  },
  'needs-document-check': {
    label: 'Needs document check',
    closes: false,
    effect: 'Flags the document for a check. The item STAYS OPEN; nothing is published.',
  },
  defer: {
    label: 'Defer',
    closes: false,
    effect: 'Moves the item to Deferred. It stays open and visible; nothing is published.',
  },
};

export const OUTCOME_LABELS: Record<string, string> = {
  'different-document-awaiting-refiling': 'Open follow-up: different document, awaiting re-filing',
  'new-edition-awaiting-revision': 'Open follow-up: new edition, awaiting a revision path',
  'needs-document-check': 'Open follow-up: needs a document check',
  'same-document': 'Resolved: same document',
  'no-action': 'Resolved: no action',
  acknowledged: 'Resolved: acknowledged',
};

export function outcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  return OUTCOME_LABELS[outcome] ?? outcome;
}

/** Split open rows into the two groups the dashboard shows, preserving order. */
export function groupOpenRows<T extends { reviewStatus?: ReviewStatus }>(rows: T[]): { pending: T[]; deferred: T[] } {
  return {
    pending: rows.filter((r) => r.reviewStatus === 'pending'),
    deferred: rows.filter((r) => r.reviewStatus === 'deferred'),
  };
}

/** A candidate id filed under a derived id after a candidate-id collision. */
export function isCollisionFiledId(candidateId: string): boolean {
  return /~[0-9a-f]{12}$/.test(candidateId);
}
