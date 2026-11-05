/**
 * scripts/tests/approve-change.test.ts
 * ────────────────────────────────────
 * End-to-end OFFLINE tests for scripts/approve-change.ts — the GitHub
 * "approve"/"reject" comment handler for auto-detected content changes
 * (SAF-20: approval semantics).
 *
 * The REAL script runs as a subprocess with globalThis.fetch replaced by
 * scripts/tests/fixtures/approve-change-harness.mjs, which answers GitHub,
 * PostgREST and the guideline URL from a synthetic scenario and logs every
 * request. No socket is opened; SUPABASE_URL points at a reserved `.test`
 * host and every credential is a dummy.
 *
 * What is pinned:
 *   [1] approval marks a link reachable ONLY after a real automated check of
 *       that link passes now — never on the strength of the comment alone;
 *   [2] a failed, timed-out, redirected or DNS-failed check writes nothing to
 *       the verification fields;
 *   [3] an update that matches no row is a failure, not "now marked verified";
 *   [4] the URL in the issue body must be one of the row's own links;
 *   [5] a successful verification write leaves a changelog entry (audit trail);
 *   [6] re-delivery / a second comment on a closed issue changes nothing
 *       (idempotent review actions);
 *   [7] malformed GitHub responses and non-exact comments change nothing;
 *   [8] reject clears only a hash for a link the row actually holds.
 *
 * Run: npx tsx scripts/tests/approve-change.test.ts   (or: npm run test:offline)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const ROOT = process.cwd();
const HARNESS = pathToFileURL(resolve(ROOT, 'scripts/tests/fixtures/approve-change-harness.mjs')).href;
const SCRIPT = resolve(ROOT, 'scripts/approve-change.ts');
const SUPABASE_URL = 'http://supabase.test';
const ROW_ID = 'syn-row-1';
const GUIDE_URL = 'https://publisher.example.test/guidance/synthetic-guideline.pdf';
const OTHER_URL = 'https://publisher.example.test/guidance/some-other-document.pdf';
const TODAY = new Date().toISOString().slice(0, 10);

/** The issue body exactly as scripts/detect-changes.ts openIssue() writes its machine line. */
function issueBody(rowId: string, url: string): string {
  return [
    `**Row ID:** \`${rowId}\``,
    '**Topic:** Synthetic topic',
    '**Source:** SYN',
    `**URL that changed:** ${url}`,
    '',
    `_Row ID for the approval script: \`${rowId}\` / URL: \`${url}\`_`,
  ].join('\n');
}

const ROW = {
  id: ROW_ID,
  versions: [{ label: 'Source', url: GUIDE_URL }],
  archived: false,
  content_hashes: { [GUIDE_URL]: 'a'.repeat(64), 'https://publisher.example.test/keep': 'b'.repeat(64) },
};

interface Logged { method: string; url: string; body: string | null; prefer: string | null }
interface Run { code: number | null; log: Logged[]; out: string }

function run(name: string, scenario: object, commentBody: string): Run {
  const dir = mkdtempSync(join(tmpdir(), 'approve-change-'));
  const scenarioPath = join(dir, 'scenario.json');
  const logPath = join(dir, 'log.jsonl');
  writeFileSync(scenarioPath, JSON.stringify(scenario));
  writeFileSync(logPath, '');
  const res = spawnSync(process.execPath, ['--import', 'tsx', '--import', HARNESS, SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      // A clean environment: nothing from the caller's shell (no real keys) leaks in.
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      HARNESS_SCENARIO: scenarioPath,
      HARNESS_LOG: logPath,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role-key-for-offline-test',
      GITHUB_TOKEN: 'dummy-github-token',
      GITHUB_REPOSITORY: 'example/offline-harness',
      ISSUE_NUMBER: '4242',
      COMMENT_BODY: commentBody,
      COMMENT_AUTHOR: 'syn-editor',
    },
  });
  const log = existsSync(logPath)
    ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Logged)
    : [];
  rmSync(dir, { recursive: true, force: true });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (process.env.VERBOSE) console.log(`---- ${name}\n${out}`);
  return { code: res.status, log, out };
}

