/**
 * scripts/approve-change.ts
 *
 * Runs when the owner comments "approve" or "reject" on an auto-opened
 * "[Guideline update] ..." issue. Triggered by .github/workflows/approve-change.yml,
 * which passes the issue number and the comment body in as env vars.
 *
 * On "approve": an EDITORIAL ACKNOWLEDGEMENT that the detected change is real.
 *   The issue's URL is checked NOW with the weekly dead-link checker; only if
 *   that check passes is the row marked reachable (link_verification_status
 *   'verified', today's date, a note saying exactly what was checked), with a
 *   changelog entry. A failed, timed-out or redirected check changes nothing in
 *   the row. Either way the issue is closed with a comment saying which.
 *   Approval never edits the entry's content or guidance status. See
 *   scripts/lib/change-approval.ts for the rules and why (SAF-20).
 * On "reject": clears the stored hash for the flagged URL (so the next real
 *   change still flags) and closes the issue. No verification change.
 *
 * Refuses, without writing, when: the issue is already closed (a re-delivered
 * or second comment), the row does not exist, or the issue's URL is not one of
 * the row's links. An update that matches no row is a failure, never reported
 * as success.
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN,
 * GITHUB_REPOSITORY, ISSUE_NUMBER, COMMENT_BODY, COMMENT_AUTHOR.
 */

import { createClient } from '@supabase/supabase-js';
import { checkUrl } from './flag-dead-links';
import {
  asIssue,
  extractIssueField,
  hashesAfterReject,
  parseCommentAction,
  planApproval,
  preflightChangeAction,
  type ApprovalRow,
} from './lib/change-approval';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY!;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER!;
const COMMENT_BODY = process.env.COMMENT_BODY ?? '';
const COMMENT_AUTHOR = process.env.COMMENT_AUTHOR ?? 'unknown';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function githubRequest(pathAndQuery: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`https://api.github.com${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${init.method || 'GET'} ${pathAndQuery} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function comment(message: string) {
  await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: message }),
  });
}

async function commentAndClose(message: string) {
  await comment(message);
  await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}

/**
 * UPDATE one row by id and confirm exactly one row changed. PostgREST answers
 * an UPDATE that matches nothing with success and zero rows, so without the
 * read-back a missing row would be reported as updated.
 */
async function updateOneRow(rowId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('guidelines').update(patch).eq('id', rowId).select('id');
  if (error) throw new Error(`database update failed: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`database update matched ${Array.isArray(data) ? data.length : 'an unknown number of'} row(s) for \`${rowId}\`, expected exactly 1; treated as failed.`);
  }
}

async function main() {
  const action = parseCommentAction(COMMENT_BODY);
  if (!action) {
    console.log(`Comment was not exactly "approve" or "reject" -- nothing to do.`);
    return;
  }

  const issue = asIssue(
    await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}`),
    `issue #${ISSUE_NUMBER}`,
  );

  // Idempotency: the first decision closes the issue. A second comment, or a
  // re-delivered webhook, on a closed issue must not run the action again.
  if (issue.state !== 'open') {
    console.log(`Issue #${ISSUE_NUMBER} is ${issue.state}; it was already processed. Nothing done.`);
    return;
  }

  const rowId = extractIssueField(issue.body, 'Row ID for the approval script');
  const url = extractIssueField(issue.body, 'URL');

  let row: ApprovalRow | null = null;
  if (rowId) {
    const { data, error } = await supabase
      .from('guidelines')
      .select('id, versions, content_hashes')
      .eq('id', rowId)
      .maybeSingle();
    if (error) throw new Error(`could not read row \`${rowId}\`: ${error.message}`);
    row = (data as ApprovalRow | null) ?? null;
  }

  const pre = preflightChangeAction(rowId, url, row);
  if (!pre.ok) {
    // Left OPEN: a human needs to look, and closing would hide that.
    await comment(`${pre.message} (requested by @${COMMENT_AUTHOR})`);
    console.error(`Refused: ${pre.reason}`);
    process.exitCode = 1;
    return;
  }
  // preflight guarantees all three.
  const id = rowId!;
  const link = url!;
  const found = row!;

  if (action === 'reject') {
    const next = hashesAfterReject(found.content_hashes, link);
    if (next) await updateOneRow(id, { content_hashes: next });
    await commentAndClose(
      `Marked as a false positive by @${COMMENT_AUTHOR}. ${next ? 'The stored hash for this URL was cleared so the next real change still flags. ' : ''}`
        + 'No link-status or content change was made.',
    );
    return;
  }

  // approve: a real check of the link, then a decision from its verdict.
  const check = await checkUrl(link);
  console.log(`Link check for ${link}: ${check.verdict} (${check.detail})`);
  const plan = planApproval({
    rowId: id,
    url: link,
    check,
    author: COMMENT_AUTHOR,
    issueNumber: ISSUE_NUMBER,
    today: new Date().toISOString().slice(0, 10),
  });

  if (plan.kind === 'acknowledge-only') {
    await commentAndClose(plan.comment);
    return;
  }

  await updateOneRow(id, { ...plan.patch });
  const { error: noteError } = await supabase
    .from('guideline_changelog')
    .insert({ guideline_id: id, description: plan.changelog });
  if (noteError) {
    // The status write landed; its audit entry did not. Said loudly, left open.
    await comment(
      `Row \`${id}\` WAS marked reachable, but writing its changelog entry failed: ${noteError.message}. `
        + 'Add the change note by hand.',
    );
    process.exitCode = 1;
    return;
  }
  await commentAndClose(plan.comment);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await comment(`Something went wrong running the approval script: ${err instanceof Error ? err.message : String(err)}. Nothing further was changed. Please check manually.`);
  } catch {
    /* ignore secondary failure */
  }
  process.exitCode = 1;
});
