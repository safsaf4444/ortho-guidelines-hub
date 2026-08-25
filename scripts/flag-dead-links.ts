/**
 * scripts/flag-dead-links.ts
 * ──────────────────────────
 * Standalone dead-link report for the Orthopaedic Guidelines Hub. Runs by hand
 * (`npm run flag-dead-links`) or weekly via .github/workflows/dead-link-check.yml.
 *
 * What it does:
 *   1. Reads every guideline from the STATIC dataset (src/data/guidelines-data.ts)
 *      and checks every URL in its `versions[]` array with a lightweight HTTP
 *      *status* check (HEAD, falling back to GET). It does NOT download/hash page
 *      content — that is scripts/detect-changes.ts's job.
 *   2. Classifies each URL into one of the verdicts below.
 *   3. Prints a console summary and writes a timestamped CSV to reports/.
 *
 * ─── READ-ONLY BY CONSTRUCTION ──────────────────────────────────────────────
 * There is NO Supabase client in this file and no credentials are read, so the
 * checker cannot reach the database even by accident. The single filesystem
 * write is the CSV under reports/, which is gitignored. It never modifies
 * scripts/blocked-sources.json, guideline data, any git-tracked file, GitHub, or
 * Supabase.
 *
 * Data source note: the static dataset is regenerated from the database by
 * `npm run export-static`, so it mirrors Supabase without needing secrets. If a
 * report looks stale, re-run export-static first.
 *
 * Verdicts:
 *   OK             2xx or 3xx
 *   CLIENT_ERROR   4xx, except 401/403/429
 *   SERVER_ERROR   5xx
 *   TIMEOUT        request aborted on the timeout
 *   DNS_FAILURE    DNS/connection-level failure
 *   BLOCKED_WAF    401/403/429, or a recognisable WAF/bot-challenge response.
 *                  Reported separately because a bot-block is NOT proof the link
 *                  is dead — GIRFT and baskonline.com both load fine in a browser.
 *   KNOWN_BLOCKED  domain already listed in scripts/blocked-sources.json; short
 *                  circuited with NO request made.
 *
 * Politeness: requests to the same hostname are spaced by at least
 * MIN_HOST_GAP_MS. One retry (after RETRY_DELAY_MS) is made for TIMEOUT,
 * DNS_FAILURE and SERVER_ERROR only — never for 4xx, and never for a WAF block,
 * where retrying makes the block worse.
 *
 * Exit code is 0 even when dead links are found: this is a report, not a gate.
 */
import { join } from 'path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

import { GUIDELINES_DATA } from '../src/data/guidelines-data';

const BLOCKED_SOURCES_PATH = join(process.cwd(), 'scripts', 'blocked-sources.json');
const REPORTS_DIR = join(process.cwd(), 'reports');
const FETCH_TIMEOUT_MS = 15_000;
const MIN_HOST_GAP_MS = 1_000;
const RETRY_DELAY_MS = 2_000;
const MAX_ATTEMPTS = 2; // one initial attempt + at most one retry

export type Verdict =
  | 'OK'
  | 'CLIENT_ERROR'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'DNS_FAILURE'
  | 'BLOCKED_WAF'
  | 'KNOWN_BLOCKED';

export interface Result {
  id: string;
  topic: string;
  source: string;
  label: string;
  url: string;
  domain: string;
  verdict: Verdict;
  httpStatus: string; // numeric status, or '' when no response was received
  detail: string;
  attempts: number;
}

// ── pure helpers ─────────────────────────────────────────────────────────────

export function hostnameOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** 401/403/429 are treated as WAF/bot blocks rather than plain client errors. */
const WAF_STATUSES = new Set([401, 403, 429]);

/**
 * Recognises a WAF/bot challenge from response headers. Only consulted for
 * error statuses — a 200 served through Cloudflare is just a normal page, and
 * most of these providers sit behind a CDN.
 */
export function looksLikeWaf(status: number, headers?: Headers): boolean {
  if (WAF_STATUSES.has(status)) return true;
  if (status < 400 || !headers) return false;
  // Cloudflare returns 503 for its "Just a moment…" interstitial.
  if (headers.get('cf-ray')) return true;
  const server = (headers.get('server') ?? '').toLowerCase();
  if (server.includes('cloudflare') || server.includes('akamai')) return true;
  if (headers.get('x-sucuri-id') || headers.get('x-akamai-transformed')) return true;
  return false;
}