const isGuidelinePatch = (l: Logged) => l.method === 'PATCH' && l.url.startsWith(`${SUPABASE_URL}/rest/v1/guidelines`);
const isChangelogPost = (l: Logged) => l.method === 'POST' && l.url.startsWith(`${SUPABASE_URL}/rest/v1/guideline_changelog`);
const isSupabase = (l: Logged) => l.url.startsWith(SUPABASE_URL);
const isLinkCheck = (l: Logged) => l.url === GUIDE_URL;
const comments = (r: Run) => r.log.filter((l) => l.method === 'POST' && /\/comments$/.test(l.url))
  .map((l) => (JSON.parse(l.body ?? '{}') as { body: string }).body);
const verificationWrites = (r: Run) => r.log.filter(isGuidelinePatch)
  .map((l) => JSON.parse(l.body ?? '{}') as Record<string, unknown>)
  .filter((b) => 'link_verification_status' in b || 'link_last_verified' in b || 'link_verification_notes' in b);

const openIssue = { state: 'open', body: issueBody(ROW_ID, GUIDE_URL) };

// ── [1] approve + the link really answers 200 ────────────────────────────────
console.log('\n[1] approve, and an automated check of the link passes now');
{
  const r = run('approve-200', { issue: openIssue, row: ROW, link: { status: 200 } }, 'approve');
  const writes = verificationWrites(r);
  check('the guideline URL itself was requested (a real check ran)', r.log.some(isLinkCheck));
  check('exactly one verification write', writes.length === 1, `got ${writes.length}`);
  check('…status verified, dated today', writes[0]?.link_verification_status === 'verified' && writes[0]?.link_last_verified === TODAY,
    JSON.stringify(writes[0]));
  const note = String(writes[0]?.link_verification_notes ?? '');
  check('…the note says what was checked (reachability) and by whom', /reachab/i.test(note) && note.includes('@syn-editor'), note);
  check('…and that it is not a clinical review', /not a clinical review/i.test(note), note);
  check('the link check ran BEFORE the write', r.log.findIndex(isLinkCheck) >= 0
    && r.log.findIndex(isLinkCheck) < r.log.findIndex(isGuidelinePatch));
  const cl = r.log.filter(isChangelogPost);
  check('[5] one changelog entry for the write (audit trail)', cl.length === 1, `got ${cl.length}`);
  check('[5] …naming the row', cl.length === 1 && (JSON.parse(cl[0].body ?? '{}') as { guideline_id?: string }).guideline_id === ROW_ID);
  check('exit 0', r.code === 0, `exit ${r.code}\n${r.out}`);
}

// ── [2] approve, but the check does not pass ─────────────────────────────────
const NOT_PASSING: Array<[string, unknown]> = [
  ['HTTP 404', { status: 404 }],
  ['HTTP 503 (twice)', { status: 503 }],
  ['simulated timeout (AbortError)', 'abort'],
  ['DNS failure', 'dns'],
  ['redirect to a different document', { status: 200, finalUrl: OTHER_URL }],
  ['WAF block (403)', { status: 403 }],
];
for (const [label, link] of NOT_PASSING) {
  console.log(`\n[2] approve, link check: ${label}`);
  const r = run(`approve-${label}`, { issue: openIssue, row: ROW, link }, 'approve');
  check('the link was actually checked', r.log.some(isLinkCheck));
  check('NO verification write', verificationWrites(r).length === 0, JSON.stringify(verificationWrites(r)));
  check('no changelog entry (nothing changed)', !r.log.some(isChangelogPost));
  check('the editor is told the link was NOT marked reachable',
    comments(r).some((c) => /NOT marked/i.test(c)), comments(r).join(' | '));
  check('exit 0 (the acknowledgement is recorded on the issue, not an error)', r.code === 0, `exit ${r.code}\n${r.out}`);
}

