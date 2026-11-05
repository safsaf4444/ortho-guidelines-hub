/**
 * scripts/lib/monitor-store.ts
 * ────────────────────────────
 * Durable monitoring baselines, INDEPENDENT of the HTTP revalidation cache.
 *
 * Why a separate store: `.discovery-cache/` (scripts/lib/discovery-cache.ts)
 * holds the last body fetched by ANY discovery run. If monitoring used it as
 * "the previous index", a `discover` run between two monitoring runs would
 * overwrite the comparison point and the index change would be lost. So
 * monitoring keeps its own baseline per provider, in `.monitoring-baselines/`
 * by default, and advances it only on a valid observation.
 *
 * Rules (each pinned by scripts/tests/monitor-store.test.ts):
 *   * The first VALID observation is recorded as the initial baseline and is
 *     labelled `initial: true` — it is a starting point, not evidence of
 *     change.
 *   * An observation is valid only when the fetch succeeded (2xx, or a 304
 *     with a trusted prior representation standing in for the body) AND the
 *     parse is structurally valid (at least one item on a surface known to
 *     carry items). A maintenance page, a block page, a template change that
 *     parses to nothing, or a transport error is REJECTED: logged as an
 *     attempt, never promoted to baseline.
 *   * A rejected attempt leaves the previous valid baseline in place, so the
 *     next successful run diffs against the last known-good index and reports
 *     changes that happened during the failures.
 *   * Writes are atomic (temp file + rename), and a store that cannot be
 *     written never fails a read-only run — it is reported.
 *   * Nothing here touches catalogue data, staging or the database.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SurfaceParse } from '../adapters/types';

export const MONITOR_STORE_DIR = '.monitoring-baselines';
const MAX_ATTEMPTS = 50;

export interface MonitorBaseline {
  version: 1;
  provider: string;
  surfaceUrl: string;
  finalUrl: string;
  status: number;
  bodySha256: string;
  /** The HTML as observed, so a later parser can re-read it. */
  html: string;
  /** The parse as the observing parser produced it (for the record). */
  parse: SurfaceParse;
  observedAt: string;
  /** True on the first accepted observation; false once a later one advanced it. */
  initial: boolean;
  /** How many accepted observations this baseline has been advanced by (1 for the initial). */
  acceptedCount: number;
}

export interface MonitorAttempt {
  observedAt: string;
  outcome: 'accepted' | 'rejected';
  reason: string;
  status?: number;
  bodySha256?: string;
  itemsParsed: number;
}

export interface MonitorRecord {
  provider: string;
  baseline: MonitorBaseline | null;
  attempts: MonitorAttempt[];
}

export interface Observation {
  provider: string;
  surfaceUrl: string;
  finalUrl?: string;
  status?: number;
  /** True when the server answered 304 and the cache's stored body was reused. */
  revalidated?: boolean;
  error?: string;
  html: string;
  parse: SurfaceParse;
  observedAt: string;
  /** The surface is known to carry items (default true). */
  expectItems?: boolean;
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function keyFor(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
}

export function recordPath(dir: string, provider: string): string {
  return path.join(dir, `${keyFor(provider)}.json`);
}

export function readMonitorRecord(dir: string, provider: string): MonitorRecord {
  const p = recordPath(dir, provider);
  let text: string;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {provider,baseline:null,attempts:[]};
    throw new Error(`Monitoring baseline for ${provider} is unreadable; preserve it for review rather than resetting history.`);
  }
  let raw: MonitorRecord;
  try { raw = JSON.parse(text) as MonitorRecord; }
  catch { throw new Error(`Monitoring baseline for ${provider} is corrupt; preserve it for review rather than resetting history.`); }
  if (!raw || raw.provider !== provider || !Array.isArray(raw.attempts) || !Object.prototype.hasOwnProperty.call(raw,'baseline')
      || raw.baseline !== null && (typeof raw.baseline !== 'object' || Array.isArray(raw.baseline))) {
    throw new Error(`Monitoring record for ${provider} has an invalid or foreign identity; history was not reset.`);
  }
  if (raw.baseline) {
    const b = raw.baseline;
    if (b.version !== 1 || b.provider !== provider || typeof b.html !== 'string' || typeof b.bodySha256 !== 'string'
        || b.bodySha256 !== sha256(b.html) || !b.parse || !Array.isArray(b.parse.items) || !Array.isArray(b.parse.excluded)
        || !Number.isSafeInteger(b.acceptedCount) || b.acceptedCount < 1) {
      throw new Error(`Monitoring baseline for ${provider} has an unsupported shape or failed integrity check; history was not reset.`);
    }
  }
  return raw;
}

