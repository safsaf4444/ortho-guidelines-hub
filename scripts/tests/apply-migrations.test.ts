/**
 * scripts/tests/apply-migrations.test.ts
 * ──────────────────────────────────────
 * Offline tests for scripts/deploy/apply-migrations.ts against a FAKE
 * Management API on 127.0.0.1. No request ever leaves this machine: the
 * production base URL is a constant inside the script, and these tests call
 * applyAll() with the fake's loopback origin. The dry run and the refusal
 * paths are run with fetch replaced by a tripwire that fails the test if any
 * request is attempted.
 *
 * Run:   npx tsx scripts/tests/apply-migrations.test.ts   (or: npm run test:offline)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { applyAll, loadMigration, main, MIGRATIONS, PROJECT_REF, type LoadedMigration } from '../deploy/apply-migrations';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const eq = (name: string, a: unknown, e: unknown) => check(name, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);

const TOKEN = 'sbp_TEST_ONLY_not_a_real_token_0123456789abcdef';
const migrations: LoadedMigration[] = MIGRATIONS.map((m) => loadMigration(m));

// ── Fake Management API ─────────────────────────────────────────────────────
type Mode = 'ok' | 'fail-first' | 'drop-after-commit' | 'ok-but-unrecorded';
interface Seen { method: string; path: string; auth?: string; idem?: string; ctype?: string; sha?: string; name?: string }
function fakeApi(initial: Array<{ version: string; name: string }>, mode: Mode) {
  const history = [...initial];
  const seen: Seen[] = [];
  let v = 20261025040000;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => {
      const s: Seen = { method: req.method ?? '', path: req.url ?? '', auth: req.headers.authorization, idem: req.headers['idempotency-key'] as string | undefined, ctype: req.headers['content-type'] };
      if (req.url !== `/v1/projects/${PROJECT_REF}/database/migrations`) { res.statusCode = 404; res.end(); return; }
      if (req.method === 'GET') { seen.push(s); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(history)); return; }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { query: string; name: string };
      s.sha = createHash('sha256').update(Buffer.from(body.query, 'utf-8')).digest('hex');
      s.name = body.name;
      seen.push(s);
      const posts = seen.filter((x) => x.method === 'POST').length;
      if (mode === 'fail-first' && posts === 1) { res.statusCode = 500; res.end('{"message":"Failed to apply database migration: synthetic"}'); return; }
      if (mode === 'ok-but-unrecorded') { res.statusCode = 200; res.end('{}'); return; }
      history.push({ version: String(v++), name: body.name });          // "committed"
      if (mode === 'drop-after-commit' && posts === 1) return;            // ...and the answer is never sent
      res.statusCode = 200;
      res.end('{}');
    });
  });
  return { server, seen, history };
}
async function withFake(initial: Array<{ version: string; name: string }>, mode: Mode, run: (base: string) => Promise<void>) {
  const f = fakeApi(initial, mode);
  await new Promise<void>((r) => f.server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(f.server.address() as { port: number }).port}`;
  try { await run(base); } finally { f.server.closeAllConnections(); f.server.close(); }
  return f;
}
const EXISTING = [{ version: '20260910195751', name: 'extend_link_verification_states' }];
const logs: string[] = [];
const log = (s: string) => { logs.push(s); };
const short = { postMs: 1500, getMs: 1500 };
const results: unknown[] = [];

console.log('\nfiles: exact bytes only');
eq('both files match the recorded sha256 and load', migrations.map((m) => m.sha256), MIGRATIONS.map((m) => m.sha256));
check('the JSON body round-trips to the identical SQL', migrations.every((m) => (JSON.parse(m.body) as { query: string }).query === m.sql));
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-mig-'));
  const rel = MIGRATIONS[0].file;
  fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
  const bytes = fs.readFileSync(rel);
  fs.writeFileSync(path.join(tmp, rel), Buffer.concat([bytes, Buffer.from(' ')]));
  let msg = '';
  try { loadMigration(MIGRATIONS[0], tmp); } catch (e) { msg = (e as Error).message; }
  check('a file differing by one byte is refused (sha256 mismatch)', /does not match the recorded/.test(msg), msg);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nsuccess: sequential, exact, recorded');
{
  let r!: Awaited<ReturnType<typeof applyAll>>;
  const f = await withFake(EXISTING, 'ok', async (base) => { r = await applyAll(base, TOKEN, migrations, log, short); results.push(r); });
  const posts = f.seen.filter((s) => s.method === 'POST');
  eq('exit 0, both applied and recorded', [r.exitCode, r.steps.map((s) => s.outcome)], [0, ['applied-and-recorded', 'applied-and-recorded']]);
  eq('two POSTs, in order', posts.map((p) => p.name), MIGRATIONS.map((m) => m.name));
  eq('the server received EXACTLY the recorded bytes (sha256 of the received query)', posts.map((p) => p.sha), MIGRATIONS.map((m) => m.sha256));
  check('history was read before the first POST and after each', f.seen[0].method === 'GET' && f.seen.filter((s) => s.method === 'GET').length === 3);
  check('Authorization is the bearer token; Content-Type is JSON UTF-8', posts.every((p) => p.auth === `Bearer ${TOKEN}` && p.ctype === 'application/json; charset=utf-8'));
  check('an Idempotency-Key is sent per migration', posts.every((p, i) => p.idem === migrations[i].idempotencyKey));
}

console.log('\nalready in history: nothing sent');
{
  let r!: Awaited<ReturnType<typeof applyAll>>;
  const f = await withFake([...EXISTING, { version: '20261025030000', name: MIGRATIONS[0].name }], 'ok', async (base) => { r = await applyAll(base, TOKEN, migrations, log, short); results.push(r); });
  eq('exit 2, no POST at all', [r.exitCode, f.seen.filter((s) => s.method === 'POST').length], [2, 0]);
}

console.log('\nfirst migration refused: stop');
{
  let r!: Awaited<ReturnType<typeof applyAll>>;
  const f = await withFake(EXISTING, 'fail-first', async (base) => { r = await applyAll(base, TOKEN, migrations, log, short); results.push(r); });
  eq('exit 1; step 1 failed, step 2 never sent', [r.exitCode, r.steps.map((s) => s.outcome), f.seen.filter((s) => s.method === 'POST').length], [1, ['failed', 'not-sent'], 1]);
  check('the refusal text is reported', /synthetic/.test(r.summary), r.summary);
}

console.log('\nresponse lost after the server committed: UNCERTAIN, no retry');
{
  let r!: Awaited<ReturnType<typeof applyAll>>;
  const f = await withFake(EXISTING, 'drop-after-commit', async (base) => { r = await applyAll(base, TOKEN, migrations, log, short); results.push(r); });
  eq('exit 3 (uncertain); step 2 never sent', [r.exitCode, r.steps.map((s) => s.outcome)], [3, ['uncertain', 'not-sent']]);
  eq('exactly ONE POST: no automatic retry', f.seen.filter((s) => s.method === 'POST').length, 1);
  check('…and the read-only history inspection shows the entry that DID commit', typeof r.steps[0].historyAfter === 'object' && (r.steps[0].historyAfter as { name: string }).name === MIGRATIONS[0].name, JSON.stringify(r.steps[0].historyAfter));
  check('the summary says to inspect read-only before any further submission', /inspect history and database state read-only/i.test(r.summary), r.summary);
}

console.log('\n2xx but not in history: UNCERTAIN');
{
  let r!: Awaited<ReturnType<typeof applyAll>>;
  const f = await withFake(EXISTING, 'ok-but-unrecorded', async (base) => { r = await applyAll(base, TOKEN, migrations, log, short); results.push(r); });
  eq('exit 3; step 2 never sent', [r.exitCode, r.steps.map((s) => s.outcome), f.seen.filter((s) => s.method === 'POST').length], [3, ['uncertain', 'not-sent'], 1]);
}

console.log('\nthe token never leaks');
check('not in any log line', !logs.some((l) => l.includes(TOKEN)));
check(`not in any of the ${results.length} result objects (what the record file is written from)`, results.length === 5 && !JSON.stringify(results).includes(TOKEN));
{
  const src = fs.readFileSync('scripts/deploy/apply-migrations.ts', 'utf8');
  check('the script reads no token from argv or the environment', !/process\.env\.\w*(TOKEN|ACCESS)/i.test(src) && !/--token/.test(src));
  check('the production API base is a constant (no override path)', /const API_BASE = 'https:\/\/api\.supabase\.com';/.test(src) && !/API_BASE\s*=\s*process/.test(src));
}

console.log('\ndry run and refusals make no request');
{
  const realFetch = globalThis.fetch;
  let attempted = 0;
  globalThis.fetch = (async () => { attempted++; throw new Error('tripwire: no request allowed'); }) as typeof fetch;
  const out: string[] = [];
  const [l, e] = [console.log, console.error];
  console.log = (...a: unknown[]) => { out.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { out.push(a.join(' ')); };
  let dry = -1; let noTty = -1; let noConfirm = -1;
  try {
    dry = await main([]);
    noConfirm = await main(['--apply']);
    noTty = await main(['--apply', '--confirm-project', PROJECT_REF, '--record-dir', os.tmpdir()]);
  } finally { console.log = l; console.error = e; globalThis.fetch = realFetch; }
  eq('dry run exits 0', dry, 0);
  check('dry run shows project, both files, full hashes and a redacted request', [PROJECT_REF, ...MIGRATIONS.map((m) => m.sha256), 'REDACTED', 'DRY RUN'].every((t) => out.join('\n').includes(t)));
  eq('--apply without --confirm-project is refused (2)', noConfirm, 2);
  eq('--apply without an interactive terminal is refused before any request (2)', noTty, 2);
  eq('no request was attempted by the dry run or the refusals', attempted, 0);
}

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
