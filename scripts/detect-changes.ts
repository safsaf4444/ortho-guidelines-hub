/**
 * scripts/detect-changes.ts
 *
 * Weekly change-detection sweep for the Orthopaedic Guidelines Hub.
 *
 * What it does:
 *   1. Pulls every row from the `guidelines` table in Supabase.
 *   2. For every URL attached to that row (primary + fallback + any version links),
 *      fetches the page and hashes its visible text.
 *   3. Compares that hash to the one stored in `content_hashes` from last run.
 *      - No change -> does nothing.
 *      - Changed -> opens a GitHub Issue labelled `pending-guideline-update` describing
 *        what changed, so a human (Safa) can review and approve/reject it.
 *      - Fails 3 runs in a row (401/403/timeout/etc.) -> gets added to
 *        scripts/blocked-sources.json and skipped on future runs.
 *
 * Run manually with:   npx tsx scripts/detect-changes.ts
 * Runs automatically via .github/workflows/detect-changes.yml
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN (auto-set in Actions),
 * GITHUB_REPOSITORY (auto-set in Actions, e.g. "safsaf4444/ortho-guidelines-hub").
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// ---- config -----------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY!; // "owner/repo"

/**
 * Verification mode. Set by the workflow from its `dry_run` dispatch input.
 *
 * Only the exact string "true" (case-insensitive) enables it. The schedule
 * trigger has no such input, so DRY_RUN arrives empty and this is false —
 * scheduled runs keep their existing write behaviour unchanged.
 *
 * When enabled, the run still fetches and compares every source and logs each
 * change it would have acted on, but performs NO external writes: no GitHub
 * issue, no Supabase update, no blocked-sources.json write.
 */
const DRY_RUN = /^true$/i.test(process.env.DRY_RUN ?? '');

const BLOCKED_SOURCES_PATH = path.join(process.cwd(), 'scripts', 'blocked-sources.json');
const FAIL_STREAK_PATH = path.join(process.cwd(), 'scripts', '.fail-streak-cache.json'); // transient, gitignored is fine
const FAILS_BEFORE_BLOCKING = 3;
const FETCH_TIMEOUT_MS = 15_000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- helpers ------------------------------------------------------------

type VersionLink = { label?: string; url?: string; date?: string };

type GuidelineRow = {
  id: string;
  topic: string;
  source: string;
  versions: VersionLink[] | null;
  content_hashes: Record<string, string> | null;
};

function loadJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: unknown) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  // Deliberately simple: strip script/style blocks, tags, collapse whitespace.
  // Not perfect (won't ignore ads/timestamps), but good enough for v1 --
  // see README_SETUP.md's "honest limitations" section.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; OrthoGuidelinesHubBot/1.0; +https://safsaf4444.github.io/ortho-guidelines-hub/)',
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

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

async function ensureLabelExists() {
  try {
    await githubRequest(`/repos/${GITHUB_REPOSITORY}/labels/pending-guideline-update`);
  } catch {
    await githubRequest(`/repos/${GITHUB_REPOSITORY}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'pending-guideline-update',
        color: 'fbca04',
        description: 'Auto-detected content change awaiting human approval',
      }),
    }).catch(() => {
      /* label may already exist from a race; ignore */
    });
  }
}

async function openIssue(row: GuidelineRow, url: string, oldHash: string | null, newHash: string) {
  const title = `[Guideline update] ${row.topic} (${row.source})`;
  const body = [
    `**Row ID:** \`${row.id}\``,
    `**Topic:** ${row.topic}`,
    `**Source:** ${row.source}`,
    `**URL that changed:** ${url}`,
    '',
    oldHash
      ? `Content hash changed from \`${oldHash.slice(0, 12)}...\` to \`${newHash.slice(0, 12)}...\`.`
      : `No previous hash on record -- this is the first time this URL has been through the change-detection script.`,
    '',
    '**What to do:**',
    '1. Open the URL above and confirm this is a real content update (not a redesign, cookie banner, or timestamp-only change).',
    '2. If it is a real update, comment `approve` on this issue -- the hub will update itself automatically.',
    '3. If it is NOT a real update (false positive), comment `reject` -- this closes the issue without changing anything, and the hash resets so it won\'t re-flag on an unrelated future change.',
    '',
    `_Row ID for the approval script: \`${row.id}\` / URL: \`${url}\`_`,
  ].join('\n');

  await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      body,
      labels: ['pending-guideline-update'],
    }),
  });
}

