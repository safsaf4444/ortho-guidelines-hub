/**
 * scripts/tests/monitor-store.test.ts
 * ───────────────────────────────────
 * Offline regression tests for scripts/lib/monitor-store.ts and the
 * `--observe` path of scripts/monitor-providers.ts (Codex review P1-1,
 * P2-1, P2-2). NO NETWORK: every "observation" is a saved HTML file.
 *
 * The data-loss scenario this pins (independently reproduced in review):
 *   monitoring run 1 ─► `discover` run overwrites .discovery-cache ─► run 2
 *   With the baseline read from the shared cache, run 2 compared the page
 *   against the body `discover` had just stored, so the index change between
 *   run 1 and run 2 was never reported. With the durable store it is.
 *
 * Run:   npx tsx scripts/tests/monitor-store.test.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SurfaceParse } from '../adapters/types';
import { assessObservation, readMonitorRecord, recordObservation, recordPath, type Observation } from '../lib/monitor-store';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsx = path.join(repo, 'node_modules/tsx/dist/cli.mjs');
const SURFACE = 'https://www.bofas.org.uk/Publications/Statements-Publications';

const items = (n: number): SurfaceParse => ({
  items: Array.from({ length: n }, (_, i) => ({ topic: `Doc ${i + 1}`, discoveredUrl: `${SURFACE}/${i + 1}.pdf`, statedLabels: [] })),
  excluded: [],
});
const obs = (over: Partial<Observation>): Observation => ({
  provider: 'BOFAS', surfaceUrl: SURFACE, status: 200, html: '<h2>BOFAS Position Statements</h2><p>x</p>', parse: items(2), observedAt: '2026-11-05T10:00:00.000Z', ...over,
});

console.log('\n[1] assessObservation: what may become a baseline');
{
  eq('2xx with items → valid', assessObservation(obs({})).valid, true);
  eq('transport error → invalid', assessObservation(obs({ error: 'ECONNRESET' })).valid, false);
  eq('503 maintenance page → invalid', assessObservation(obs({ status: 503, html: '<h1>Down for maintenance</h1>', parse: items(0) })).valid, false);
  eq('200 but zero items on an item-bearing surface (block page / template change) → invalid', assessObservation(obs({ parse: items(0) })).valid, false);
  eq('200 zero items where none are expected → valid', assessObservation(obs({ parse: items(0), expectItems: false })).valid, true);
  eq('empty body → invalid', assessObservation(obs({ html: '   ', parse: items(0) })).valid, false);
  eq('304 with a trusted stored representation → valid (P2-1)', assessObservation(obs({ status: 304, revalidated: true })).valid, true);
  eq('304 without a stored representation → invalid: nothing observed (P2-1)', assessObservation(obs({ status: 304, revalidated: false, html: '', parse: items(0) })).valid, false);
  check('304-without-body reason names the missing baseline evidence', /no trusted prior representation/.test(assessObservation(obs({ status: 304, revalidated: false, html: '', parse: items(0) })).reason));
}

console.log('\n[2] first valid observation = initial baseline, labelled as such');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-monitor-store-'));
{
  const before = readMonitorRecord(dir, 'BOFAS');
  eq('no record before the first run', [before.baseline, before.attempts.length], [null, 0]);
  const out = recordObservation(dir, obs({}));
  eq('accepted', out.accepted, true);
  eq('no previous baseline to diff against', out.previousBaseline, null);
  eq('stored baseline is flagged initial', out.record.baseline?.initial, true);
  eq('acceptedCount 1', out.record.baseline?.acceptedCount, 1);
  check('record file written atomically (no .tmp left behind)', fs.existsSync(recordPath(dir, 'BOFAS')) && !fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
}

console.log('\n[3] a failed fetch, a 503 and a 0-item page never become the baseline; the valid one is kept');
{
  const b1 = readMonitorRecord(dir, 'BOFAS').baseline!;
  const e1 = recordObservation(dir, obs({ error: 'fetch timeout after 30 s', html: '', parse: items(0), observedAt: '2026-11-06T10:00:00.000Z' }));
  const e2 = recordObservation(dir, obs({ status: 503, html: '<h1>Maintenance</h1>', parse: items(0), observedAt: '2026-11-07T10:00:00.000Z' }));
  const e3 = recordObservation(dir, obs({ status: 200, html: '<html><body>Access denied</body></html>', parse: items(0), observedAt: '2026-11-08T10:00:00.000Z' }));
  eq('all three rejected', [e1.accepted, e2.accepted, e3.accepted], [false, false, false]);
  const after = readMonitorRecord(dir, 'BOFAS');
  eq('baseline unchanged (same sha, same observedAt)', [after.baseline?.bodySha256, after.baseline?.observedAt], [b1.bodySha256, b1.observedAt]);
  eq('every attempt logged', after.attempts.map((a) => a.outcome), ['accepted', 'rejected', 'rejected', 'rejected']);
  check('rejection reasons are specific', /fetch failed/.test(e1.reason) && /HTTP 503/.test(e2.reason) && /0 items/.test(e3.reason));
  eq('previousBaseline returned on a rejected run is still the valid one', e3.previousBaseline?.observedAt, b1.observedAt);
}

console.log('\n[4] the next valid run diffs against the LAST VALID baseline, so changes during the outage are detected');
{
  const out = recordObservation(dir, obs({ parse: items(3), html: '<h2>BOFAS Position Statements</h2><p>x</p><p>y</p>', observedAt: '2026-11-09T10:00:00.000Z' }));
  eq('accepted', out.accepted, true);
  eq('compared against the 2-item baseline from the first run', out.previousBaseline?.parse.items.length, 2);
  eq('baseline advanced to 3 items and is no longer initial', [out.record.baseline?.parse.items.length, out.record.baseline?.initial, out.record.baseline?.acceptedCount], [3, false, 2]);
}

console.log('\n[5] 304 handling in the store (P2-1)');
{
  const b = readMonitorRecord(dir, 'BOFAS').baseline!;
  const ok = recordObservation(dir, obs({ status: 304, revalidated: true, html: b.html, parse: b.parse, observedAt: '2026-11-10T10:00:00.000Z' }));
  eq('304 + stored representation accepted (confirms unchanged)', ok.accepted, true);
  const bad = recordObservation(dir, obs({ status: 304, revalidated: false, html: '', parse: items(0), observedAt: '2026-11-11T10:00:00.000Z' }));
  eq('304 with nothing to stand in for the body is rejected', bad.accepted, false);
  eq('baseline still the 3-item one', readMonitorRecord(dir, 'BOFAS').baseline?.parse.items.length, 3);
}

console.log('\n[6] corrupt or foreign records fail closed without resetting history');
{
  const refuses = () => {try {readMonitorRecord(dir,'BSG');return false;}catch{return true;}};
  fs.writeFileSync(recordPath(dir, 'BSG'), '{not json');
  check('corrupt file is refused', refuses());
  fs.writeFileSync(recordPath(dir, 'BSG'), JSON.stringify({ provider: 'OTHER', baseline: null, attempts: [] }));
  check('record for another provider is refused', refuses());
  fs.writeFileSync(recordPath(dir, 'BSG'), JSON.stringify({ provider: 'BSG', baseline: { version: 99 }, attempts: [] }));
  check('unknown baseline version is refused', refuses());
}

console.log('\n[7] the reproduced data-loss scenario, end to end through the CLI (P1-1)');
{
  // Three index states: v1 (A), v2 (A + B), v3 (A + B + C).
  const page = (rows: string) => `<h1>BOFAS Statements / Publications</h1><h2>BOFAS Position Statements</h2>${rows}`;
  const rowA = '<p><a href="/Portals/0/Position Statements/A.pdf">BOFAS Position Statement on A</a> (2024)</p>';
  const rowB = '<p><a href="/Portals/0/Position Statements/B.pdf">BOFAS Position Statement on B</a> (2025)</p>';
  const rowC = '<p><a href="/Portals/0/Position Statements/C.pdf">BOFAS Position Statement on C</a> (2026)</p>';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-monitor-cli-'));
  const store = path.join(work, 'baselines');
  const cacheDir = path.join(work, '.discovery-cache');
  const w = (name: string, html: string) => { const p = path.join(work, name); fs.writeFileSync(p, html); return p; };
  const v1 = w('v1.html', page(rowA));
  const v2 = w('v2.html', page(rowA + rowB));
  const v3 = w('v3.html', page(rowA + rowB + rowC));
  const maint = w('maint.html', '<html><body><h1>Site under maintenance</h1></body></html>');
  const facts = (o: object) => { const p = path.join(work, `facts-${Object.keys(o).join('-')}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(p, JSON.stringify(o)); return p; };
  const run = (args: string[]) => {
    try {
      return { exit: 0, out: execFileSync(process.execPath, [tsx, 'scripts/monitor-providers.ts', '--baseline-dir', store, ...args], { cwd: repo, encoding: 'utf8' }) };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { exit: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
  };

  // Run 1: first observation.
  const r1 = run(['--observe', `BOFAS=${v1}`]);
  eq('run 1 exit 0', r1.exit, 0);
  check('run 1 labelled as the initial baseline', /initial baseline established/.test(r1.out) && /recorded as the initial baseline/.test(r1.out));
  check('run 1 reports no "added" items (nothing to compare against)', !/\[added\]/.test(r1.out));

  // Simulate `npm run discover` running in between: it writes v2 into the SHARED
  // HTTP cache (a plain directory here — the monitor no longer reads that cache
  // at all, so where it lives is irrelevant). Under the old design that cache
  // WAS the monitoring baseline, so the A→A+B change would have been consumed
  // by discover and never reported.
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'bofas-surface.json'), JSON.stringify({ url: SURFACE, body: page(rowA + rowB), storedAt: new Date().toISOString() }));
  // The monitoring store must be untouched by that.
  eq('store baseline still v1 (1 item) after the simulated discover run', readMonitorRecord(store, 'BOFAS').baseline?.parse.items.length, 1);

  // Run 2: observes v2 → B must be reported as added relative to v1.
  const r2 = run(['--observe', `BOFAS=${v2}`]);
  eq('run 2 exit 0', r2.exit, 0);
  check('run 2 reports B as added (the change the cache design lost)', /\[added\] BOFAS Position Statement on B/.test(r2.out));
  check('run 2 says the baseline advanced', /baseline advanced/.test(r2.out));

  // Run 3: maintenance page → rejected, non-zero exit, baseline kept.
  const r3 = run(['--observe', `BOFAS=${maint}`, '--fetch-facts', facts({ status: 503 })]);
  eq('run 3 (503 maintenance page) exits non-zero', r3.exit, 1);
  check('run 3 says the observation was rejected and the baseline kept', /observation REJECTED, baseline kept/.test(r3.out));
  eq('store baseline still v2 (2 items)', readMonitorRecord(store, 'BOFAS').baseline?.parse.items.length, 2);

  // Run 4: 200 but the page parses to nothing (template change / block page) → rejected too.
  const r4 = run(['--observe', `BOFAS=${maint}`]);
  eq('run 4 (200 but 0 items) exits non-zero', r4.exit, 1);
  check('run 4 names the structural failure', /parsed 0 items/.test(r4.out));

  // Run 5: valid again → C is reported against the last VALID baseline (v2), not against the failures.
  const r5 = run(['--observe', `BOFAS=${v3}`]);
  eq('run 5 exit 0', r5.exit, 0);
  check('run 5 reports C as added', /\[added\] BOFAS Position Statement on C/.test(r5.out));
  check('run 5 does not re-report B (already in the v2 baseline)', !/\[added\] BOFAS Position Statement on B/.test(r5.out));
  const rec = readMonitorRecord(store, 'BOFAS');
  eq('attempt log: accepted, accepted, rejected, rejected, accepted', rec.attempts.map((a) => a.outcome), ['accepted', 'accepted', 'rejected', 'rejected', 'accepted']);
  check('report footer summarises the store', /Monitoring store \(/.test(r5.out) && /3 item\(s\); 5 attempt\(s\) logged/.test(r5.out));

  // Run 6: 304 without revalidated body → missing baseline evidence, non-zero.
  const r6 = run(['--observe', `BOFAS=${v3}`, '--fetch-facts', facts({ status: 304, revalidated: false })]);
  eq('run 6 (304, no trusted prior representation) exits non-zero', r6.exit, 1);
  check('run 6 reports missing baseline evidence', /missing-baseline-evidence|no trusted prior representation/.test(r6.out));
  // Run 7: 304 with revalidated body → accepted, unchanged.
  const r7 = run(['--observe', `BOFAS=${v3}`, '--fetch-facts', facts({ status: 304, revalidated: true })]);
  eq('run 7 (304 + stored representation) exit 0', r7.exit, 0);
  check('run 7 confirms unchanged', /stored representation confirmed unchanged/.test(r7.out));

  // First-run empty index for a NEW provider → non-zero (P2-2).
  const r8 = run(['--observe', `BSG=${maint}`]);
  eq('first run on an empty/invalid index exits non-zero (P2-2)', r8.exit, 1);
  check('… and says so', /empty-index|parsed 0 items/.test(r8.out));
  eq('… and no baseline was established for it', readMonitorRecord(store, 'BSG').baseline, null);

  fs.rmSync(work, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
