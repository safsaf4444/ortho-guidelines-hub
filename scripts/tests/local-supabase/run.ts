/**
 * scripts/tests/local-supabase/run.ts
 * ───────────────────────────────────
 * Runs the review-queue tests against a disposable LOCAL Supabase.
 *
 *   npx tsx scripts/tests/local-supabase/run.ts <suite…>
 *
 * Suites:
 *   integration      scripts/tests/integration/discovery-queue.local.test.ts on 20261024 only
 *   integration-25   the same on 20261024 + 20261025 (adds section 9)
 *   e2e              the dashboard in Chromium (./e2e.ts); prepares its own schema states
 *   rehearsal        the upgrade rehearsal (./rehearsal.ts); prepares its own schema states
 *   adapter          the discovery staging adapter, run for real (./discovery-adapter.ts), on 20261024 + 20261025
 *   all              all five, in that order
 *   stop             stop the stack and delete its data (also: --stop after the suites)
 *
 * Each suite runs as a child process with ONLY the loopback URL and the local
 * demo keys in its LOCAL_* variables; output is shown and saved to
 * ./.work/logs/<suite>.log. Exit code 1 if any suite fails.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { dockerAvailable, HERE, localEnv, prepareSchema, REPO, stopStack, testEnv, WORK } from './stack';

const SUITES = ['integration', 'integration-25', 'e2e', 'rehearsal', 'adapter'] as const;
type Suite = typeof SUITES[number];

const args = process.argv.slice(2);
const wantStop = args.includes('stop') || args.includes('--stop');
const requested = args.filter((a) => a !== 'stop' && a !== '--stop');
const suites: Suite[] = requested.includes('all') ? [...SUITES] : requested.filter((a): a is Suite => (SUITES as readonly string[]).includes(a));
const unknown = requested.filter((a) => a !== 'all' && !(SUITES as readonly string[]).includes(a));
if (unknown.length > 0 || (suites.length === 0 && !wantStop)) {
  console.error(`Usage: npx tsx scripts/tests/local-supabase/run.ts <${[...SUITES, 'all', 'stop'].join('|')}> [--stop]`);
  process.exit(2);
}

const TSX = path.join(REPO, 'node_modules/tsx/dist/cli.mjs');
const SCRIPT: Record<Suite, string> = {
  integration: path.join(REPO, 'scripts/tests/integration/discovery-queue.local.test.ts'),
  'integration-25': path.join(REPO, 'scripts/tests/integration/discovery-queue.local.test.ts'),
  e2e: path.join(HERE, 'e2e.ts'),
  rehearsal: path.join(HERE, 'rehearsal.ts'),
  adapter: path.join(HERE, 'discovery-adapter.ts'),
};

function runChild(suite: Suite, env: Record<string, string>): Promise<{ code: number; summary: string }> {
  fs.mkdirSync(path.join(WORK, 'logs'), { recursive: true });
  const log = fs.createWriteStream(path.join(WORK, 'logs', `${suite}.log`));
  return new Promise((resolve) => {
    // A minimal environment: no inherited SUPABASE_* or VITE_* variables.
    const keep = ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
      'PLAYWRIGHT_BROWSERS_PATH', 'ComSpec', 'PATHEXT', 'WINDIR', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'DOCKER_HOST'];
    const base = Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k] as string]));
    const child = spawn(process.execPath, [TSX, SCRIPT[suite]], { cwd: REPO, env: { ...base, ...env } });
    let tail = '';
    const onData = (d: Buffer) => { const s = String(d); process.stdout.write(s); log.write(s); tail = (tail + s).slice(-400); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => {
      log.end();
      resolve({ code: code ?? 1, summary: tail.match(/(\d+) passed, (\d+) failed/)?.[0] ?? '(no summary)' });
    });
  });
}

const results: Array<{ suite: string; code: number; summary: string }> = [];
if (suites.length > 0) {
  if (!dockerAvailable()) {
    console.error('Docker is not running. Start Docker Desktop (or the Docker daemon) and try again.');
    process.exit(2);
  }
  if (suites.includes('e2e') && !fs.existsSync(chromium.executablePath())) {
    console.error('Chromium for Playwright is not installed. Run: npx playwright install chromium');
    process.exit(2);
  }
  for (const suite of suites) {
    console.log(`\n════════ ${suite} ════════`);
    try {
      if (suite === 'integration' || suite === 'integration-25' || suite === 'adapter') {
        prepareSchema({ with24: true, with25: suite !== 'integration' });
      }
      // e2e and rehearsal prepare their own schema states; the stack must be up for localEnv().
      if (suite === 'e2e' || suite === 'rehearsal') prepareSchema({ with24: false, with25: false });
      const env = testEnv(localEnv());
      results.push({ suite, ...(await runChild(suite, env)) });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      results.push({ suite, code: 1, summary: 'setup failed' });
    }
  }
}
if (wantStop) {
  const left = stopStack();
  console.log(`\nStack stopped. Left behind: ${left.containers} containers, ${left.volumes} volumes, ${left.networks} networks.`);
}
if (results.length > 0) {
  console.log('\n════════ summary ════════');
  for (const r of results) console.log(`  ${r.code === 0 ? 'OK  ' : 'FAIL'}  ${r.suite.padEnd(15)} ${r.summary}`);
  console.log(`  logs: ${path.relative(REPO, path.join(WORK, 'logs'))}`);
}
process.exitCode = results.some((r) => r.code !== 0) ? 1 : 0;