/** Is this observation good enough to become (or advance) the baseline? */
export function assessObservation(obs: Observation): { valid: boolean; reason: string } {
  const expectItems = obs.expectItems !== false;
  if (obs.error) return { valid: false, reason: `fetch failed: ${obs.error}` };
  if (obs.status === 304) {
    if (!obs.revalidated || !obs.html) return { valid: false, reason: 'HTTP 304 with no trusted prior representation: nothing observed' };
  } else if (obs.status !== undefined && (obs.status < 200 || obs.status >= 300)) {
    return { valid: false, reason: `HTTP ${obs.status}` };
  }
  if (!obs.html.trim()) return { valid: false, reason: 'empty body' };
  if (expectItems && obs.parse.items.length === 0) {
    return { valid: false, reason: 'parsed 0 items on a surface known to carry documents (maintenance page, block page or template change)' };
  }
  return { valid: true, reason: obs.status === 304 ? 'HTTP 304: stored representation confirmed unchanged' : `HTTP ${obs.status ?? 200}, ${obs.parse.items.length} item(s)` };
}

export interface RecordOutcome {
  accepted: boolean;
  reason: string;
  /** The baseline that stood BEFORE this observation (what a diff compares against). Null on a first run. */
  previousBaseline: MonitorBaseline | null;
  /** The record as now stored. */
  record: MonitorRecord;
  /** Set when the store could not be written; the run still reports. */
  writeError?: string;
}

/**
 * Assess an observation; if valid, advance the baseline; always log the attempt.
 * Returns the PREVIOUS baseline so the caller can diff against it.
 */
export function recordObservation(dir: string, obs: Observation): RecordOutcome {
  const record = readMonitorRecord(dir, obs.provider);
  const previousBaseline = record.baseline;
  const { valid, reason } = assessObservation(obs);
  const bodySha256 = obs.html ? sha256(obs.html) : undefined;

  record.attempts.push({
    observedAt: obs.observedAt,
    outcome: valid ? 'accepted' : 'rejected',
    reason,
    ...(obs.status !== undefined ? { status: obs.status } : {}),
    ...(bodySha256 ? { bodySha256 } : {}),
    itemsParsed: obs.parse.items.length,
  });
  if (record.attempts.length > MAX_ATTEMPTS) record.attempts = record.attempts.slice(-MAX_ATTEMPTS);

  if (valid) {
    record.baseline = {
      version: 1,
      provider: obs.provider,
      surfaceUrl: obs.surfaceUrl,
      finalUrl: obs.finalUrl ?? obs.surfaceUrl,
      status: obs.status ?? 200,
      bodySha256: bodySha256!,
      html: obs.html,
      parse: obs.parse,
      observedAt: obs.observedAt,
      initial: previousBaseline === null,
      acceptedCount: (previousBaseline?.acceptedCount ?? 0) + 1,
    };
  }

  let writeError: string | undefined;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = recordPath(dir, obs.provider);
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    fs.renameSync(tmp, p);
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err);
  }

  return { accepted: valid, reason, previousBaseline, record, ...(writeError ? { writeError } : {}) };
}
