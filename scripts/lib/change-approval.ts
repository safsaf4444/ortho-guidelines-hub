/**
 * scripts/lib/change-approval.ts
 * ──────────────────────────────
 * Pure decision logic for scripts/approve-change.ts — what an owner's
 * "approve" or "reject" comment on a `pending-guideline-update` issue may
 * change. No network, no database, no environment: every input is passed in,
 * so scripts/tests/editorial-workflow.test.ts can pin each rule.
 *
 * ─── WHAT "APPROVE" MEANS (SAF-20) ───────────────────────────────────────────
 *
 * An "approve" comment is an EDITORIAL ACKNOWLEDGEMENT: a human opened the
 * page and judged that the detected content change is real. It is not:
 *   - a link check — nobody's comment can make a URL reachable;
 *   - a clinical review of the new content;
 *   - an update of the catalogue entry (summary, version, guidance status).
 *
 * Before this module, approval wrote link_verification_status = 'verified'
 * with today's date and no request to the link at all. The UI labels that
 * value "Reachable — the link responded when last checked automatically", so
 * the card asserted an automated check that never ran.
 *
 * Now: approval runs the SAME checker as the weekly dead-link report
 * (flag-dead-links.ts checkUrl) against the issue's URL, and maps its verdict
 * with the SAME mapping (map-link-status.ts verdictToStatus). The verification
 * fields are written only when that mapping says 'verified' (a 2xx at the URL
 * the catalogue names). Every other verdict — failure, timeout, redirect to a
 * different document, WAF block — writes nothing to them: one fetch at
 * approval time is not allowed to overwrite a human's earlier verdict. The
 * acknowledgement itself is recorded on the issue either way.
 */
import type { CheckOutcome } from '../flag-dead-links';
import { verdictToStatus } from '../map-link-status';

export type CommentAction = 'approve' | 'reject';

/** Exact comment bodies only (trimmed, case-insensitive). Anything else is ignored. */
export function parseCommentAction(raw: string | undefined): CommentAction | null {
  const body = (raw ?? '').trim().toLowerCase();
  return body === 'approve' || body === 'reject' ? body : null;
}

/** The only parts of a GitHub issue the approval script reads. */
export interface GitHubIssue {
  body: string;
  /** 'open' | 'closed'. A closed issue has already been processed. */
  state: string;
}

/**
 * Narrows an untyped GitHub API response to the issue shape the script needs.
 *
 * Throws instead of defaulting: a malformed response that silently produced an
 * empty body would make the approval a quiet no-op on a green workflow run.
 */
export function asIssue(value: unknown, context: string): GitHubIssue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `${context}: expected a JSON object from the GitHub API, got `
        + `${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}.`,
    );
  }
  const { body, state } = value as { body?: unknown; state?: unknown };
  if (body === null || body === undefined) {
    throw new Error(
      `${context}: the issue has an empty body, so it carries no approval metadata `
        + '(Row ID / URL). Refusing to continue rather than applying nothing silently.',
    );
  }
  if (typeof body !== 'string') {
    throw new Error(`${context}: expected the issue "body" to be a string, got ${typeof body}.`);
  }
  if (typeof state !== 'string') {
    throw new Error(`${context}: expected the issue "state" to be a string, got ${typeof state}.`);
  }
  return { body, state };
}

/**
 * Reads a backticked value after a label, e.g. the machine line detect-changes
 * writes: _Row ID for the approval script: `id` / URL: `https://…`_
 */
export function extractIssueField(issueBody: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = issueBody.match(new RegExp(`${escaped}[:\\s]*\`([^\`]+)\``, 'i'));
  return match ? match[1] : null;
}

/** The row fields the approval script reads back before deciding anything. */
export interface ApprovalRow {
  id: string;
  versions: Array<{ url?: string | null }> | null;
  content_hashes?: Record<string, string> | null;
}

export type Preflight =
  | { ok: true }
  | { ok: false; reason: 'no-row-id' | 'row-not-found' | 'no-url' | 'url-not-on-row'; message: string };

