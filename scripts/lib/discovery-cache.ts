/**
 * scripts/lib/discovery-cache.ts
 * ───────────────────────────────
 * ONE cache design, stated once and applied everywhere.
 *
 * ─── WHAT THIS IS, PRECISELY ────────────────────────────────────────────────
 *
 * A VALIDATOR AND BODY STORE on local disk. It is NOT a response
 * short-circuit, and there is deliberately no code path in which a cache entry
 * prevents a request.
 *
 *   Every sweep issues a request for every surface of every fetchable
 *   provider, on every run, without exception.
 *
 * What the cache changes is only what that request CARRIES and what we can
 * compare the answer to:
 *
 *   - a stored `ETag`/`Last-Modified` lets the request be conditional, so the
 *     provider can answer 304 and send no body;
 *   - a stored body hash lets a 200 be compared against what we last saw.
 *
 * ─── WHY ON DISK, AND WHY THAT MATTERS ──────────────────────────────────────
 *
 * A process-only cache cannot revalidate anything across runs: each run starts
 * cold, sends no validators, and has nothing to compare a body against. Any
 * claim of "cross-run revalidation" on top of in-memory state would be false.
 *
 * So the store is a directory of JSON files under CACHE_DIR, written by one
 * run and read by the next. That is what makes `If-None-Match` meaningful here
 * and what makes a token or hash comparison a comparison rather than a first
 * sighting. The directory is gitignored and holds nothing but fetch state.
 *
 * ─── THE ONE LIFETIME RULE ──────────────────────────────────────────────────
 *
 * `MAX_VALIDATOR_AGE_MS` (24h) is the single lifetime in this design and it
 * governs exactly one thing: whether we still TRUST our stored validators.
 *
 *   within the window   send conditional headers; a 304 is accepted as
 *                       "unchanged since we last looked"
 *   past the window     send NO validators and take the full body, even if the
 *                       provider would happily have answered 304
 *
 * The window exists because a validator is the provider's bookkeeping, not
 * ours, and it can be wrong in ways we cannot detect from a 304: a frozen
 * `Last-Modified`, a hash computed over a template rather than content, a CDN
 * serving a stale entity tag. BESS demonstrably reports two different
 * modification times for one page (sitemap lastmod 2026-03-17 vs a live
 * Last-Modified of 2026-09-25), which is exactly the shape of bookkeeping not
 * to trust indefinitely. Past the window we stop relying on it and look for
 * ourselves.
 *
 * There is no second lifetime, no soft TTL, and no stale-while-revalidate
 * behaviour. A 304 means "the provider says this did not change since the
 * validator we sent" and the report says that and nothing more — never
 * "nothing was published".
 *
 * ─── VALIDATOR AVAILABILITY IS A PROPERTY OF THE REQUEST ────────────────────
 *
 * Measured, not assumed, and it cost a wrong claim to find out. A `curl` probe
 * of the BESS surface (which sends no `Accept-Encoding` by default) returned
 * `Last-Modified: Fri, 25 Sep 2026 12:12:00 GMT`. The same URL fetched by this
 * module — Node's `fetch`, which advertises `gzip, deflate, br` — is answered
 * with `content-encoding: br` and NO `Last-Modified` and NO `ETag` at all.
 *
 * So "this host supports conditional requests" is not a fact about the host.
 * It is a fact about a host AND a particular request, and a validator observed
 * with one client may be absent for another.
 *
 * The response here is deliberately NOT to contort the request into
 * `Accept-Encoding: identity` to manufacture a validator: that would trade a
 * compressed transfer for an uncompressed one on every run, costing the
 * publisher bandwidth to buy us a header. Instead a host that offers no
 * validator simply gets an unconditional fetch and a BODY HASH COMPARISON,
 * which is what the stored body is for and which works across runs regardless.
 *
 * What matters is that the report never implies a revalidation that did not
 * happen, so `conditionalSkippedReason` records WHY a request went out
 * unconditionally — nothing stored, nothing offered, or past the window.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/** Cache root. Gitignored. Nothing but fetch state is ever written here. */
