/**
 * scripts/tests/local-supabase/stack.ts
 * ─────────────────────────────────────
 * The disposable local Supabase stack used by the review-queue tests
 * (integration, browser e2e, upgrade rehearsal). LOCAL ONLY.
 *
 *   * The stack is the Supabase CLI project in ./supabase (project id
 *     `ortho-disc-test`, API on 127.0.0.1:54321), started with only the
 *     database, REST API and auth services.
 *   * Every key comes from `supabase status` for THAT project: the local demo
 *     keys. Nothing reads .env or .env.local, and localEnv() refuses anything
 *     that is not a loopback URL.
 *   * Work files (logs, the rehearsal's copies of old scripts, screenshots) go
 *     to ./.work, which is gitignored.
 *
 * See README.md in this directory.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../..');
export const WORK = path.join(HERE, '.work');

/** Pinned CLI version: the one every recorded run used. */
export const SUPABASE_CLI = 'supabase@2.119.0';
export const PROJECT_ID = 'ortho-disc-test';
export const CONTAINER = `supabase_db_${PROJECT_ID}`;
const EXCLUDED_SERVICES = 'studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,supavisor,postgres-meta';

/** supabase/REBUILD-ORDER.md, then the two 20261012 migrations: production's state before the upgrade. */
export const BASE_CHAIN = [
  'supabase-schema.sql',
  'supabase-migration-readonly-lockdown.sql',
  'supabase-migration-add-changelog-with-rls.sql',
  'supabase-migration-add-content-hash.sql',
  'supabase-migration-editorial-metadata.sql',
  'supabase-migration-extend-link-verification-states.sql',
  'supabase-migration-public-write-access.sql',
  'supabase-migration-soft-delete-and-mandatory-notes.sql',
  'supabase/migrations/20261011_create_staging_and_editor_roles.sql',
  'supabase/migrations/20261012_approve_guard_null_safe.sql',
  'supabase/migrations/20261012_reject_staged_candidate.sql',
];
export const M24 = 'supabase/migrations/20261024_discovery_review_queue.sql';
export const M25 = 'supabase/migrations/20261025_reject_open_candidate.sql';

/**
 * Runs the pinned Supabase CLI with this directory as its project. Through a
 * shell on Windows (npx is a .cmd there); every argument is a plain token and
 * the project is chosen by cwd, so nothing with spaces is passed.
 */
function supabaseCli(args: string[]): SpawnSyncReturns<string> {
  if (process.platform === 'win32') {
    if (args.some((a) => !/^[\w.,@=-]+$/.test(a))) throw new Error(`unsafe CLI argument: ${args.join(' ')}`);
    return spawnSync(['npx', '-y', SUPABASE_CLI, ...args].join(' '), { cwd: HERE, encoding: 'utf-8', shell: true });
  }
  return spawnSync('npx', ['-y', SUPABASE_CLI, ...args], { cwd: HERE, encoding: 'utf-8' });
}

export function dockerAvailable(): boolean {
  return spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf-8' }).status === 0;
}

export function stackRunning(): boolean {
  const r = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf-8' });
  return (r.stdout ?? '').split('\n').some((n) => n.trim() === CONTAINER);
}

/** Starts the stack if needed, else resets its database: either way, an empty database. */
export function freshDatabase(): void {
  const r = stackRunning()
    ? supabaseCli(['db', 'reset'])
    : supabaseCli(['start', '-x', EXCLUDED_SERVICES]);
  if (r.status !== 0) throw new Error(`supabase ${stackRunning() ? 'db reset' : 'start'} failed:\n${r.stdout}${r.stderr}`);
}

export interface PsqlResult { out: string; err: string; status: number | null }

