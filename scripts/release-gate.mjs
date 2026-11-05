#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runReleaseGate } from './lib/release-gate.mjs';

export function parseArgs(args) {
  const options = {};
  for (let i=0; i<args.length; i++) {
    const key = args[i];
    if (key === '--help') return {help:true};
    if (key !== '--base' && key !== '--timeout-ms') throw new Error('Unknown option: ' + key);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(key + ' requires a value');
    if (key === '--base') options.baseRef = value;
    else options.timeoutMs = Number(value);
  }
  return options;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log('Usage: node scripts/release-gate.mjs [--base origin/main] [--timeout-ms 120000]\nLocal checks only. Reports: reports/release-gate/<unique-run>/report.{json,md}\nExit 0=PASS, 1=FAIL, 2=HOLD. Never authorises or performs deployment.');
    else process.exitCode = runReleaseGate(options).exitCode;
  } catch (error) { console.error('[release-gate] ' + error.message); process.exitCode = 2; }
}