export const CACHE_DIR = path.join(process.cwd(), '.discovery-cache');

/**
 * How long a stored validator is trusted. The ONLY lifetime in this design.
 * 24h sits comfortably under any weekly sweep cadence, so a scheduled run
 * normally revalidates nothing older than itself.
 */
export const MAX_VALIDATOR_AGE_MS = 24 * 60 * 60 * 1000;

/** User agent used for every discovery request. Identifies the project honestly. */
export const DISCOVERY_USER_AGENT =
  'Mozilla/5.0 (compatible; OrthoGuidelinesHub/1.0; +read-only guidance discovery)';

/** Per-request ceiling, so one unresponsive host cannot stall a sweep. */
export const REQUEST_TIMEOUT_MS = 30_000;

// ─── Request pacing ─────────────────────────────────────────────────────────
// The sweep issues requests one at a time today, but nothing stopped two
// surfaces on the same host (EBI has two) going out back-to-back, and nothing
// would stop overlapping requests if a later batch ran providers concurrently.
// So:
//
//   * Requests to one host are SERIALISED through a per-host FIFO queue: a
//     request is not even considered until the previous request to that host
//     has been answered or has failed. Concurrent callers therefore cannot both
//     read "last request was long ago" and go out together.
//   * Once at the head of the queue, a request then waits until at least
//     MIN_HOST_INTERVAL_MS has passed since that previous request finished.
//     That sleep is bounded by construction — never longer than the interval.
//   * A failure (network error, timeout, abort) counts as having asked the
//     host, and always releases the queue, so one bad request can neither
//     un-pace the next nor wedge every later request to that host.
//   * Hosts are independent: pacing BOFAS never delays EBI.
//
// Total time before a request is sent is therefore its own (bounded) sleep
// plus however long it queued behind earlier requests to the same host, each of
// which is itself bounded by REQUEST_TIMEOUT_MS.

/** Minimum gap between one request to a host being answered and the next being sent. */
export const MIN_HOST_INTERVAL_MS = 5_000;