// ---- main ----------------------------------------------------------------

async function main() {
  if (DRY_RUN) {
    console.log(
      '=== DRY RUN — verification mode ===\n' +
        'Sources are fetched and compared as normal. No GitHub label, no GitHub\n' +
        'issue, no Supabase update and no blocked-sources.json write will occur.\n'
    );
  }

  // Creates the "pending-guideline-update" label via POST /labels when absent,
  // so it is a GitHub write and is skipped in dry-run.
  if (DRY_RUN) {
    console.log('[dry-run] label check/creation SKIPPED.');
  } else {
    await ensureLabelExists();
  }

  const blocked = loadJson<{ domains: { domain: string }[] }>(BLOCKED_SOURCES_PATH, { domains: [] });
  const blockedDomains = new Set(
    blocked.domains.map((d) => d.domain).filter((d) => !d.startsWith('PLACEHOLDER'))
  );

  const failStreaks = loadJson<Record<string, number>>(FAIL_STREAK_PATH, {});

  const { data: rows, error } = await supabase
    .from('guidelines')
    .select('id, topic, source, versions, content_hashes');

  if (error) {
    console.error('Failed to read guidelines table:', error);
    process.exit(1);
  }

  let checked = 0;
  let changed = 0;
  let skippedBlocked = 0;
  let newlyBlocked = 0;

  for (const row of (rows as GuidelineRow[]) ?? []) {
    // ADJUST THIS if your `versions` JSONB shape uses different key names --
    // this assumes an array of { label, url, date } as written by upsert-verified.ts.
    const urls = (row.versions ?? [])
      .map((v) => v.url)
      .filter((u): u is string => Boolean(u));

    if (urls.length === 0) continue;

    const existingHashes = row.content_hashes ?? {};
    const newHashes: Record<string, string> = { ...existingHashes };
    let rowTouched = false;

    for (const url of urls) {
      const domain = hostnameOf(url);
      if (domain && blockedDomains.has(domain)) {
        skippedBlocked++;
        continue;
      }

      checked++;
      try {
        const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const text = stripHtmlToText(html);
        const newHash = hashText(text);
        const oldHash = existingHashes[url] ?? null;

        failStreaks[url] = 0; // reset on success

        if (oldHash && oldHash !== newHash) {
          changed++;
          if (DRY_RUN) {
            console.log(
              `  [dry-run] change detected, issue NOT created: [${row.id}] ${url}\n` +
                `            ${oldHash.slice(0, 12)} -> ${newHash.slice(0, 12)}`
            );
          } else {
            await openIssue(row, url, oldHash, newHash);
          }
        }

        newHashes[url] = newHash;
        rowTouched = true;
      } catch (err) {
        failStreaks[url] = (failStreaks[url] ?? 0) + 1;
        console.warn(`  fetch failed (${failStreaks[url]}/${FAILS_BEFORE_BLOCKING}): ${url} -- ${err}`);

        if (failStreaks[url] >= FAILS_BEFORE_BLOCKING && domain) {
          blocked.domains.push({
            // @ts-expect-error -- extra fields fine, matches the shape in blocked-sources.json
            domain,
            reason: `Automated fetch failed ${FAILS_BEFORE_BLOCKING} consecutive runs: ${err}`,
            added: new Date().toISOString().slice(0, 10),
            source: 'auto',
          });
          blockedDomains.add(domain);
          newlyBlocked++;
        }
      }
    }

    if (rowTouched) {
      if (DRY_RUN) {
        console.log(`  [dry-run] Supabase update SKIPPED for row ${row.id} (content_hashes, last_change_check)`);
      } else {
        await supabase
          .from('guidelines')
          .update({ content_hashes: newHashes, last_change_check: new Date().toISOString().slice(0, 10) })
          .eq('id', row.id);
      }
    }
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] blocked-sources.json write SKIPPED (${newlyBlocked} domain(s) would have been added).`
    );
    console.log('[dry-run] fail-streak cache write SKIPPED.');
  } else {
    saveJson(BLOCKED_SOURCES_PATH, blocked);
    saveJson(FAIL_STREAK_PATH, failStreaks);
  }

  console.log(
    `Done. Checked ${checked} URLs. ${changed} change(s) flagged for approval. ` +
      `${skippedBlocked} skip(s) for known-blocked domains. ${newlyBlocked} domain(s) newly blocked this run.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
