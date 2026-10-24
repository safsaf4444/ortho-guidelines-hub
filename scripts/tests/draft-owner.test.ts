/**
 * scripts/tests/draft-owner.test.ts
 * ─────────────────────────────────
 * Offline tests for draft ownership: unsent editor text (reject reasons,
 * decision notes, card notes, an open Edit modal) must not survive into
 * another account's session on the same browser.
 *
 * Two layers, because there is no DOM renderer in this repo:
 *
 *   1. draftOwnerKey() — when drafts are discarded. It must change on sign-out
 *      and on a switch between accounts, and must NOT change on a token refresh
 *      for the same account.
 *   2. Source guards — every component that holds editor-typed text is wired
 *      to that key. Remove one and this fails. The behaviour itself (type, sign
 *      out, sign in as another editor, find nothing) is exercised in the browser
 *      by the local Playwright harness; see reports/local-test-harness/.
 *
 * Run:   npx tsx scripts/tests/draft-owner.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync } from 'node:fs';
import { draftOwnerKey, SIGNED_OUT_OWNER } from '../../src/lib/draft-owner';

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

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

console.log('\ndraftOwnerKey');
const signedOut = draftOwnerKey({ signedIn: false, userId: null });
const editorA = draftOwnerKey({ signedIn: true, userId: A });
const editorB = draftOwnerKey({ signedIn: true, userId: B });

check('signed out has the signed-out key', signedOut === SIGNED_OUT_OWNER);
check('sign-out changes the key (A → signed out)', editorA !== signedOut);
check('account switch changes the key (A → B), with no signed-out step between',
  editorA !== editorB);
check('the same account keeps its key (token refresh, new session object)',
  draftOwnerKey({ signedIn: true, userId: A }) === editorA);
check('signing back in as A after sign-out gets A\'s key, not signed-out',
  draftOwnerKey({ signedIn: true, userId: A }) === editorA && editorA !== signedOut);
check('a stale userId while signed out is still signed out',
  draftOwnerKey({ signedIn: false, userId: A }) === SIGNED_OUT_OWNER);
check('signed in with no user id is treated as signed out',
  draftOwnerKey({ signedIn: true, userId: null }) === SIGNED_OUT_OWNER);
check('no user id can collide with the signed-out key',
  draftOwnerKey({ signedIn: true, userId: SIGNED_OUT_OWNER }) !== SIGNED_OUT_OWNER);

console.log('\nwiring (source guards)');
const app = readFileSync('src/App.tsx', 'utf8');
const dashboard = readFileSync('src/components/ReviewDashboard.tsx', 'utf8');

check('App derives the owner from the editor session',
  /const draftOwner = draftOwnerKey\(session\)/.test(app));
check('App provides the owner to the whole tree',
  /<DraftOwnerContext\.Provider value=\{draftOwner\}>/.test(app));
check('the review queue is remounted by the owner (drops its drafts and open panels)',
  /<ReviewDashboard[\s\S]{0,300}?key=\{draftOwner\}/.test(app));

const modalReset = app.match(/if \(modalOwner !== draftOwner\) \{([\s\S]*?)\n  \}/);
check('App resets the Edit modal when the owner changes', modalReset !== null);
check('…closing the modal (its draft)', !!modalReset && /setEditingGuideline\(null\)/.test(modalReset[1]));
check('…and dropping the staging id it would publish against',
  !!modalReset && /setStagedCandidateId\(null\)/.test(modalReset[1]));

const cardNote = app.match(/function CardChangelog[\s\S]*?\n}\n/);
check('card notes read the owner from context',
  !!cardNote && /useContext\(DraftOwnerContext\)/.test(cardNote[0]));
check('card notes clear their text when the owner changes',
  !!cardNote && /if \(textOwner !== draftOwner\) \{[\s\S]*?setText\(''\)/.test(cardNote[0]));

check('the review queue keeps drafts in React state only (no browser storage)',
  !/localStorage|sessionStorage|indexedDB/.test(dashboard));

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