/** psql inside the database container, as postgres. `readOnly` forces a read-only session. */
export function psql(sql: string, opts: { readOnly?: boolean; vars?: Record<string, string> } = {}): PsqlResult {
  const args = ['exec', '-i',
    ...(opts.readOnly ? ['-e', 'PGOPTIONS=-c default_transaction_read_only=on'] : []),
    CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q',
    ...Object.entries(opts.vars ?? {}).flatMap(([k, v]) => ['-v', `${k}=${v}`])];
  const r = spawnSync('docker', args, { input: sql, encoding: 'utf-8' });
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), status: r.status };
}

export function applyFile(rel: string, opts: { readOnly?: boolean; vars?: Record<string, string> } = {}): PsqlResult {
  return psql(fs.readFileSync(path.join(REPO, rel), 'utf-8'), opts);
}

/**
 * An empty database with production's pre-upgrade schema, then optionally
 * 20261024 and 20261025. Throws on the first file that fails to apply.
 */
export function prepareSchema(opts: { with24: boolean; with25: boolean }): void {
  freshDatabase();
  const files = [...BASE_CHAIN, ...(opts.with24 ? [M24] : []), ...(opts.with25 ? [M25] : [])];
  for (const f of files) {
    const r = applyFile(f);
    if (r.status !== 0) throw new Error(`applying ${f} failed:\n${r.err.slice(-1200)}`);
  }
}

export interface LocalEnv { url: string; anonKey: string; serviceKey: string }

/** The stack's URL and demo keys, from `supabase status`. Refuses a non-loopback URL. */
export function localEnv(): LocalEnv {
  const r = supabaseCli(['status', '-o', 'env']);
  const get = (k: string) => (r.stdout ?? '').split('\n').find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim().replace(/^"|"$/g, '') ?? '';
  const env = { url: get('API_URL'), anonKey: get('ANON_KEY'), serviceKey: get('SERVICE_ROLE_KEY') };
  let host = '';
  try { host = new URL(env.url).hostname; } catch { /* below */ }
  if (!['127.0.0.1', 'localhost'].includes(host) || !env.anonKey || !env.serviceKey) {
    throw new Error(`Refusing: the local stack did not report a loopback API URL and keys (got "${env.url}"). Is it running?`);
  }
  return env;
}

/** The variables the tests read. */
export function testEnv(env: LocalEnv): Record<string, string> {
  return {
    LOCAL_SUPABASE_URL: env.url,
    LOCAL_SUPABASE_ANON_KEY: env.anonKey,
    LOCAL_SUPABASE_SERVICE_KEY: env.serviceKey,
    LOCAL_DB_CONTAINER: CONTAINER,
  };
}

/** Stops the stack and deletes its data. Returns what is left (should be all zero). */
export function stopStack(): { containers: number; volumes: number; networks: number } {
  supabaseCli(['stop', '--no-backup']);
  const count = (args: string[]) => (spawnSync('docker', args, { encoding: 'utf-8' }).stdout ?? '')
    .split('\n').filter((l) => l.includes(PROJECT_ID)).length;
  return {
    containers: count(['ps', '-a', '--format', '{{.Names}}']),
    volumes: count(['volume', 'ls', '--format', '{{.Name}}']),
    networks: count(['network', 'ls', '--format', '{{.Name}}']),
  };
}

/** Shared test bookkeeping. */
export function makeChecks() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean, detail = '') => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  };
  const eq = (name: string, actual: unknown, expected: unknown) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  return { check, eq, fail: () => { fail++; }, counts: () => ({ pass, fail }) };
}

/** Loopback check for env passed in by the runner. */
export function requireLoopbackEnv(): LocalEnv {
  const url = process.env.LOCAL_SUPABASE_URL ?? '';
  const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY ?? '';
  const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY ?? '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* below */ }
  if (!['127.0.0.1', 'localhost'].includes(host) || !anonKey || !serviceKey) {
    console.error('Refusing: LOCAL_SUPABASE_URL must be a loopback URL and both keys set. Run via run.ts.');
    process.exit(2);
  }
  return { url, anonKey, serviceKey };
}
