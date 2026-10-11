/**
 * scripts/tests/write-access.test.ts
 * ──────────────────────────────────
 * Offline tests for the write gate, under the EDITOR-ALLOWLIST model.
 *
 * ⚠ This file previously asserted the opposite of what it asserts now. Under
 * the old public-editing model it deliberately did NOT claim the public was
 * locked out — anon held insert/update policies, so that claim would have been
 * false. As of
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql those anon
 * policies are gone: writes to `guidelines` and `guideline_changelog` require
 * a session whose `auth.uid()` is in `public.is_editor()`.
 *
 * Two things are guarded here, and they pull in different directions:
 *
 *   1. The gate predicts the database's answer. All three conditions must
 *      hold, and each failure mode must stay separately explainable — an
 *      offline reader must not be told to sign in, and a signed-out editor
 *      must not be told the database is down.
 *
 *   2. Write access is granted by RLS plus a sign-in, NEVER by shipping a
 *      secret key. If the service-role key ever appears in a build, that is a
 *      real incident: it bypasses RLS entirely, so emptying the allowlist
 *      would no longer close the write path, and the key also grants access to
 *      everything else in the project.
 *
 * Run:   npx tsx scripts/tests/write-access.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canWrite, writeBlockedReason, type WriteGate } from '../../src/lib/write-access';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

const gate = (writesEnabled: boolean, dbAvailable: boolean, signedIn: boolean): WriteGate =>
  ({ writesEnabled, dbAvailable, signedIn });

console.log('\n[1] canWrite — kill switch AND a live database AND a session, all three required');

eq('all three conditions met', canWrite(gate(true, true, true)), true);
eq('kill switch off blocks writing even when signed in', canWrite(gate(false, true, true)), false);
eq('static/offline fallback cannot write', canWrite(gate(true, false, true)), false);
eq('signed out cannot write — the new condition', canWrite(gate(true, true, false)), false);
eq('nothing holds', canWrite(gate(false, false, false)), false);

// Exhaustive, because this function is the UI's only predictor of an RLS
// decision and a single wrong combination means offering a control the
// database will refuse.
let trueCount = 0;
for (const w of [true, false]) {
  for (const d of [true, false]) {
    for (const s of [true, false]) {
      if (canWrite(gate(w, d, s))) trueCount++;
    }
  }
}
eq('exactly one of the eight combinations permits a write', trueCount, 1);

console.log('\n[2] writeBlockedReason — the three failure modes stay distinguishable');

eq('not blocked when all three hold', writeBlockedReason(gate(true, true, true)), null);
eq(
  'the kill switch wins — one clear reason, not a stacked one',
  writeBlockedReason(gate(false, true, true)),
  'Read-only mode — publication is disabled.'
);
eq(
  'offline/static mode is explained as such, not as a permission problem',
  writeBlockedReason(gate(true, false, true)),
  'Editing needs the live database — not available in offline/static mode.'
);
eq(
  'signed out is explained as a sign-in, not as an outage',
  writeBlockedReason(gate(true, true, false)),
  'Sign in as an editor to make changes. Reading needs no account.'
);
eq(
  'kill switch also wins when nothing holds',
  writeBlockedReason(gate(false, false, false)),
  'Read-only mode — publication is disabled.'
);
// The specific trap this guards: an offline reader told to go and sign in
// would be chasing a fix that cannot work, because there is no database to
// sign in to. dbAvailable must be reported before signedIn.
eq(
  'offline beats signed-out when both are false',
  writeBlockedReason(gate(true, false, false)),
  'Editing needs the live database — not available in offline/static mode.'
);

console.log('\n[3] The app requires a session, and says so in one place');

const appSrc = readFileSync('src/App.tsx', 'utf8');
check(
  'App.tsx folds the editor session into its write gate',
  /useEditorSession/.test(appSrc) && /signedIn:\s*session\.signedIn/.test(appSrc),
);
check(
  'the old session-free gate is gone',
  !/const canEdit = isSupabaseEnabled;/.test(appSrc),
);
check(
  'a sign-in control is actually mounted — the gate is reachable, not a dead end',
  /EditorAuthControl/.test(appSrc),
);

const sessionSrc = readFileSync('src/lib/editor-session.ts', 'utf8');
check(
  'the editor allowlist is NOT mirrored in the bundle — no hardcoded account UUIDs',
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(sessionSrc),
  'a UUID in the client is a second source of truth that can drift from the RLS policy',
);

console.log('\n[4] Write access comes from RLS, not from a shipped secret');

// Comments are stripped first: vite.config.ts deliberately DOCUMENTS the
// removed key-injection mechanism by name, and a naive substring check would
// match that prose and fail. What matters is that no live code injects a key.
const viteConfigCode = readFileSync('vite.config.ts', 'utf8')
  .split(String.fromCharCode(10))
  .filter(line => !line.trim().startsWith('//'))
  .join('!');
check(
  'vite.config.ts injects NO key into the bundle at all',
  !viteConfigCode.includes('__LOCAL_EDITOR_KEY__')
    && !viteConfigCode.includes('localEditorKeyPlugin')
    && !viteConfigCode.includes('SUPABASE_SERVICE_ROLE_KEY')
    && !viteConfigCode.includes('loadEnv')
    && !viteConfigCode.includes('define:'),
);

const supabaseSrc = readFileSync('src/lib/supabase.ts', 'utf8');
check(
  'the client is built from the anon key only',
  supabaseSrc.includes('anonKey') && !supabaseSrc.includes('__LOCAL_EDITOR_KEY__'),
);
check(
  'sessions persist — without this every reload would drop auth.uid() and fail RLS',
  /persistSession:\s*true/.test(supabaseSrc),
);

// The load-bearing check. Skipped when dist/ is absent so the suite stays
// runnable without a build; run `npm run build` first to exercise it.
const serviceKey = (() => {
  if (!existsSync('.env.local')) return null;
  const m = readFileSync('.env.local', 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  const v = m?.[1]?.trim();
  return v && v !== 'your-service-role-key-here' ? v : null;
})();

if (!existsSync('dist')) {
  console.log('  SKIP  dist/ not built — run `npm run build` then re-run to check the bundle');
} else {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else files.push(full);
    }
  })('dist');

  if (serviceKey) {
    const leaked = files.filter(f => {
      try { return readFileSync(f, 'utf8').includes(serviceKey); } catch { return false; }
    });
    check(
      `the service-role key appears in NONE of the ${files.length} built files in dist/`,
      leaked.length === 0,
      leaked.length ? `LEAKED IN: ${leaked.join(', ')}` : '',
    );
  } else {
    console.log('  SKIP  no service-role key in .env.local — nothing to search the bundle for');
  }

  const jwtLike = files.filter(f => {
    try { return /"role"\s*:\s*"service_role"|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/.test(readFileSync(f, 'utf8')); } catch { return false; }
  });
  check(
    'no service_role JWT-shaped string of any kind in dist/',
    jwtLike.length === 0,
    jwtLike.length ? `SUSPECT: ${jwtLike.join(', ')}` : '',
  );

  const distText = files
    .filter(f => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css'))
    .map(f => { try { return readFileSync(f, 'utf8'); } catch { return ''; } })
    .join('');

  check(
    'the built bundle carries no editor account UUID',
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(distText),
  );
}

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
