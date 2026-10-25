/**
 * scripts/deploy/apply-migrations.ts
 * ──────────────────────────────────
 * Applies EXACTLY the two recorded review-queue migrations to production
 * (project xutjahmbyrvifcltpxxu), in order, through the Supabase Management
 * API endpoint POST /v1/projects/{ref}/database/migrations, which also records
 * each one in the project's migration history (supabase_migrations).
 *
 *   Dry run (DEFAULT; no network request of any kind):
 *     npx tsx scripts/deploy/apply-migrations.ts
 *
 *   Apply (only with the owner's approval):
 *     npx tsx scripts/deploy/apply-migrations.ts --apply \
 *       --confirm-project xutjahmbyrvifcltpxxu --record-dir C:\Users\safad\OrthoBackups
 *
 *   Inspect history only (read-only GET; e.g. after an uncertain outcome):
 *     npx tsx scripts/deploy/apply-migrations.ts --inspect-history --confirm-project xutjahmbyrvifcltpxxu
 *
 * Guarantees, by construction:
 *   * The SQL is read from the files on disk and must match the SHA-256 values
 *     recorded in the deployment record, byte for byte. It must decode as UTF-8
 *     losslessly, and the JSON body must round-trip to the identical text.
 *   * The access token is read ONLY from a hidden interactive prompt (TTY
 *     required). It is never taken from argv, the environment or a file,
 *     never printed and never written to the record. (A JS string cannot be
 *     wiped; the reference is dropped when the run ends: best-effort.)
 *   * Read-only history check first. If either migration name is already in
 *     the history, nothing is sent.
 *   * Sequential: 20261025 is sent only after 20261024 succeeded AND appears in
 *     the history. No automatic retry, ever.
 *   * Timeout, connection failure, an unexpected status, or a success that does
 *     not appear in the history: STOP. The script then inspects the history
 *     read-only (a GET) and reports; it submits nothing further. Database
 *     state is to be inspected read-only before anything else is attempted.
 *   * Idempotency-Key is sent, but NOT relied on: the API documents it only as
 *     "ensure the same migration is tracked only once", which says nothing
 *     about the SQL not being executed twice.
 *   * A record (no token, no SQL text) is written to --record-dir, which must
 *     be outside the repository and outside OneDrive.
 *
 * Exit: 0 both applied and confirmed in history (or dry run / inspect OK);
 *       1 a migration failed (definitive error response); 2 usage/refusal;
 *       3 UNCERTAIN (timeout, network error, or unconfirmed): inspect first.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_REF = 'xutjahmbyrvifcltpxxu';
const API_BASE = 'https://api.supabase.com';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface MigrationSpec { file: string; name: string; sha256: string }
/** Recorded in C:\Users\safad\OrthoBackups\deployment-record-2026-10-25.md. */
export const MIGRATIONS: MigrationSpec[] = [
  { file: 'supabase/migrations/20261024_discovery_review_queue.sql', name: '20261024_discovery_review_queue',
    sha256: '41e009ba4416c1f87ed0a1578da4675c4055b7c4683819423252087c0cc72105' },
  { file: 'supabase/migrations/20261025_reject_open_candidate.sql', name: '20261025_reject_open_candidate',
    sha256: 'ab456853549fe488ca7c01ff85dd69342723e55d5141d7d09459d7b5120ca04b' },
];
const POST_TIMEOUT_MS = 180_000;
const GET_TIMEOUT_MS = 30_000;

export interface LoadedMigration extends MigrationSpec { bytes: number; sql: string; body: string; idempotencyKey: string }