// ── [3] the row does not exist ───────────────────────────────────────────────
console.log('\n[3] approve, but the row ID matches no row');
{
  const r = run('approve-missing-row', { issue: openIssue, row: null, link: { status: 200 } }, 'approve');
  check('no verification write', verificationWrites(r).length === 0);
  check('never claims success', !comments(r).some((c) => /now marked verified|marked reachable/i.test(c)), comments(r).join(' | '));
  check('says the row was not found', comments(r).some((c) => /not found|no row/i.test(c)), comments(r).join(' | '));
  check('exit 1', r.code === 1, `exit ${r.code}`);
}

// ── [4] the issue names a URL the row does not hold ──────────────────────────
console.log('\n[4] approve, but the issue URL is not one of the row\'s links (stale or edited issue)');
{
  const r = run('approve-foreign-url', { issue: { state: 'open', body: issueBody(ROW_ID, OTHER_URL) }, row: ROW, link: { status: 200 } }, 'approve');
  check('no verification write', verificationWrites(r).length === 0);
  check('the foreign URL is not "checked" on the row\'s behalf', !r.log.some((l) => l.url === OTHER_URL));
  check('exit 1', r.code === 1, `exit ${r.code}`);
}

// ── [6] idempotency: closed issue ────────────────────────────────────────────
console.log('\n[6] a second "approve" on an issue that is already closed');
{
  const r = run('approve-closed', { issue: { state: 'closed', body: issueBody(ROW_ID, GUIDE_URL) }, row: ROW, link: { status: 200 } }, 'approve');
  check('no database call at all', !r.log.some(isSupabase), JSON.stringify(r.log.filter(isSupabase)));
  check('no link check', !r.log.some(isLinkCheck));
  check('exit 0', r.code === 0, `exit ${r.code}`);
}

// ── [7] malformed input ──────────────────────────────────────────────────────
console.log('\n[7] malformed GitHub response and non-exact comments');
{
  const r = run('approve-array', { issue: [], row: ROW, link: { status: 200 } }, 'approve');
  check('array instead of an issue: no database call', !r.log.some(isSupabase));
  check('…exit 1', r.code === 1, `exit ${r.code}`);
  const n = run('approve-null-body', { issue: { state: 'open', body: null }, row: ROW, link: { status: 200 } }, 'approve');
  check('null body: no database call', !n.log.some(isSupabase));
  check('…exit 1', n.code === 1, `exit ${n.code}`);
  for (const body of ['approve please', 'I approve', 'approved', '`approve`']) {
    const c = run(`comment-${body}`, { issue: openIssue, row: ROW, link: { status: 200 } }, body);
    check(`comment "${body}" does nothing`, c.log.length === 0 && c.code === 0, `${c.log.length} request(s), exit ${c.code}`);
  }
}

// ── [8] reject ───────────────────────────────────────────────────────────────
console.log('\n[8] reject');
{
  const r = run('reject', { issue: openIssue, row: ROW, link: { status: 200 } }, 'reject');
  const patches = r.log.filter(isGuidelinePatch).map((l) => JSON.parse(l.body ?? '{}') as Record<string, unknown>);
  check('one write, content_hashes only', patches.length === 1 && Object.keys(patches[0]).join() === 'content_hashes', JSON.stringify(patches));
  const hashes = (patches[0]?.content_hashes ?? {}) as Record<string, string>;
  check('…the flagged URL\'s hash removed, the other kept', !(GUIDE_URL in hashes) && 'https://publisher.example.test/keep' in hashes);
  check('no link check and no verification write', !r.log.some(isLinkCheck) && verificationWrites(r).length === 0);
  check('exit 0', r.code === 0, `exit ${r.code}`);

  const f = run('reject-foreign', { issue: { state: 'open', body: issueBody(ROW_ID, OTHER_URL) }, row: ROW, link: { status: 200 } }, 'reject');
  check('reject naming a URL the row does not hold: no write', !f.log.some(isGuidelinePatch), JSON.stringify(f.log.filter(isGuidelinePatch)));
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
