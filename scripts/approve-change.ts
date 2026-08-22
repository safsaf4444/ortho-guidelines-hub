/**
 * scripts/approve-change.ts
 *
 * Runs when Safa comments "approve" or "reject" on an auto-opened
 * "[Guideline update] ..." issue. Triggered by .github/workflows/approve-change.yml,
 * which passes the issue number and the comment body in as env vars.
 *
 * On "approve": marks the row verified in Supabase with today's date and a note,
 * and closes the issue with a confirmation comment.
 * On "reject": just closes the issue, no database change -- treats it as a false
 * positive so an unrelated future change can still flag normally.
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN,
 * GITHUB_REPOSITORY, ISSUE_NUMBER, COMMENT_BODY, COMMENT_AUTHOR.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY!;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER!;
const COMMENT_BODY = (process.env.COMMENT_BODY ?? '').trim().toLowerCase();
const COMMENT_AUTHOR = process.env.COMMENT_AUTHOR ?? 'unknown';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function githubRequest(pathAndQuery: string, init: RequestInit = {}) {
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

function extractField(issueBody: string, label: string): string | null {
  // Looks for lines like: _Row ID for the approval script: `some-id` / URL: `https://...`_
  const match = issueBody.match(new RegExp(`${label}[:\\s]*\`([^\`]+)\``, 'i'));
  return match ? match[1] : null;
}

async function commentAndClose(message: string) {
  await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: message }),
  });
  await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}

async function main() {
  if (COMMENT_BODY !== 'approve' && COMMENT_BODY !== 'reject') {
    console.log(`Comment was "${COMMENT_BODY}", not "approve" or "reject" -- nothing to do.`);
    return;
  }

  const issue = await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}`);
  const issueBody: string = issue.body ?? '';

  const rowId = extractField(issueBody, 'Row ID for the approval script');
  const url = extractField(issueBody, 'URL');

  if (!rowId) {
    await commentAndClose(
      `Could not find a row ID in this issue's body, so I can't update the database automatically. Please make this change by hand and close this issue.`
    );
    return;
  }

  if (COMMENT_BODY === 'reject') {
    // Clear the stored hash for this URL so the next real change on this row still flags,
    // rather than silently comparing against a hash we now know was a false-positive trigger.
    if (url) {
      const { data: row } = await supabase
        .from('guidelines')
        .select('content_hashes')
        .eq('id', rowId)
        .single();
      if (row?.content_hashes) {
        const updated = { ...row.content_hashes };
        delete updated[url];
        await supabase.from('guidelines').update({ content_hashes: updated }).eq('id', rowId);
      }
    }
    await commentAndClose(`Marked as a false positive by @${COMMENT_AUTHOR}. No database change made.`);
    return;
  }

  // approve
  const { error } = await supabase
    .from('guidelines')
    .update({
      link_verification_status: 'verified',
      link_last_verified: new Date().toISOString().slice(0, 10),
      link_verification_notes: `Auto-detected content change, approved by @${COMMENT_AUTHOR} on ${new Date()
        .toISOString()
        .slice(0, 10)} via issue #${ISSUE_NUMBER}.`,
    })
    .eq('id', rowId);

  if (error) {
    await commentAndClose(`Approval received, but the database update failed: ${error.message}. Please check manually.`);
    return;
  }

  await commentAndClose(`Approved by @${COMMENT_AUTHOR} -- row \`${rowId}\` is now marked verified with today's date. Live.`);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await commentAndClose(`Something went wrong running the approval script: ${err}. Please check manually.`);
  } catch {
    /* ignore secondary failure */
  }
  process.exit(1);
});