/** Reads and verifies one migration; throws on any mismatch. */
export function loadMigration(spec: MigrationSpec, repo = REPO): LoadedMigration {
  const buf = fs.readFileSync(path.join(repo, spec.file));
  const hash = createHash('sha256').update(buf).digest('hex');
  if (hash !== spec.sha256) throw new Error(`${spec.file}: sha256 ${hash} does not match the recorded ${spec.sha256}`);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) throw new Error(`${spec.file}: starts with a UTF-8 BOM`);
  const sql = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  if (!Buffer.from(sql, 'utf-8').equals(buf)) throw new Error(`${spec.file}: UTF-8 round-trip is not lossless`);
  const body = JSON.stringify({ query: sql, name: spec.name });
  const back = JSON.parse(body) as { query: string; name: string };
  if (back.query !== sql || back.name !== spec.name) throw new Error(`${spec.file}: JSON body does not round-trip`);
  return { ...spec, bytes: buf.length, sql, body, idempotencyKey: `ortho-${spec.name}-${spec.sha256.slice(0, 32)}` };
}

type Http = { kind: 'response'; status: number; text: string; requestId: string | null }
  | { kind: 'timeout' | 'network'; message: string };

async function request(base: string, token: string, method: 'GET' | 'POST', urlPath: string, timeoutMs: number,
  body?: string, extraHeaders: Record<string, string> = {}): Promise<Http> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${urlPath}`, {
      method, signal: ac.signal, body,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...extraHeaders },
    });
    const text = await res.text();
    return { kind: 'response', status: res.status, text, requestId: res.headers.get('x-request-id') ?? res.headers.get('sb-request-id') };
  } catch (e) {
    return { kind: ac.signal.aborted ? 'timeout' : 'network', message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

interface HistoryRow { version: string; name: string | null }
async function readHistory(base: string, token: string, timeoutMs = GET_TIMEOUT_MS): Promise<{ ok: true; rows: HistoryRow[] } | { ok: false; detail: string }> {
  const r = await request(base, token, 'GET', `/v1/projects/${PROJECT_REF}/database/migrations`, timeoutMs);
  if (r.kind !== 'response') return { ok: false, detail: `${r.kind}: ${r.message}` };
  if (r.status !== 200) return { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 500)}` };
  try {
    const rows = JSON.parse(r.text) as Array<{ version?: unknown; name?: unknown }>;
    if (!Array.isArray(rows)) return { ok: false, detail: 'history response is not an array' };
    return { ok: true, rows: rows.map((x) => ({ version: String(x.version), name: x.name == null ? null : String(x.name) })) };
  } catch {
    return { ok: false, detail: `history response is not JSON: ${r.text.slice(0, 200)}` };
  }
}

export interface StepRecord {
  name: string; file: string; sha256: string; bytes: number; idempotencyKey: string;
  outcome: 'applied-and-recorded' | 'failed' | 'uncertain' | 'not-sent';
  http?: { status?: number; requestId?: string | null; transport?: string; body?: string };
  historyAfter?: { version: string; name: string | null } | string;
  startedUtc?: string; finishedUtc?: string;
}
export interface ApplyResult { exitCode: 0 | 1 | 2 | 3; steps: StepRecord[]; historyBefore: HistoryRow[] | string; historyAfter?: HistoryRow[] | string; summary: string }

