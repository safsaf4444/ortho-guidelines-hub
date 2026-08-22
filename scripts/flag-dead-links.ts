/**
 * scripts/flag-dead-links.ts
 * ──────────────────────────
 * Standalone, manually-run dead-link report for the Orthopaedic Guidelines Hub.
 *
 * What it does:
 *   1. Pulls every guideline from Supabase and checks every URL in its
 *      `versions[]` array with a lightweight HTTP *status* check (HEAD, falling
 *      back to GET) — it does NOT download/hash page content. This is
 *      deliberately lighter-weight than scripts/detect-changes.ts, which fetches
 *      full page text to detect content changes.
 *   2. Classifies each URL as:
 *        - OK            → 2xx/3xx response
 *        - DEAD          → 404/500-class, timeout, or DNS/connection failure
 *        - KNOWN-BLOCKED → its domain is already in scripts/blocked-sources.json
 *          (e.g. OTS/BASK) — reported separately as "known-blocked, not
 *          necessarily dead" so a bot-challenge/401 isn't re-flagged as broken.
 *   3. Prints a console summary (OK / dead / known-blocked counts) and writes a
 *      timestamped CSV report to reports/.
 *
 * It writes NOTHING to the database and changes NO UI — it's a report Safa runs
 * by hand before an editorial cleanup pass.
 *
 * Run:  npm run flag-dead-links
 * Requires .env.local: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon).
 *
 * NOTE: the fetch/timeout/hostname helpers here intentionally mirror the ones in
 * scripts/detect-changes.ts rather than importing them — that module runs its
 * `main()` on import and reads env at module load, and it's out of scope to
 * modify. Re-implementing the few small helpers is safer than triggering its
 * side effects.
 */
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '\n❌ Missing environment variables.\n' +
      'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local\n',
  );
  process.exit(1);
}

const supabase = createClient(url, key);

const BLOCKED_SOURCES_PATH = join(process.cwd(), 'scripts', 'blocked-sources.json');
const REPORTS_DIR = join(process.cwd(), 'reports');
const FETCH_TIMEOUT_MS = 15_000;

type VersionLink = { label?: string; url?: string; date?: string };
type GuidelineRow = { id: string; topic: string; source: string; versions: VersionLink[] | null };

type Verdict = 'OK' | 'DEAD' | 'KNOWN-BLOCKED';
interface Result {
  id: string;
  topic: string;
  source: string;
  label: string;
  url: string;
  domain: string;
  verdict: Verdict;
  detail: string; // HTTP status or failure reason
}

// ── helpers (mirrored from detect-changes.ts, see note above) ────────────────

function hostnameOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function statusCheck(u: string, timeoutMs: number): Promise<{ ok: boolean; detail: string }> {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (compatible; OrthoGuidelinesHubBot/1.0; +https://safsaf4444.github.io/ortho-guidelines-hub/)',
  };

  const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(u, { method, headers, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt('HEAD');
    // Some servers reject/mishandle HEAD (405/501, or a 4xx that a GET wouldn't
    // give) — fall back to a GET before calling a link dead.
    if (res.status === 405 || res.status === 501 || (res.status >= 400 && res.status !== 404)) {
      res = await attempt('GET');
    }
    return { ok: res.ok || (res.status >= 300 && res.status < 400), detail: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError → timeout; everything else here is DNS/connection-level.
    const reason = /abort/i.test(msg) ? `timeout (>${timeoutMs}ms)` : `network/DNS: ${msg}`;
    return { ok: false, detail: reason };
  }
}

function csvCell(v: string): string {
  // Standard CSV quoting: wrap in quotes and double any embedded quotes.
  return `"${String(v).replace(/"/g, '""')}"`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const blockedRaw = existsSync(BLOCKED_SOURCES_PATH)
    ? (JSON.parse(readFileSync(BLOCKED_SOURCES_PATH, 'utf-8')) as { domains?: { domain: string }[] })
    : { domains: [] };
  const blockedDomains = new Set(
    (blockedRaw.domains ?? []).map((d) => d.domain).filter((d) => d && !d.startsWith('PLACEHOLDER')),
  );

  console.log('\n📥  Fetching guidelines from Supabase…');
  const { data, error } = await supabase.from('guidelines').select('id, topic, source, versions');
  if (error) {
    console.error('❌ Failed to read guidelines table:', error.message);
    process.exit(1);
  }
  const rows = (data as GuidelineRow[]) ?? [];
  console.log(`✅  ${rows.length} guidelines. Checking URLs…\n`);

  const results: Result[] = [];
  for (const row of rows) {
    const urls = (row.versions ?? [])
      .map((v) => ({ label: v.label ?? '', url: v.url ?? '' }))
      .filter((v) => v.url && v.url !== '#');

    for (const { label, url: link } of urls) {
      const domain = hostnameOf(link) ?? '';

      if (domain && blockedDomains.has(domain)) {
        results.push({ id: row.id, topic: row.topic, source: row.source, label, url: link, domain, verdict: 'KNOWN-BLOCKED', detail: 'domain in blocked-sources.json' });
        process.stdout.write('▪');
        continue;
      }

      const { ok, detail } = await statusCheck(link, FETCH_TIMEOUT_MS);
      results.push({ id: row.id, topic: row.topic, source: row.source, label, url: link, domain, verdict: ok ? 'OK' : 'DEAD', detail });
      process.stdout.write(ok ? '.' : '✗');
    }
  }
  process.stdout.write('\n');

  const ok = results.filter((r) => r.verdict === 'OK');
  const dead = results.filter((r) => r.verdict === 'DEAD');
  const blocked = results.filter((r) => r.verdict === 'KNOWN-BLOCKED');

  // ── CSV report ──
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = join(REPORTS_DIR, `dead-links-${stamp}.csv`);
  const header = ['guideline_id', 'topic', 'source', 'link_label', 'url', 'domain', 'verdict', 'detail'];
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push([r.id, r.topic, r.source, r.label, r.url, r.domain, r.verdict, r.detail].map(csvCell).join(','));
  }
  writeFileSync(csvPath, lines.join('\n') + '\n', 'utf-8');

  // ── console summary ──
  console.log('\n──────── Dead-link report ────────');
  console.log(`  Total URLs checked : ${results.length}`);
  console.log(`  ✅ OK              : ${ok.length}`);
  console.log(`  ✗  DEAD            : ${dead.length}`);
  console.log(`  ▪  KNOWN-BLOCKED   : ${blocked.length}  (not necessarily dead — skipped by design)`);
  console.log(`  CSV report         : ${csvPath}`);

  if (dead.length > 0) {
    console.log('\n  Dead links:');
    for (const r of dead) console.log(`   - [${r.id}] ${r.detail}  ${r.url}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
