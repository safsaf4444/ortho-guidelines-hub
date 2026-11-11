/** Self-contained native drawer regression; accepts spaces and any working directory. */
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { safeEnvironment } from '../lib/release-gate.mjs';
import { createAssertionReport } from './browser-assertion-report.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const report = createAssertionReport('reports/navigation-drawer/assertions.json');
let server;
try {
  if (fs.readdirSync(root).some(name => name === '.env' || (name.startsWith('.env.') && name !== '.env.example'))) throw Error('Private env files forbidden in drawer test checkout');
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const env = { ...safeEnvironment(), VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'sb_publishable_SYNTHETIC_DRAWER_TEST' };
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
  let launchError;
  server.on('error', error => { launchError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (server.exitCode !== null) throw Error('Local drawer server exited early');
    try { if ((await fetch(origin + '/ortho-guidelines-hub/')).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw Error('Local drawer preview did not start');
  process.env.UI_URL = origin + '/ortho-guidelines-hub/';
  await import('./navigation-drawer.mjs');
} catch (error) {
  report.error(error); report.write(); process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const closed = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await closed;
  }
}
