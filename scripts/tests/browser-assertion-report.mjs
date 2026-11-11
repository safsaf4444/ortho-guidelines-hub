import strict from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
/** Stable IDs/order; no timestamps or machine-specific absolute paths. */
export function createAssertionReport(file) {
  const results = [];
  let scenario = 'bootstrap', sequence = 0;
  const record = (name, passed, detail) => results.push({ id: `${scenario}:${++sequence}`, name, passed, ...(detail ? { detail } : {}) });
  const assertions = Object.fromEntries(['ok', 'equal', 'deepEqual'].map(method => [method, (...args) => {
    const name = args[method === 'ok' ? 1 : 2] || method;
    try { strict[method](...args); record(name, true); }
    catch (error) { record(name, false, error.message); throw error; }
  }]));
  return {
    assert: assertions,
    scenario(name) { scenario = name; sequence = 0; },
    error(error) { record('scenario completed', false, error.message); },
    get failed() { return results.some(result => !result.passed); },
    write() {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results }, null, 2) + '\n');
    },
  };
}