interface PacingConfig {
  minIntervalMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const DEFAULT_PACING: PacingConfig = {
  minIntervalMs: MIN_HOST_INTERVAL_MS,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let pacing: PacingConfig = { ...DEFAULT_PACING };
/** Host → when the last request to it was answered or failed (ms, from pacing.now). */
const lastFinishedAt = new Map<string, number>();
/** Host → settles when the most recently queued request to it has finished. Never rejects. */
const hostQueueTail = new Map<string, Promise<void>>();

/** Test hook: swap the clock/sleep (and optionally the interval). */
export function configurePacing(overrides: Partial<PacingConfig>): void {
  pacing = { ...pacing, ...overrides };
}

/** Test hook: restore defaults and forget every host. */
export function resetPacing(): void {
  pacing = { ...DEFAULT_PACING };
  lastFinishedAt.clear();
  hostQueueTail.clear();
}

/**
 * How long a request to `url` would have to sleep if it were at the head of
 * its host's queue now. 0 for a host not yet contacted. Excludes queueing.
 */
export function pacingDelayFor(url: string): number {
  const last = lastFinishedAt.get(new URL(url).host);
  if (last === undefined) return 0;
  const remaining = last + pacing.minIntervalMs - pacing.now();
  return Math.min(Math.max(remaining, 0), pacing.minIntervalMs);
}

/**
 * Run `send` in `url`'s host slot: after every earlier request to the host has
 * finished, and after the pacing sleep. Returns how long the caller waited in
 * total (queue + sleep) alongside `send`'s result.
 */
async function inHostSlot<T>(url: string, send: () => Promise<T>): Promise<{ result: T; waitedMs: number }> {
  const host = new URL(url).host;
  const calledAt = pacing.now();
  const previous = hostQueueTail.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => mine);
  hostQueueTail.set(host, tail);

  await previous;
  try {
    const sleepMs = pacingDelayFor(url);
    if (sleepMs > 0) await pacing.sleep(sleepMs);
    const waitedMs = Math.max(pacing.now() - calledAt, 0);
    try {
      return { result: await send(), waitedMs };
    } finally {
      // Recorded on failure too: a host that errored or timed out has still
      // been asked once, and must not be asked again immediately.
      lastFinishedAt.set(host, pacing.now());
    }
  } finally {
    release();
    if (hostQueueTail.get(host) === tail) hostQueueTail.delete(host);
  }
}

interface CacheEntry {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  etag: string | null;
  lastModified: string | null;
  bodySha256: string;
  body: string;
  /** ISO-8601. When the BODY was last actually received. */
  storedAt: string;
  /** ISO-8601. When a 304 last confirmed the stored body. Null if never. */
  lastRevalidatedAt: string | null;
}

/** What a fetch did, in enough detail for a coverage report to be honest. */
export interface FetchOutcome {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  body: string;
  bodySha256: string;
  /** True when the server answered 304 and the stored body was reused. */
  revalidated: boolean;
  /**
   * How the request was made:
   *   conditional      validators were sent (within the trust window)
   *   unconditional    no validators sent — none stored, or past the window
   */
  requestMode: 'conditional' | 'unconditional';
  /** Which validator(s) were sent, for the report. */
  validatorsSent: string[];
  /** How long this request waited before it was sent: queued behind same-host requests, plus the pacing sleep. */
  pacedMs: number;
  /**
   * Why no validators were sent, when none were. Null on a conditional
   * request. Keeps the report from implying a revalidation that never
   * happened, and distinguishes the three very different causes.
   */
  conditionalSkippedReason:
    | 'no-stored-entry'
    | 'no-validator-offered-by-host'
    | 'stored-validator-past-trust-window'
    | null;
  /** Hash we previously held for this URL, if any. Enables change reporting. */
  previousBodySha256: string | null;
  /** True when a 200 arrived and its hash differs from the stored one. */
  bodyChanged: boolean;
  /** Whether a redirect was followed, and to where. */
  redirected: boolean;
  fetchedAt: string;
  /** Server-reported content length, when present. Not verified by us. */
  reportedContentLength: number | null;
  contentType: string | null;
}

function keyFor(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 40);
}

