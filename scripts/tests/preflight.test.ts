/**
 * scripts/tests/preflight.test.ts
 * ───────────────────────────────
 * Offline checks on the read-only deployment SQL:
 *   supabase/DEPLOY-PREFLIGHT-READONLY.sql
 *   supabase/POST-UPGRADE-REJECTION-GAP-READONLY.sql
 *
 *   1. Each file is read-only by construction: it opens a READ ONLY
 *      transaction before its first query, ends with ROLLBACK, and contains no
 *      statement that writes or changes the schema.
 *   2. Preflight P11 lists open candidates against a LITERAL copy of the hold
 *      list (the table does not exist before the upgrade). That copy must equal
 *      the list 20261024 seeds, or P11 would miss a held document.
 *
 * Behaviour against a real database (read-only enforcement, P11 finding a held
 * legacy row) is covered by the local rehearsal: scripts/tests/local-supabase/.
 *
 * Run:   npx tsx scripts/tests/preflight.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

/** SQL with `--` comments removed (no string in these files contains `--`). */
const code = (sql: string) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const WRITES = /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|do|call|vacuum|analyze|refresh|lock|notify|comment|security|set_config|nextval|setval|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink\w*)\b/i;

for (const file of ['supabase/DEPLOY-PREFLIGHT-READONLY.sql', 'supabase/POST-UPGRADE-REJECTION-GAP-READONLY.sql']) {
  console.log(`\n${file}`);
  const body = code(readFileSync(file, 'utf8'));
  const statements = body.split(';').map((x) => x.trim()).filter(Boolean);
  check('the first statement opens a READ ONLY transaction', /^begin\s+transaction\b[^;]*\bread\s+only$/i.test(statements[0] ?? ''), statements[0]);
  check('the last statement is ROLLBACK', /^rollback$/i.test(statements[statements.length - 1] ?? ''), statements[statements.length - 1]);
  check('no COMMIT anywhere', !/\bcommit\b/i.test(body));
  const middle = statements.slice(1, -1);
  check('every other statement is a SELECT', middle.every((x) => /^select\b/i.test(x)), middle.filter((x) => !/^select\b/i.test(x)).join(' | '));
  const writes = middle.filter((x) => WRITES.test(x));
  check('no statement writes or changes the schema', writes.length === 0, writes.map((x) => x.match(WRITES)?.[0]).join(', '));
}

console.log('\nP11 hold list = 20261024 seed');
const migration = readFileSync('supabase/migrations/20261024_discovery_review_queue.sql', 'utf8');
const seed = migration.match(/insert into public\.discovery_staging_holds[^;]*?values\s*([\s\S]*?)\non conflict/i)?.[1] ?? '';
const seededKeys = [...seed.matchAll(/\(\s*'([^']+)'/g)].map((m) => m[1]).sort();
const preflight = readFileSync('supabase/DEPLOY-PREFLIGHT-READONLY.sql', 'utf8');
const p11 = preflight.match(/select 'P11'[\s\S]*?join \(values([\s\S]*?)\)\s*h\(hold_key\)/i)?.[1] ?? '';
const listedKeys = [...p11.matchAll(/\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).sort();
check('the migration seeds at least one hold', seededKeys.length > 0);
check('P11 lists exactly the seeded hold keys', JSON.stringify(listedKeys) === JSON.stringify(seededKeys),
  `seeded ${JSON.stringify(seededKeys)}, P11 ${JSON.stringify(listedKeys)}`);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
