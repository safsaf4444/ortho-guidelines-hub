/**
 * scripts/tests/write-access.test.ts
 * ──────────────────────────────────
 * Offline tests for the write gate, under the PUBLIC EDITING model.
 *
 * ⚠ Read this before "fixing" a failure here. Editing on this site is public
 * and unauthenticated by deliberate decision of the site owner: `guidelines`
 * carries insert/update/delete RLS policies for the anon role, so any visitor
 * can add, edit or delete clinical guideline content. See SECURITY.md and
 * supabase-migration-public-write-access.sql.
 *
 * This file therefore NO LONGER asserts that the public cannot write — that
 * assumption is intentionally false now. What it still guards is the thing
 * that must remain true regardless of who may write:
 *
 *   public write access is granted by RLS, NEVER by shipping a secret key.
 *
 * If the service-role key ever appears in a build, that is a real incident:
 * it bypasses RLS entirely, so the rollback in
 * supabase-migration-public-write-access.sql would no longer close the write
 * path, and the key would also grant access to everything else in the project.
 *
 * Run:   npx tsx scripts/tests/write-access.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canWrite, writeBlockedReason } from '../../src/lib/write-access';

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

console.log('\n[1] canWrite — kill switch AND a live database, both required');

eq('live DB with writes enabled can write', canWrite(true, true), true);
eq('kill switch off blocks writing even with a live DB', canWrite(false, true), false);
eq('static/offline fallback cannot write', canWrite(true, false), false);
eq('neither condition met', canWrite(false, false), false);

console.log('\n[2] writeBlockedReason — the two failure modes stay distinguishable');

eq('not blocked when both hold', writeBlockedReason(true, true), null);
eq(
  'the kill switch wins — one clear reason, not a stacked one',
  writeBlockedReason(false, true),
  'Read-only mode — publication is disabled.'
);
eq(
  'offline/static mode is explained as such, not as a permission problem',
  writeBlockedReason(true, false),
  'Editing needs the live database — not available in offline/static mode.'
);
eq(
  'kill switch also wins when neither condition holds',
  writeBlockedReason(false, false),
  'Read-only mode — publication is disabled.'
);

console.log('\n[3] Write access comes from RLS, not from a shipped secret');

const appSrc = readFileSync('src/App.tsx', 'utf8');
check(
  'App.tsx gates on isSupabaseEnabled — no local-editor / sign-in gate remains',
  /const canEdit = isSupabaseEnabled;/.test(appSrc) && !appSrc.includes('LOCAL_EDITOR_MODE'),
);
check(
  'no sign-in / allowlist module has crept back into App.tsx',
  !/useEditorAuth|EditorAuthControl|editor-allowlist|VITE_EDITOR_UUIDS/.test(appSrc),
);

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

  for (const dead of [
    'Editor sign in',
    'Send magic link',
    'Check your email for a sign-in link',
    'Signed in (not an editor)',
    'Sign in as an approved editor',
  ]) {
    check(`removed sign-in UI string is absent from dist/: "${dead}"`, !distText.includes(dead));
  }
}

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
