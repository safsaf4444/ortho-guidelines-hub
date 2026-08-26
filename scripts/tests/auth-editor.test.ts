/**
 * scripts/tests/auth-editor.test.ts
 * ──────────────────────────────────
 * Offline tests for the magic-link editor auth prep: src/lib/auth.ts's
 * request-validation gate, src/lib/editor-allowlist.ts's fail-closed
 * allowlist check, and src/lib/write-access.ts's WRITES_ENABLED×isEditor
 * gating logic.
 *
 * Pure-function tests only — no DOM, no Supabase client, no network. Real
 * Supabase calls (signInWithOtp, getSession, onAuthStateChange) are
 * deliberately NOT exercised here; requestMagicLink in src/lib/auth.ts calls
 * prepareMagicLinkRequest for its validation gate before ever touching the
 * network specifically so that gate can be tested without one.
 *
 * Run:   npx tsx scripts/tests/auth-editor.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { prepareMagicLinkRequest } from '../../src/lib/magic-link';
import { isAllowlistConfigured, isEditorUuid } from '../../src/lib/editor-allowlist';
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

const PLACEHOLDER = 'REPLACE-WITH-EDITOR-UUID';
const EDITOR_A = '11111111-1111-4111-8111-111111111111';
const EDITOR_B = '22222222-2222-4222-8222-222222222222';
const STRANGER = '99999999-9999-4999-8999-999999999999';

console.log('\n[1] prepareMagicLinkRequest — magic-link request handling, offline');

eq(
  'supabase not configured is rejected before email is even checked',
  prepareMagicLinkRequest('anyone@example.test', false),
  { ok: false, error: 'Sign-in is unavailable — the live database is not configured.' }
);
eq(
  'empty email is rejected',
  prepareMagicLinkRequest('', true),
  { ok: false, error: 'Enter an email address.' }
);
eq(
  'whitespace-only email is rejected',
  prepareMagicLinkRequest('   ', true),
  { ok: false, error: 'Enter an email address.' }
);
eq(
  'valid email is accepted and trimmed',
  prepareMagicLinkRequest('  editor@example.test  ', true),
  { ok: true, email: 'editor@example.test' }
);
eq(
  'no-supabase check wins over an empty email — one clear reason, not a stacked one',
  prepareMagicLinkRequest('', false),
  { ok: false, error: 'Sign-in is unavailable — the live database is not configured.' }
);

console.log('\n[2] Editor allowlist — fail-closed with no configured UUID');

check('the unconfigured placeholder is reported as not configured', !isAllowlistConfigured([PLACEHOLDER]));
check('a real UUID in the allowlist is reported as configured', isAllowlistConfigured([EDITOR_A]));
check('a mixed allowlist (real + placeholder) is reported as configured', isAllowlistConfigured([PLACEHOLDER, EDITOR_A]));

check('null userId is never an editor, even with a real allowlist', !isEditorUuid(null, [EDITOR_A]));
check('undefined userId is never an editor', !isEditorUuid(undefined, [EDITOR_A]));
check('empty-string userId is never an editor', !isEditorUuid('', [EDITOR_A]));
check(
  'a signed-in user is NOT an editor while the allowlist is still the unconfigured placeholder',
  !isEditorUuid(EDITOR_A, [PLACEHOLDER]),
);
check(
  'the placeholder string itself is never treated as a matching user id',
  !isEditorUuid(PLACEHOLDER, [PLACEHOLDER]),
);
check('a user id in the allowlist is an editor', isEditorUuid(EDITOR_A, [EDITOR_A, EDITOR_B]));
check('a user id NOT in the allowlist is not an editor', !isEditorUuid(STRANGER, [EDITOR_A, EDITOR_B]));
check('the allowlist supports more than one editor — second entry matches too', isEditorUuid(EDITOR_B, [EDITOR_A, EDITOR_B]));

console.log('\n[3] UI gating — signed-out / non-editor / editor, and WRITES_ENABLED');

// Signed-out: no userId at all, so isEditor is false regardless of WRITES_ENABLED.
const signedOutIsEditor = isEditorUuid(null, [EDITOR_A]);
eq('signed-out user cannot write even if WRITES_ENABLED were true', canWrite(true, signedOutIsEditor), false);
eq('signed-out user cannot write while WRITES_ENABLED is false', canWrite(false, signedOutIsEditor), false);

// Signed-in but not on the allowlist.
const nonEditorIsEditor = isEditorUuid(STRANGER, [EDITOR_A]);
eq('non-editor cannot write even if WRITES_ENABLED were true', canWrite(true, nonEditorIsEditor), false);
eq(
  'non-editor sees the sign-in/editor-access reason, not a raw Supabase error',
  writeBlockedReason(true, nonEditorIsEditor),
  'Sign in as an approved editor to save changes.'
);

// Signed in AND on the allowlist.
const editorIsEditor = isEditorUuid(EDITOR_A, [EDITOR_A]);
eq('editor CAN write once WRITES_ENABLED is true', canWrite(true, editorIsEditor), true);
eq('editor write-blocked reason is null once allowed', writeBlockedReason(true, editorIsEditor), null);

console.log('\n[4] Save remains unavailable while WRITES_ENABLED is false — this branch\'s invariant');

// This branch keeps WRITES_ENABLED hardcoded false in src/App.tsx. These
// assertions describe the current shipped state, not a hypothetical.
const WRITES_ENABLED_THIS_BRANCH = false;
check(
  'an approved, signed-in editor still cannot write while WRITES_ENABLED is false',
  !canWrite(WRITES_ENABLED_THIS_BRANCH, editorIsEditor),
);
eq(
  'the reason shown is the read-only-mode message, not a sign-in prompt, while WRITES_ENABLED is false',
  writeBlockedReason(WRITES_ENABLED_THIS_BRANCH, editorIsEditor),
  'Read-only mode — publication is disabled.'
);
check('canWrite is false for every isEditor value while WRITES_ENABLED is false', [true, false].every(
  e => !canWrite(WRITES_ENABLED_THIS_BRANCH, e)
));

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