/** The apply sequence. `base` is the API origin (a constant in production; a local fake in tests). */
export async function applyAll(base: string, token: string, migrations: LoadedMigration[], log: (s: string) => void = console.log,
  timeouts: { postMs: number; getMs: number } = { postMs: POST_TIMEOUT_MS, getMs: GET_TIMEOUT_MS }): Promise<ApplyResult> {
  const steps: StepRecord[] = migrations.map((m) => ({ name: m.name, file: m.file, sha256: m.sha256, bytes: m.bytes, idempotencyKey: m.idempotencyKey, outcome: 'not-sent' }));
  const before = await readHistory(base, token, timeouts.getMs);
  if (!before.ok) return { exitCode: 2, steps, historyBefore: before.detail, summary: `could not read the migration history (read-only GET): ${before.detail}. Nothing was sent.` };
  log(`[apply] migration history before: ${before.rows.length} entries (latest ${before.rows.at(-1)?.version ?? 'none'})`);
  const present = migrations.filter((m) => before.rows.some((r) => r.name === m.name));
  if (present.length > 0) {
    return { exitCode: 2, steps, historyBefore: before.rows, summary: `already in the migration history: ${present.map((p) => p.name).join(', ')}. Nothing was sent; inspect read-only.` };
  }
  let known = before.rows;
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i];
    const step = steps[i];
    step.startedUtc = new Date().toISOString();
    log(`[apply] sending ${m.name} (${m.bytes} bytes, sha256 ${m.sha256})`);
    const r = await request(base, token, 'POST', `/v1/projects/${PROJECT_REF}/database/migrations`, timeouts.postMs, m.body, { 'Idempotency-Key': m.idempotencyKey });
    step.finishedUtc = new Date().toISOString();
    // Whatever happened, look (read-only) at what the history now says.
    const after = await readHistory(base, token, timeouts.getMs);
    const newRows = after.ok ? after.rows.filter((x) => !known.some((k) => k.version === x.version)) : [];
    const mine = newRows.filter((x) => x.name === m.name);
    step.historyAfter = !after.ok ? `history unreadable: ${after.detail}` : mine.length === 1 ? mine[0] : `${mine.length} new history entries named ${m.name}; new entries: ${JSON.stringify(newRows)}`;
    if (r.kind !== 'response') {
      step.outcome = 'uncertain';
      step.http = { transport: `${r.kind}: ${r.message}` };
      return { exitCode: 3, steps, historyBefore: before.rows, historyAfter: after.ok ? after.rows : after.detail,
        summary: `UNCERTAIN: ${m.name} got no response (${r.kind}). History now: ${JSON.stringify(step.historyAfter)}. STOPPED; nothing further sent. Inspect history and database state read-only before any further submission.` };
    }
    step.http = { status: r.status, requestId: r.requestId, body: r.text.slice(0, 2000) };
    if (r.status < 200 || r.status >= 300) {
      step.outcome = 'failed';
      return { exitCode: mine.length === 0 ? 1 : 3, steps, historyBefore: before.rows, historyAfter: after.ok ? after.rows : after.detail,
        summary: `${m.name} was refused: HTTP ${r.status} ${r.text.slice(0, 500)}. History ${mine.length === 0 ? 'has no entry for it' : 'NEVERTHELESS shows an entry'}. STOPPED; nothing further sent.` };
    }
    if (!after.ok || mine.length !== 1) {
      step.outcome = 'uncertain';
      return { exitCode: 3, steps, historyBefore: before.rows, historyAfter: after.ok ? after.rows : after.detail,
        summary: `UNCERTAIN: ${m.name} returned HTTP ${r.status}, but the history does not show exactly one new entry for it (${JSON.stringify(step.historyAfter)}). STOPPED; inspect read-only.` };
    }
    step.outcome = 'applied-and-recorded';
    log(`[apply] ${m.name}: HTTP ${r.status}; recorded in history as version ${mine[0].version}`);
    known = after.rows;
  }
  return { exitCode: 0, steps, historyBefore: before.rows, historyAfter: known, summary: 'both migrations applied and recorded in the migration history, in order' };
}

