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
import { createHash, randomUUID } from 'node:crypto';
import { makeRevisionCandidateId } from './lib/ingestion.js';
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

/**
 * Stable identifier for this run, used to make observation evidence idempotent.
 *
 * `staged_detections` is UNIQUE on (staged_id, detection_run_id), so a run that
 * is retried after a partial failure re-observes without appending duplicate
 * evidence, while a genuinely new run does append. GITHUB_RUN_ID is reused
 * across a workflow's attempts, which is exactly the grouping wanted; locally a
 * per-process uuid keeps repeated manual runs distinguishable.
 */
const RUN_ID = process.env.GITHUB_RUN_ID?.trim() || `local-${randomUUID()}`;

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

/**
 * Route one detected change into the website's review queue.
 *
 * Returns true only when the queue has durably recorded this observation. The
 * caller uses that to decide whether the baseline hash may advance: a staging
 * failure MUST leave the baseline alone, so the same change is detected again
 * next run rather than being lost to a transient error.
 *
 * Nothing here interprets the change. The queue is told which URL moved, from
 * which hash to which, and when. No page text is stored and nothing is sent
 * anywhere for analysis.
 */
async function stageDetectedChange(
  row: GuidelineRow,
  url: string,
  baselineHash: string | null,
  observedHash: string,
  observedAt: string,
  httpStatus: number | null,
  textLength: number | null
): Promise<boolean> {
  const candidateId = makeRevisionCandidateId({
    guidelineId: row.id,
    changedUrl: url,
    observedHash,
    provider: row.source ?? row.id,
  });

  const { data, error } = await supabase.rpc('stage_detected_change', {
    p_candidate_id: candidateId,
    p_guideline_id: row.id,
    p_changed_url: url,
    p_provider: row.source ?? row.id,
    p_provider_name: row.source ?? null,
    p_topic: row.topic ?? row.id,
    p_baseline_hash: baselineHash,
    p_observed_hash: observedHash,
    p_observed_at: observedAt,
    p_run_id: RUN_ID,
    p_http_status: httpStatus,
    p_text_length: textLength,
  });

  if (error) {
    console.error(
      `  STAGING FAILED for [${row.id}] ${url} — baseline NOT advanced, ` +
        `so this change will be detected again next run: ${error.message}` +
        (error.code ? ` (${error.code})` : '')
    );
    return false;
  }

  const action = (data as { action?: string } | null)?.action ?? 'unknown';
  console.log(`  queued [${row.id}] ${url} -> ${action} (${candidateId})`);
  return true;
}

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

  // Matches what scripts/blocked-sources.json actually holds. The type was
  // previously just { domain: string }, so every append needed a suppression
  // directive to get past the fields the file has carried since it was seeded.
  // reason/added/source are optional because hand-added entries do not always
  // fill them in.
  type BlockedDomain = {
    domain: string;
    reason?: string;
    added?: string;
    source?: 'manual' | 'auto';
  };
  const blocked = loadJson<{ domains: BlockedDomain[] }>(BLOCKED_SOURCES_PATH, { domains: [] });
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
  let staged = 0;
  let stagingFailures = 0;
  let baselinesHeldBack = 0;

  for (const row of (rows as GuidelineRow[]) ?? []) {
    // ADJUST THIS if your `versions` JSONB shape uses different key names --
    // this assumes an array of { label, url, date } as written by upsert-verified.ts.
    const urls = (row.versions ?? [])
      .map((v) => v.url)
      .filter((u): u is string => Boolean(u));

    if (urls.length === 0) continue;

    const existingHashes = row.content_hashes ?? {};
    // Only the keys this run actually confirmed. Sent to advance_content_hashes(),
    // which MERGES them server-side — not a whole-object replacement, so a hash
    // another writer advanced for a different URL is not discarded.
    const hashPatch: Record<string, string> = {};
    let rowTouched = false;
    // The most recent observation behind this patch. Passed to
    // advance_content_hashes(), which refuses a key whose stored hash was
    // observed LATER than this — so a run that started earlier and finished
    // later cannot drag a baseline backwards.
    let latestObservedAt = new Date(0).toISOString();

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

        // A URL whose content is unchanged, or that has no baseline yet, has
        // nothing to queue — its hash advances unconditionally.
        let mayAdvance = true;

        if (oldHash && oldHash !== newHash) {
          changed++;
          if (DRY_RUN) {
            console.log(
              `  [dry-run] change detected, issue NOT created: [${row.id}] ${url}\n` +
                `            ${oldHash.slice(0, 12)} -> ${newHash.slice(0, 12)}`
            );
            // Nothing was persisted, so nothing may advance either.
            mayAdvance = false;
          } else {
            // GitHub issue behaviour is UNCHANGED — still opened exactly as
            // before, independently of the queue write.
            await openIssue(row, url, oldHash, newHash);

            // THE BASELINE MOVES ONLY IF THE QUEUE RECORDED THE CHANGE.
            // Advancing it after a staging failure would lose the detection:
            // the next run would compare against the new hash, see no
            // difference, and the change would never reach review.
            const queued = await stageDetectedChange(
              row, url, oldHash, newHash, new Date().toISOString(),
              res.status, text.length
            );
            if (queued) {
              staged++;
            } else {
              stagingFailures++;
              baselinesHeldBack++;
              mayAdvance = false;
            }
          }
        }

        if (mayAdvance) {
          hashPatch[url] = newHash;
          rowTouched = true;
          const seenAt = new Date().toISOString();
          if (seenAt > latestObservedAt) latestObservedAt = seenAt;
        }
      } catch (err) {
        failStreaks[url] = (failStreaks[url] ?? 0) + 1;
        console.warn(`  fetch failed (${failStreaks[url]}/${FAILS_BEFORE_BLOCKING}): ${url} -- ${err}`);

        if (failStreaks[url] >= FAILS_BEFORE_BLOCKING && domain) {
          blocked.domains.push({
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
        // Merge, not replace. The previous code wrote back a whole object built
        // from the copy read at the start of this row, which discarded any hash
        // another writer had advanced for a different URL in the meantime.
        // advance_content_hashes() applies `||` server-side and touches no
        // catalogue content field.
        const { data: advanceResult, error: advanceError } = await supabase.rpc('advance_content_hashes', {
          p_guideline_id: row.id,
          p_hashes: hashPatch,
          p_observed_at: latestObservedAt,
          p_checked_on: new Date().toISOString().slice(0, 10),
        });
        const staleKeys = (advanceResult as { rejected_as_stale?: string[] } | null)?.rejected_as_stale;
        if (staleKeys && staleKeys.length > 0) {
          // Another run observed this URL more recently. Its hash stands; ours
          // is discarded rather than regressing the baseline.
          console.log(
            `  ${staleKeys.length} hash(es) for ${row.id} were rejected as stale — a more ` +
              `recent run already advanced them: ${staleKeys.join(', ')}`
          );
        }
        if (advanceError) {
          // Nothing advanced, so every change this row queued will be detected
          // again next run. Staging is idempotent, so the retry adds no
          // duplicate candidate.
          stagingFailures++;
          console.error(
            `  HASH ADVANCE FAILED for row ${row.id} — baselines unchanged, ` +
              `changes will be re-detected: ${advanceError.message}`
          );
        }
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
    `Done. Checked ${checked} URLs. ${changed} change(s) detected, ${staged} queued for review. ` +
      `${skippedBlocked} skip(s) for known-blocked domains. ${newlyBlocked} domain(s) newly blocked this run.`
  );

  if (stagingFailures > 0) {
    // Exit non-zero so a partial failure is visible in the workflow rather than
    // looking like a healthy run. No detection is lost — the baselines for the
    // affected URLs were deliberately held back, so the next run re-detects.
    console.error(
      `
${stagingFailures} queue write(s) failed. ${baselinesHeldBack} baseline hash(es) ` +
        `held back on purpose so the change is re-detected next run. Nothing was lost; ` +
        `this run is NOT a clean pass.`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