/**
 * Checks that must pass BEFORE any request to the link or write to the row:
 * the row exists, and the URL named in the issue is one of the row's own
 * links (exact string). Issue bodies can be edited by collaborators and go
 * stale when a row's links change; acting on a URL the row does not hold would
 * check — and then stamp — the wrong document.
 */
export function preflightChangeAction(
  rowId: string | null,
  url: string | null,
  row: ApprovalRow | null,
): Preflight {
  if (!rowId) {
    return { ok: false, reason: 'no-row-id', message: 'No row ID was found in this issue, so nothing was changed. Make the change by hand if it is needed.' };
  }
  if (!row) {
    return { ok: false, reason: 'row-not-found', message: `Row \`${rowId}\` was not found in the catalogue, so nothing was changed. It may have been renamed or removed since this issue was opened.` };
  }
  if (!url) {
    return { ok: false, reason: 'no-url', message: 'No URL was found in this issue, so the link could not be identified and nothing was changed.' };
  }
  const links = (row.versions ?? []).map((v) => v?.url).filter((u): u is string => typeof u === 'string');
  if (!links.includes(url)) {
    return {
      ok: false,
      reason: 'url-not-on-row',
      message: `The URL in this issue is not one of row \`${rowId}\`'s links any more, so nothing was changed. `
        + 'The issue may be stale (the row\'s links were edited) or its body was changed.',
    };
  }
  return { ok: true };
}

/** What an approval writes to the row, if anything. */
export interface VerificationWrite {
  link_verification_status: 'verified';
  link_last_verified: string;
  link_verification_notes: string;
}

export type ApprovalPlan =
  | { kind: 'write'; patch: VerificationWrite; changelog: string; comment: string }
  | { kind: 'acknowledge-only'; comment: string };

/**
 * Decides an approval from the outcome of a REAL link check. Never called
 * without one — there is no code path that writes verification fields from
 * the comment alone.
 */
export function planApproval(input: {
  rowId: string;
  url: string;
  check: CheckOutcome;
  author: string;
  issueNumber: string;
  today: string; // YYYY-MM-DD
}): ApprovalPlan {
  const { rowId, url, check, author, issueNumber, today } = input;
  const ack = `Content change acknowledged by @${author} via issue #${issueNumber}`;
  if (verdictToStatus(check.verdict) === 'verified') {
    return {
      kind: 'write',
      patch: {
        link_verification_status: 'verified',
        link_last_verified: today,
        link_verification_notes:
          `Automated reachability check passed at approval on ${today} (${check.detail}). `
          + `${ack}. This records that the link answered; it is not a clinical review and does not update the entry's content.`,
      },
      changelog:
        `Link marked reachable on ${today}: an automated check of ${url} passed when @${author} acknowledged `
        + `an auto-detected content change (issue #${issueNumber}). The entry's content was not changed.`,
      comment:
        `Acknowledged by @${author}. An automated check of the link passed (${check.detail}), so row \`${rowId}\` `
        + `is now marked **reachable** with today's date. This is a reachability record only: the catalogue entry's `
        + 'summary, version and guidance status were NOT changed — edit the entry if the guidance itself changed.',
    };
  }
  return {
    kind: 'acknowledge-only',
    comment:
      `Acknowledged by @${author}, but the automated check of the link did not pass `
      + `(${check.verdict}: ${check.detail}). The link was NOT marked reachable and row \`${rowId}\` was not changed. `
      + 'Check the link by hand (or wait for the weekly dead-link report) and set its status in the app.',
  };
}

/**
 * The content_hashes object a "reject" writes: the flagged URL's hash removed,
 * every other hash kept. Returns null when there is nothing to remove, so the
 * caller writes nothing at all.
 */
export function hashesAfterReject(
  hashes: Record<string, string> | null | undefined,
  url: string,
): Record<string, string> | null {
  if (!hashes || !Object.prototype.hasOwnProperty.call(hashes, url)) return null;
  const next = { ...hashes };
  delete next[url];
  return next;
}
