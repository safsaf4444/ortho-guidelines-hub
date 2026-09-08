/**
 * scripts/tests/write-access.test.ts
 * ──────────────────────────────────
 * Offline tests for the local-only editor write gate: src/lib/write-access.ts's
 * WRITES_ENABLED × LOCAL_EDITOR_MODE gating logic, plus a build-output safety
 * net for the one invariant this whole design rests on — that a production
 * bundle never contains the service-role key.
 *
 * Replaces the former auth-editor.test.ts. The magic-link sign-in, the editor
 * UUID allowlist and their modules (src/lib/auth.ts, src/lib/magic-link.ts,
 * src/lib/editor-allowlist.ts) were removed when editing became a local-only
 * capability: there is no account, no sign-in and no allowlist to test any
 * more. See git history for the previous version.
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

console.log('\n[1] canWrite — both conditions required, neither sufficient');

eq('local editor on a dev build CAN write', canWrite(true, true), true);
eq('local editor cannot write while WRITES_ENABLED is false', canWrite(false, true), false);
eq('a deployed/public session cannot write even with WRITES_ENABLED true', canWrite(true, false), false);
eq('neither condition met', canWrite(false, false), false);

console.log('\n[2] writeBlockedReason — the two failure modes stay distinguishable');

eq('not blocked when both hold', writeBlockedReason(true, true), null);
eq(
  'the kill switch wins over local-editor mode — one clear reason, not a stacked one',
  writeBlockedReason(false, true),
  'Read-only mode — publication is disabled.'
);
eq(
  'a public/deployed session is told editing is local-only, not shown a raw Supabase error',
  writeBlockedReason(true, false),
  'Editing is available only when running the hub locally.'
);
eq(
  'kill switch also wins when neither condition holds',
  writeBlockedReason(false, false),
  'Read-only mode — publication is disabled.'
);

console.log('\n[3] The deployed site is read-only by construction, not by policy');

// This is the load-bearing invariant. WRITES_ENABLED is true in src/App.tsx,
// so the ONLY thing keeping the public site read-only is that its bundle has
// no service-role key and therefore reports LOCAL_EDITOR_MODE === false.
const appSrc = readFileSync('src/App.tsx', 'utf8');
check(
  'App.tsx derives canEdit from LOCAL_EDITOR_MODE, not from any sign-in state',
  /const canEdit = LOCAL_EDITOR_MODE;/.test(appSrc),
);
check(
  'no sign-in / allowlist module has crept back into App.tsx',
  !/useEditorAuth|EditorAuthControl|editor-allowlist|VITE_EDITOR_UUIDS/.test(appSrc),
);

const viteConfig = readFileSync('vite.config.ts', 'utf8');
check(
  'vite.config.ts still gates the injected key on `command === \'serve\'`',
  /command === 'serve'/.test(viteConfig) && /__LOCAL_EDITOR_KEY__/.test(viteConfig),
);

// Safety net over the real build output. Skipped when dist/ is absent so the
// offline suite stays runnable without a build; when dist/ IS present (as it
// is in the verification sequence: tsc -b, test:offline, build, test:offline)
// this is the assertion that would actually catch a leaked key.
const serviceKey = (() => {
  if (!existsSync('.env.local')) return null;
  const m = readFileSync('.env.local', 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  const v = m?.[1]?.trim();
  return v && v !== 'your-service-role-key-here' ? v : null;
})();

if (!existsSync('dist')) {
  console.log('  SKIP  dist/ not built — run `npm run build` then re-run to check the bundle');
} else if (!serviceKey) {
  console.log('  SKIP  no service-role key in .env.local — nothing to search the bundle for');
} else {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else files.push(full);
    }
  })('dist');

  const leaked = files.filter(f => {
    try { return readFileSync(f, 'utf8').includes(serviceKey); } catch { return false; }
  });
  check(
    `the service-role key appears in NONE of the ${files.length} built files in dist/`,
    leaked.length === 0,
    leaked.length ? `LEAKED IN: ${leaked.join(', ')}` : '',
  );

  const jwtLike = files.filter(f => {
    try { return /"role"\s*:\s*"service_role"|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/.test(readFileSync(f, 'utf8')); } catch { return false; }
  });
  check(
    'no service_role JWT-shaped string of any kind in dist/',
    jwtLike.length === 0,
    jwtLike.length ? `SUSPECT: ${jwtLike.join(', ')}` : '',
  );
}

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