function entryPath(url: string): string {
  return path.join(CACHE_DIR, `${keyFor(url)}.json`);
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readEntry(url: string): CacheEntry | null {
  try {
    const raw = fs.readFileSync(entryPath(url), 'utf-8');
    const parsed = JSON.parse(raw) as CacheEntry;
    // A truncated or hand-edited entry is treated as absent rather than trusted.
    if (typeof parsed.body !== 'string' || typeof parsed.bodySha256 !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEntry(entry: CacheEntry): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(entryPath(entry.requestedUrl), JSON.stringify(entry, null, 2), 'utf-8');
  } catch (err) {
    // A cache that cannot be written must not fail a read-only sweep. The next
    // run simply starts cold for this URL, which is a slower correct answer and
    // never a wrong one.
    console.warn(`[cache] could not write entry for ${entry.requestedUrl}: ${String(err)}`);
  }
}

function validatorsAreTrusted(entry: CacheEntry, now: number): boolean {
  const storedMs = Date.parse(entry.storedAt);
  if (Number.isNaN(storedMs)) return false;
  return now - storedMs < MAX_VALIDATOR_AGE_MS;
}

/**
 * Fetch a discovery surface, revalidating against the on-disk store.
 *
 * ALWAYS performs a request. Throws on a network failure or a non-OK,
 * non-304 status — a surface that cannot be read is a failure to report, not a
 * quietly empty result.
 */
export async function fetchSurface(url: string): Promise<FetchOutcome> {
  const stored = readEntry(url);
  const now = Date.now();
  const headers: Record<string, string> = { 'User-Agent': DISCOVERY_USER_AGENT };
  const validatorsSent: string[] = [];
  let conditionalSkippedReason: FetchOutcome['conditionalSkippedReason'] = null;

  if (!stored) {
    conditionalSkippedReason = 'no-stored-entry';
  } else if (!validatorsAreTrusted(stored, now)) {
    conditionalSkippedReason = 'stored-validator-past-trust-window';
  } else {
    if (stored.etag) {
      headers['If-None-Match'] = stored.etag;
      validatorsSent.push(`If-None-Match: ${stored.etag}`);
    }
    if (stored.lastModified) {
      headers['If-Modified-Since'] = stored.lastModified;
      validatorsSent.push(`If-Modified-Since: ${stored.lastModified}`);
    }
    if (validatorsSent.length === 0) {
      conditionalSkippedReason = 'no-validator-offered-by-host';
    }
  }

  // The request timeout starts only once this request is actually sent, so
  // time spent queued or pacing never eats into it.
  const { result: res, waitedMs: pacedMs } = await inHostSlot(url, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  });

  const fetchedAt = new Date().toISOString();
  const contentType = res.headers.get('content-type');
  const lengthHeader = res.headers.get('content-length');
  const reportedContentLength = lengthHeader === null ? null : Number.parseInt(lengthHeader, 10);
  const requestMode: 'conditional' | 'unconditional' =
    validatorsSent.length > 0 ? 'conditional' : 'unconditional';

  if (res.status === 304) {
    if (!stored) {
      // A 304 with nothing stored would leave us with no body at all. Treat it
      // as a failure rather than inventing an empty page.
      throw new Error(
        `304 Not Modified from ${url} but no cached body is held — cannot produce content. ` +
          'Delete the cache entry and retry.',
      );
    }
    const refreshed: CacheEntry = { ...stored, lastRevalidatedAt: fetchedAt };
    writeEntry(refreshed);
    return {
      requestedUrl: url,
      finalUrl: stored.finalUrl,
      status: 304,
      body: stored.body,
      bodySha256: stored.bodySha256,
      revalidated: true,
      requestMode,
      validatorsSent,
      pacedMs,
      conditionalSkippedReason,
      previousBodySha256: stored.bodySha256,
      bodyChanged: false,
      redirected: stored.finalUrl !== url,
      fetchedAt,
      reportedContentLength,
      contentType,
    };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }

  const body = await res.text();
  const bodySha256 = sha256(body);
  const finalUrl = res.url || url;

  writeEntry({
    requestedUrl: url,
    finalUrl,
    status: res.status,
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    bodySha256,
    body,
    storedAt: fetchedAt,
    lastRevalidatedAt: null,
  });

  return {
    requestedUrl: url,
    finalUrl,
    status: res.status,
    body,
    bodySha256,
    revalidated: false,
    requestMode,
    validatorsSent,
    pacedMs,
    conditionalSkippedReason,
    previousBodySha256: stored ? stored.bodySha256 : null,
    bodyChanged: stored ? stored.bodySha256 !== bodySha256 : false,
    redirected: finalUrl !== url,
    fetchedAt,
    reportedContentLength,
    contentType,
  };
}

// ─── Volatile token observations ────────────────────────────────────────────
// Separate from the surface store because these are per-DOCUMENT-URL, not
// per-surface, and they are the only thing that makes EDITION_TOKEN_CHANGED a
// comparison rather than a first sighting. Same on-disk discipline and the same
// reasoning: in-memory state could never compare across runs.

const TOKEN_STORE = path.join(CACHE_DIR, 'volatile-tokens.json');

export interface TokenObservation {
  parameter: string;
  value: string;
  observedAt: string;
}

type TokenStore = Record<string, TokenObservation>;

export function readTokenStore(): TokenStore {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf-8')) as TokenStore;
  } catch {
    return {};
  }
}

export function writeTokenStore(store: TokenStore): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_STORE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[cache] could not write volatile-token store: ${String(err)}`);
  }
}
