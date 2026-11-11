import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeEnvironment } from '../lib/release-gate.mjs';
import { createAssertionReport } from './browser-assertion-report.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
test('detector has no active workflow, credentials, triggers or caller', () => {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/detect-changes.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/detect-changes.yaml')), false);
  for (const file of fs.readdirSync(path.join(root, '.github/workflows'))) {
    const executable = read('.github/workflows/' + file).split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
    assert.doesNotMatch(executable, /detect-changes|retired-workflows/, file);
  }
  const record = read('.github/retired-workflows/detect-changes.md');
  assert.match(record, /D4 approval/);
  assert.doesNotMatch(record, /secrets\.|SUPABASE_SERVICE_ROLE_KEY|workflow_dispatch|cron:|run:/);
});
test('legacy entry point exits unconditionally before operational body', () => {
  assert.match(read('scripts/detect-changes.ts'), /^import \{assertDirectMaintenanceDisabled\}[^\n]+\nassertDirectMaintenanceDisabled\('detect-changes.ts'\);/);
  const guard = read('scripts/lib/direct-maintenance-disabled.ts');
  assert.doesNotMatch(guard, /process\.env|return|\bif\b/);
  const run = spawnSync(process.execPath, ['--require', path.join(root, 'scripts/lib/release-network.cjs'), path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'scripts/detect-changes.ts')], { cwd: root, env: safeEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /disabled pending an audited replacement workflow/);
  assert.doesNotMatch(run.stderr, /network denied|Missing.*SUPABASE/i);
});
test('browser child environment drops all unapproved authority and injection variables', () => {
  const clean = safeEnvironment({ Path: 'tools with spaces', TEMP: 'temp with spaces', SUPABASE_SERVICE_ROLE_KEY: 'secret', VITE_SUPABASE_URL: 'remote', NODE_OPTIONS: '--import unsafe', HTTPS_PROXY: 'remote', GITHUB_TOKEN: 'secret' });
  assert.deepEqual(clean, { Path: 'tools with spaces', TEMP: 'temp with spaces', CI: 'true', NO_COLOR: '1' });
  const runner = read('scripts/tests/mobile-drawer.e2e.mjs');
  assert.match(runner, /fileURLToPath/);
  assert.match(runner, /safeEnvironment\(\)/);
  assert.doesNotMatch(runner, /\.\.\.process.env/);
  assert.match(read('scripts/tests/navigation-drawer.mjs'), /env: safeEnvironment\(\)/);
});
test('assertion evidence persists failures and deterministic IDs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho assertion evidence '));
  try {
    const file = path.join(dir, 'report.json');
    const run = () => {
      const report = createAssertionReport(file);
      report.scenario('mobile-320'); report.assert.equal(true, true, 'focus');
      assert.throws(() => report.assert.equal(false, true, 'trap'));
      report.error(new Error('timeout')); assert.equal(report.failed, true); report.write();
      return fs.readFileSync(file, 'utf8');
    };
    const first = run(); assert.equal(run(), first);
    const result = JSON.parse(first);
    assert.equal(result.passed, 1); assert.equal(result.failed, 2);
    assert.deepEqual(result.results.map(r => r.id), ['mobile-320:1', 'mobile-320:2', 'mobile-320:3']);
  } finally { fs.unlinkSync(path.join(dir, 'report.json')); fs.rmdirSync(dir); }
});