/** Hidden prompt: nothing echoed. Requires an interactive terminal. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return Promise.reject(new Error('an interactive terminal is required for the hidden token prompt'));
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    let buf = '';
    const finish = (err?: Error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      if (err) reject(err); else resolve(buf);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { finish(); return; }
        if (ch === '\u0003') { finish(new Error('cancelled')); return; }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        if (ch >= ' ') buf += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

function insideForbidden(dir: string): string | null {
  const d = path.resolve(dir).toLowerCase();
  const bad = [REPO, process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter((x): x is string => !!x);
  for (const b of bad) { const bb = path.resolve(b).toLowerCase(); if (d === bb || d.startsWith(bb + path.sep)) return b; }
  return /[\\/]onedrive( - [^\\/]+)?([\\/]|$)/i.test(d) ? 'a OneDrive folder' : null;
}

export async function main(argv: string[]): Promise<number> {
  let apply = false;
  let inspect = false;
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--inspect-history') inspect = true;
    else if (a === '--confirm-project' || a === '--record-dir') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) { console.error(`[apply] ${a} needs a value`); return 2; }
      values[a] = v;
    } else { console.error(`[apply] unknown argument: ${a}`); return 2; }
  }
  const arg = (k: string) => values[k];
  if (apply && inspect) { console.error('[apply] --apply and --inspect-history are exclusive'); return 2; }

  let migrations: LoadedMigration[];
  try { migrations = MIGRATIONS.map((m) => loadMigration(m)); } catch (e) { console.error(`[apply] REFUSED: ${(e as Error).message}`); return 2; }

  if (!apply && !inspect) {
    console.log('=== DRY RUN: no network request is made ===');
    console.log(`project       ${PROJECT_REF}`);
    console.log(`history check GET  ${API_BASE}/v1/projects/${PROJECT_REF}/database/migrations   (read-only, before and after each step)`);
    console.log(`apply         POST ${API_BASE}/v1/projects/${PROJECT_REF}/database/migrations   (sequential, no retry, timeout ${POST_TIMEOUT_MS / 1000}s)`);
    console.log('headers       Authorization: Bearer <token: hidden prompt, REDACTED>; Content-Type: application/json; charset=utf-8; Idempotency-Key: <below>');
    for (const [i, m] of migrations.entries()) {
      console.log(`\nstep ${i + 1}: ${m.file}`);
      console.log(`  sha256         ${m.sha256}   (matches the deployment record)`);
      console.log(`  bytes          ${m.bytes}   (UTF-8, no BOM, lossless; JSON round-trip identical)`);
      console.log(`  Idempotency-Key ${m.idempotencyKey}   (sent; NOT relied on)`);
      console.log(`  body           {"query": "<${m.bytes} bytes of ${path.basename(m.file)}, sha256 ${m.sha256.slice(0, 12)}…>", "name": "${m.name}"}   (${Buffer.byteLength(m.body)} bytes as JSON)`);
      console.log(`  first line     ${m.sql.split('\n')[0]}`);
    }
    console.log('\nstop rules: history already lists either name → send nothing; any non-2xx, timeout or network error → stop, read history, send nothing further;');
    console.log('            2xx without exactly one new history entry of that name → stop as UNCERTAIN.');
    return 0;
  }

  if (arg('--confirm-project') !== PROJECT_REF) { console.error(`[apply] REFUSED: pass --confirm-project ${PROJECT_REF}`); return 2; }
  let token = '';
  try { token = (await promptHidden(`Supabase access token for project ${PROJECT_REF} (not shown): `)).trim(); } catch (e) { console.error(`[apply] ${(e as Error).message}; nothing sent`); return 2; }
  if (!token || /\s/.test(token)) { console.error('[apply] empty or malformed token; nothing sent'); return 2; }

  if (inspect) {
    const h = await readHistory(API_BASE, token);
    token = '';
    if (!h.ok) { console.error(`[apply] history unreadable: ${h.detail}`); return 3; }
    for (const r of h.rows) console.log(`  ${r.version}  ${r.name ?? ''}`);
    return 0;
  }

  const recordDir = arg('--record-dir');
  if (!recordDir || !fs.existsSync(recordDir)) { token = ''; console.error('[apply] REFUSED: --record-dir must name an existing folder'); return 2; }
  const forbidden = insideForbidden(recordDir);
  if (forbidden) { token = ''; console.error(`[apply] REFUSED: --record-dir is inside ${forbidden}`); return 2; }

  const started = new Date().toISOString();
  const result = await applyAll(API_BASE, token, migrations);
  token = '';
  const recordFile = path.join(recordDir, `migration-apply-${started.replace(/[-:.]/g, '')}.json`);
  fs.writeFileSync(recordFile, JSON.stringify({ project: PROJECT_REF, startedUtc: started, finishedUtc: new Date().toISOString(),
    endpoint: `POST ${API_BASE}/v1/projects/${PROJECT_REF}/database/migrations`, ...result }, null, 2));
  console.log(`[apply] ${result.summary}`);
  console.log(`[apply] record: ${recordFile} (no token, no SQL text)`);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    console.error('[apply] unexpected failure:', err instanceof Error ? err.message : String(err));
    process.exitCode = 3;
  });
}