export function classifyHttpStatus(status: number, headers?: Headers): Verdict {
  if (status >= 200 && status < 400) return 'OK';
  if (looksLikeWaf(status, headers)) return 'BLOCKED_WAF';
  if (status >= 500) return 'SERVER_ERROR';
  if (status >= 400) return 'CLIENT_ERROR';
  return 'CLIENT_ERROR';
}

/** Only transient classes are retried. 4xx and WAF blocks never are. */
export function isRetryableVerdict(v: Verdict): boolean {
  return v === 'TIMEOUT' || v === 'DNS_FAILURE' || v === 'SERVER_ERROR';
}

export function csvCell(v: string): string {
  // Standard CSV quoting: wrap in quotes and double any embedded quotes.
  return `"${String(v).replace(/"/g, '""')}"`;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Enforces a minimum gap between requests to the same hostname. Different hosts
 * are unaffected by each other, so a slow provider cannot stall the whole sweep.
 */
export class HostRateLimiter {
  private last = new Map<string, number>();

  constructor(
    private readonly minGapMs: number = MIN_HOST_GAP_MS,
    private readonly now: () => number = () => Date.now(),
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async acquire(host: string): Promise<number> {
    const prev = this.last.get(host);
    const t = this.now();
    let waited = 0;
    if (prev !== undefined) {
      const due = prev + this.minGapMs;
      if (due > t) {
        waited = due - t;
        await this.wait(waited);
      }
    }
    this.last.set(host, this.now());
    return waited;
  }
}

// ── URL check ────────────────────────────────────────────────────────────────

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface CheckDeps {
  fetchImpl?: Fetcher;
  waitImpl?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface CheckOutcome {
  verdict: Verdict;
  httpStatus: string;
  detail: string;
  attempts: number;
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; OrthoGuidelinesHubBot/1.0; +https://safsaf4444.github.io/ortho-guidelines-hub/)';

/**
 * Single attempt: HEAD first, falling back to GET when a server mishandles HEAD.
 * Returns a verdict plus the raw status/detail for the report.
 */
async function attemptOnce(url: string, deps: Required<Pick<CheckDeps, 'fetchImpl' | 'timeoutMs'>>): Promise<CheckOutcome> {
  const { fetchImpl, timeoutMs } = deps;
  const headers = { 'User-Agent': USER_AGENT };

  const run = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { method, headers, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await run('HEAD');
    // Some servers reject/mishandle HEAD (405/501, or a 4xx a GET would not
    // give) — fall back to GET before calling a link broken.
    if (res.status === 405 || res.status === 501 || (res.status >= 400 && res.status !== 404)) {
      res = await run('GET');
    }
    const verdict = classifyHttpStatus(res.status, res.headers);
    return { verdict, httpStatus: String(res.status), detail: `HTTP ${res.status}`, attempts: 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError → our timeout fired; anything else here is DNS/connection level.
    if (/abort/i.test(msg)) {
      return { verdict: 'TIMEOUT', httpStatus: '', detail: `timeout (>${timeoutMs}ms)`, attempts: 1 };
    }
    return { verdict: 'DNS_FAILURE', httpStatus: '', detail: `network/DNS: ${msg}`, attempts: 1 };
  }
}

/** Runs attemptOnce, retrying at most once for transient failures. */
export async function checkUrl(url: string, deps: CheckDeps = {}): Promise<CheckOutcome> {
  const resolved = {
    fetchImpl: deps.fetchImpl ?? ((u: string, init: RequestInit) => fetch(u, init)),
    timeoutMs: deps.timeoutMs ?? FETCH_TIMEOUT_MS,
  };
  const wait = deps.waitImpl ?? sleep;

  let out = await attemptOnce(url, resolved);
  if (isRetryableVerdict(out.verdict) && MAX_ATTEMPTS > 1) {
    await wait(RETRY_DELAY_MS);
    const retry = await attemptOnce(url, resolved);
    out = { ...retry, attempts: 2, detail: `${retry.detail} (after 1 retry; first: ${out.detail})` };
  }
  return out;
}

// ── blocked domains (read-only) ──────────────────────────────────────────────

export function loadBlockedDomains(): Set<string> {
  if (!existsSync(BLOCKED_SOURCES_PATH)) {
    console.warn('⚠️  scripts/blocked-sources.json not found — known-blocked short circuit is DISABLED.');
    return new Set();
  }
  const raw = JSON.parse(readFileSync(BLOCKED_SOURCES_PATH, 'utf-8')) as {
    domains?: { domain: string }[];
  };
  return new Set(
    (raw.domains ?? []).map((d) => d.domain).filter((d) => d && !d.startsWith('PLACEHOLDER')),
  );
}

// ── report ───────────────────────────────────────────────────────────────────

export function buildCsv(results: Result[]): string {
  const header = [
    'guideline_id', 'topic', 'source', 'link_label', 'url', 'domain',
    'verdict', 'http_status', 'detail', 'attempts',
  ];
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push(
      [r.id, r.topic, r.source, r.label, r.url, r.domain, r.verdict, r.httpStatus, r.detail, String(r.attempts)]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

const ALL_VERDICTS: Verdict[] = [
  'OK', 'CLIENT_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'DNS_FAILURE', 'BLOCKED_WAF', 'KNOWN_BLOCKED',
];

export function tally(results: Result[]): Record<Verdict, number> {
  const t = Object.fromEntries(ALL_VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const r of results) t[r.verdict]++;
  return t;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const blockedDomains = loadBlockedDomains();

  console.log(`\n📥  Loaded ${GUIDELINES_DATA.length} guidelines from the static dataset (no database access).`);
  console.log(`▪  ${blockedDomains.size} known-blocked domain(s) will be short-circuited without a request.`);
  console.log(`⏱  Minimum ${MIN_HOST_GAP_MS}ms between requests to the same host; 1 retry for transient failures.\n`);

  const limiter = new HostRateLimiter();
  const results: Result[] = [];

  for (const row of GUIDELINES_DATA) {
    const links = (row.versions ?? [])
      .map((v) => ({ label: v.label ?? '', url: v.url ?? '' }))
      .filter((v) => v.url && v.url !== '#');

    for (const { label, url } of links) {
      const domain = hostnameOf(url) ?? '';
      const base = { id: row.id, topic: row.topic, source: row.source, label, url, domain };

      if (domain && blockedDomains.has(domain)) {
        results.push({
          ...base,
          verdict: 'KNOWN_BLOCKED',
          httpStatus: '',
          detail: 'domain in blocked-sources.json — no request made',
          attempts: 0,
        });
        process.stdout.write('▪');
        continue;
      }

      if (domain) await limiter.acquire(domain);
      const outcome = await checkUrl(url);
      results.push({ ...base, ...outcome });
      process.stdout.write(outcome.verdict === 'OK' ? '.' : outcome.verdict === 'BLOCKED_WAF' ? 'w' : '✗');
    }
  }
  process.stdout.write('\n');

  // ── CSV report (the only file this script writes; reports/ is gitignored) ──
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = join(REPORTS_DIR, `dead-links-${stamp}.csv`);
  writeFileSync(csvPath, buildCsv(results), 'utf-8');

  const t = tally(results);
  console.log('\n──────── Dead-link report ────────');
  console.log(`  Total URLs checked : ${results.length}`);
  for (const v of ALL_VERDICTS) console.log(`  ${v.padEnd(14)} : ${t[v]}`);
  console.log(`  CSV report         : ${csvPath}`);

  const problems = results.filter(
    (r) => r.verdict === 'CLIENT_ERROR' || r.verdict === 'SERVER_ERROR' || r.verdict === 'TIMEOUT' || r.verdict === 'DNS_FAILURE',
  );
  if (problems.length > 0) {
    console.log('\n  Unreachable links:');
    for (const r of problems) console.log(`   - [${r.id}] ${r.verdict} ${r.detail}  ${r.url}`);
  }

  const waf = results.filter((r) => r.verdict === 'BLOCKED_WAF');
  if (waf.length > 0) {
    console.log('\n  WAF/bot-blocked (NOT proof the link is dead — verify in a browser):');
    for (const r of waf) console.log(`   - [${r.id}] ${r.detail}  ${r.url}`);
  }
  console.log('');
  // Deliberately no non-zero exit: finding dead links is a reportable result,
  // not a build failure.
}

// ESM-safe entrypoint guard. Without this, importing any helper from this module
// (e.g. from a test) would start a full live sweep — the exact hazard called out
// in scripts/detect-changes.ts.
const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
