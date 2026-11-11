/**
 * scripts/tests/editorial-workflow.test.ts
 * ────────────────────────────────────────
 * Offline invariants for the editorial workflow, discovery candidate →
 * approved catalogue record (SAF-20 / SAF-9 / SAF-19). Synthetic fixtures
 * only; no network, no database, no credentials.
 *
 *   [A] approval semantics: approval ≠ link verification (change-approval.ts)
 *   [B] URL identity: invariants that hold under url-key v3 AND v4 (PR #322
 *       owns the keys; nothing here re-implements them)
 *   [C] candidate identity on rediscovery (rejected / held / other producer)
 *   [D] failed source retrieval is a failure, never a zero-document success
 *   [E] publisher identity and staging ownership
 *   [F] publish guards: ambiguous matches, holds, non-queue candidates
 *   [G] static export integrity (no invented verification evidence)
 *   [H] idempotent review actions and audit trail (SQL source)
 *   [I] trust boundaries in GitHub workflows
 *
 * Lines marked "GAP" are NOT assertions. They print a known weakness that
 * needs an owner decision (database/RPC/permission change — see the audit
 * report), confirmed present in the source today, so the gap stays visible
 * and the line changes when the decision lands.
 *
 * Run: npx tsx scripts/tests/editorial-workflow.test.ts   (or: npm run test:offline)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  asIssue,
  extractIssueField,
  hashesAfterReject,
  parseCommentAction,
  planApproval,
  preflightChangeAction,
} from '../lib/change-approval';
import type { CheckOutcome, Verdict } from '../flag-dead-links';
import * as ingestion from '../lib/ingestion';
import { documentIdentityKey, makeCandidateId, normaliseCandidateUrl, type ChangeReason, type PipelineId } from '../lib/ingestion';
import { checkOwnership } from '../lib/staging-ownership';
import { BOAAdapter, buildCandidatesFile, runDryRun } from '../sync-providers';
import type { DiscoveredItem, ProviderAdapter } from '../lib/provider-adapter';
import { exportIntegrityProblems } from '../lib/export-integrity';
import { toDbRow, toGuideline, type DbGuideline } from '../../src/lib/guidelines-mapper';
import { allowedActions } from '../../src/lib/review-actions';
import { candidateToGuidelineDraft, type ChangeReason as QueueReason, type ReviewStatus } from '../../src/lib/candidates';
import { GUIDELINES_DATA, type Guideline } from '../../src/data/guidelines-data';

let pass = 0;
let fail = 0;
let gaps = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
/** A confirmed, owner-decision weakness. Printed, never counted as pass or fail. */
function gap(name: string, presentInSource: boolean) {
  if (presentInSource) { gaps++; console.log(`  GAP   ${name}`); }
  else console.log(`  INFO  previously-reported gap no longer found in source: ${name}`);
}
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** The LAST definition of a SQL function in a file (later definitions win when applied). */
function fnBody(sql: string, name: string): string {
  const re = new RegExp(`create or replace function public\\.${name}\\([^]*?\\n\\$\\$;`, 'g');
  const all = sql.match(re);
  return all ? all[all.length - 1] : '';
}

const ROOT = process.cwd();
const QUEUE_SQL = read('supabase/migrations/20261024_discovery_review_queue.sql');
const ROLES_SQL = read('supabase/migrations/20261011_create_staging_and_editor_roles.sql');

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[A] Approval is an acknowledgement, not a link check');
// ════════════════════════════════════════════════════════════════════════════
const outcome = (verdict: Verdict, detail = 'HTTP 200'): CheckOutcome =>
  ({ verdict, httpStatus: verdict === 'OK' ? '200' : '', finalUrl: '', detail, attempts: 1 });
const base = { rowId: 'syn-1', url: 'https://pub.example.test/g.pdf', author: 'syn-editor', issueNumber: '7', today: '2026-11-05' };

const ALL_VERDICTS: Verdict[] = ['OK', 'REDIRECTED', 'CLIENT_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'DNS_FAILURE', 'BLOCKED_WAF', 'KNOWN_BLOCKED'];
for (const v of ALL_VERDICTS) {
  const plan = planApproval({ ...base, check: outcome(v, v === 'OK' ? 'HTTP 200' : `synthetic ${v}`) });
  if (v === 'OK') {
    check('verdict OK → writes verified, dated, with a changelog entry',
      plan.kind === 'write' && plan.patch.link_verification_status === 'verified' && plan.patch.link_last_verified === '2026-11-05'
      && plan.changelog.includes(base.url));
    check('…the note names the check, the acknowledger, and disclaims clinical review',
      plan.kind === 'write' && /reachability check passed/i.test(plan.patch.link_verification_notes)
      && plan.patch.link_verification_notes.includes('@syn-editor') && /not a clinical review/i.test(plan.patch.link_verification_notes));
    check('…the comment says content and guidance status were NOT changed',
      plan.kind === 'write' && /NOT changed/.test(plan.comment));
  } else {
    check(`verdict ${v} → acknowledge only, nothing written`, plan.kind === 'acknowledge-only' && /NOT marked reachable/.test(plan.comment));
  }
}
check('planApproval has no way to write without a check outcome (check is a required input)',
  /check: CheckOutcome;/.test(read('scripts/lib/change-approval.ts')));
check('approve-change.ts writes verification fields only via planApproval (no literal status in the script)',
  !/link_verification_status\s*:/.test(read('scripts/approve-change.ts')));
check('GitHub acknowledgement cannot call the checker or legacy write planner',
  !/\b(?:checkUrl|planApproval)\s*\(/.test(read('scripts/approve-change.ts')));

eq('comment "approve" (any case, padded) is an approval', parseCommentAction('  APPROVE \n'), 'approve');
eq('comment "reject" is a rejection', parseCommentAction('reject'), 'reject');
for (const c of ['approve please', 'approved', 'lgtm', '', 'reject this', '/approve']) eq(`comment "${c}" is nothing`, parseCommentAction(c), null);

const body = '_Row ID for the approval script: `row-9` / URL: `https://pub.example.test/a.pdf`_';
eq('extracts the row id from the machine line', extractIssueField(body, 'Row ID for the approval script'), 'row-9');
eq('extracts the URL from the machine line', extractIssueField(body, 'URL'), 'https://pub.example.test/a.pdf');
eq('a label with regex metacharacters is matched literally', extractIssueField('a.b: `x`', 'a.b'), 'x');
eq('…and does not match by wildcard', extractIssueField('aXb: `x`', 'a.b'), null);
for (const [label, v] of [['null', null], ['array', []], ['string', 'x'], ['no body', { state: 'open' }], ['number body', { body: 1, state: 'open' }], ['no state', { body: 'x' }]] as const) {
  let threw = false;
  try { asIssue(v, 'test'); } catch { threw = true; }
  check(`asIssue refuses a malformed issue (${label})`, threw);
}

const row = { id: 'row-9', versions: [{ url: 'https://pub.example.test/a.pdf' }, { url: null }], content_hashes: { 'https://pub.example.test/a.pdf': 'h1', k: 'h2' } };
eq('preflight: no row id', preflightChangeAction(null, 'u', row).ok ? 'ok' : (preflightChangeAction(null, 'u', row) as { reason: string }).reason, 'no-row-id');
eq('preflight: row missing', (preflightChangeAction('row-9', 'https://pub.example.test/a.pdf', null) as { reason?: string }).reason, 'row-not-found');
eq('preflight: no url', (preflightChangeAction('row-9', null, row) as { reason?: string }).reason, 'no-url');
eq('preflight: url not on the row', (preflightChangeAction('row-9', 'https://pub.example.test/b.pdf', row) as { reason?: string }).reason, 'url-not-on-row');
eq('preflight: a case variant of the row\'s link is NOT the row\'s link (exact)', (preflightChangeAction('row-9', 'https://pub.example.test/A.pdf', row) as { reason?: string }).reason, 'url-not-on-row');
eq('preflight: url on the row passes', preflightChangeAction('row-9', 'https://pub.example.test/a.pdf', row).ok, true);
eq('reject removes only the flagged hash', hashesAfterReject(row.content_hashes, 'https://pub.example.test/a.pdf'), { k: 'h2' });
eq('reject with no hash for the URL writes nothing', hashesAfterReject(row.content_hashes, 'https://other.test/'), null);
eq('reject with no hashes writes nothing', hashesAfterReject(null, 'https://pub.example.test/a.pdf'), null);

// The discovery → publish draft must not pre-assert verification.
const draft = candidateToGuidelineDraft({
  candidateId: 'c1', stagedId: '00000000-0000-0000-0000-0000000000aa', topic: 'Synthetic', provider: 'SYN',
  changeReason: 'NEW_GUIDELINE', sourceUrl: 'https://pub.example.test/new.pdf', fromLegacyFallback: false, reviewStatus: 'pending',
}, []);
check('a publish draft starts with NO link verification claim', draft.linkVerificationStatus === undefined && draft.linkLastVerified === undefined);
eq('…which the payload sends as "unchecked"', toDbRow(draft).link_verification_status, 'unchecked');
eq('…with no check date', toDbRow(draft).link_last_verified, null);
eq('a publish draft starts as needs-review, not current', draft.guidanceStatus, 'needs-review');

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[B] URL identity — invariants under url-key v3 and v4');
// ════════════════════════════════════════════════════════════════════════════
const V4 = typeof (ingestion as Record<string, unknown>).decodeUnreservedEscapes === 'function';
console.log(`  (url-key ${V4 ? 'v4' : 'v3'} detected)`);
const VECTORS = [
  'https://www.boa.ac.uk/asset/A811FC01-EFC3/',
  'https://www.boa.ac.uk/asset/a811fc01-efc3/',
  'https://www.boa.ac.uk/asset/A811FC01-EFC3',
  'https://WWW.BOA.AC.UK/asset/A811FC01-EFC3/',
  'https://www.boa.ac.uk/asset/a811fc01%2defc3/',
  'https://www.boa.ac.uk/asset/A811FC01%2DEFC3/',
  'https://www.boa.ac.uk/asset/A811FC01-EFC3/?ver=2',
  'https://www.boa.ac.uk/asset/A811FC01-EFC3/?VER=3&x=1',
  'https://www.boa.ac.uk/asset/A811FC01-EFC3/?x=1',
  'https://pub.example.test/a%2Fb.pdf',
  'https://pub.example.test/a/b.pdf',
  'https://pub.example.test/a%3Fb.pdf',
  'https://pub.example.test/a?b.pdf',
  'https://pub.example.test/a%23b.pdf',
  'https://pub.example.test/a#b.pdf',
  'https://pub.example.test/%7Euser/doc.pdf',
  'https://pub.example.test/~user/doc.pdf',
  'https://pub.example.test/a%20b.pdf',
  'https://pub.example.test/a%2520b.pdf',
  '  https://pub.example.test/a/b.pdf  ',
];
let implication = true;
let idempotent = true;
const offenders: string[] = [];
for (const a of VECTORS) {
  if (documentIdentityKey(documentIdentityKey(a)) !== documentIdentityKey(a)) idempotent = false;
  if (normaliseCandidateUrl(normaliseCandidateUrl(a)) !== normaliseCandidateUrl(a)) idempotent = false;
  for (const b of VECTORS) {
    if (documentIdentityKey(a) === documentIdentityKey(b) && normaliseCandidateUrl(a) !== normaliseCandidateUrl(b)) {
      implication = false; offenders.push(`${a} | ${b}`);
    }
  }
}
check('identity-equal ⇒ match-equal for every pair (a hold, keyed on the match key, can never miss an identity-equal link)', implication, offenders.slice(0, 3).join('; '));
check('both keys are idempotent', idempotent);
for (const [enc, raw] of [['%2F', '/'], ['%3F', '?'], ['%23', '#']] as const) {
  const a = `https://pub.example.test/a${enc}b.pdf`;
  const b = `https://pub.example.test/a${raw}b.pdf`;
  check(`reserved escape ${enc} is never collapsed to "${raw}" (identity)`, documentIdentityKey(a) !== documentIdentityKey(b));
  check(`reserved escape ${enc} is never collapsed to "${raw}" (match key)`, normaliseCandidateUrl(a) !== normaliseCandidateUrl(b));
}
check('%2520 (an escaped "%") is not decoded to %20', documentIdentityKey('https://pub.example.test/a%2520b.pdf') !== documentIdentityKey('https://pub.example.test/a%20b.pdf'));
const dashEsc = 'https://www.boa.ac.uk/asset/a811fc01%2defc3/';
const dashRaw = 'https://www.boa.ac.uk/asset/A811FC01-EFC3/';
if (V4) {
  check('v4: an unreserved escape (%2d) shares the loose key with its character', normaliseCandidateUrl(dashEsc) === normaliseCandidateUrl(dashRaw));
} else {
  gap('url-key v3: "%2d" and "-" give DIFFERENT keys, so a rejected or held BOA document rediscovered with escaped hyphens is staged again as new (fixed by PR #322 url-key v4)',
    normaliseCandidateUrl(dashEsc) !== normaliseCandidateUrl(dashRaw));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[C] Candidate identity on rediscovery');
// ════════════════════════════════════════════════════════════════════════════
const cid = (pipeline: PipelineId, provider: string, changeReason: ChangeReason, primaryUrl: string) =>
  makeCandidateId({ pipeline, provider, changeReason, primaryUrl });
const sameDocVariants = [
  'https://pub.example.test/Guidance/Doc.PDF',
  'https://pub.example.test/guidance/doc.pdf',
  'https://PUB.example.test/guidance/doc.pdf/',
  'https://pub.example.test/guidance/doc.pdf?ver=9',
];
const ids = new Set(sameDocVariants.map((u) => cid('sync-providers', 'BOA', 'NEW_GUIDELINE', u)));
check('case / trailing-slash / ?ver variants of one document → ONE candidate id (a rejected row is found again as "existing", not restaged)', ids.size === 1, [...ids].join(', '));
check('provider punctuation does not change the id ("BOA" = "B.O.A.")',
  cid('sync-providers', 'BOA', 'NEW_GUIDELINE', sameDocVariants[0]) === cid('sync-providers', 'B.O.A.', 'NEW_GUIDELINE', sameDocVariants[0]));
check('a different provider is a different id', cid('sync-providers', 'BOA', 'NEW_GUIDELINE', sameDocVariants[0]) !== cid('sync-providers', 'BSG', 'NEW_GUIDELINE', sameDocVariants[0]));

const queueRow = fnBody(QUEUE_SQL, '_queue_row_for');
check('_queue_row_for located', queueRow.length > 0);
check('staging matches an existing candidate id in ANY status first (rejected stays rejected)',
  /select \* into r from public\.staged_guidelines where candidate_id = p_cid;/.test(queueRow));
const openOnly = /where review_status in \('pending', 'deferred'\)\s*\n\s*and \(identity_key = p_identity/.test(queueRow);
check('one open row per document (identity) blocks a duplicate open row', openOnly);
gap('rejection memory is per candidate id: _queue_row_for consults CLOSED rows only by candidate_id, so the same document under another provider, class or producer is re-staged as a new pending row (DISCOVERY-QUEUE-CONTRACT §7; proposed SQL P-3)',
  openOnly && cid('sync-providers', 'BOA', 'NEW_GUIDELINE', sameDocVariants[0]) !== cid('sync-providers', 'BOA', 'POSSIBLE_SAME_DOCUMENT', sameDocVariants[0]));

const stageSync = fnBody(QUEUE_SQL, '_stage_sync_candidate');
check('_stage_sync_candidate located', stageSync.length > 0);
check('sync staging re-derives both keys and refuses disagreement',
  /v_identity := public\.document_identity_key\(v_url\);/.test(stageSync) && /key disagreement/.test(stageSync));
check('sync staging checks the hold list BEFORE looking for a queue row',
  stageSync.indexOf('discovery_staging_holds') > 0 && stageSync.indexOf('discovery_staging_holds') < stageSync.indexOf('_queue_row_for'));
check('sync staging never updates an existing queue row', !/update public\.staged_guidelines/.test(stageSync));
check('a new row is re-checked against the DATABASE catalogue (identity, then loose key for NEW_GUIDELINE)',
  /catalogue_entry_for_identity_key\(v_identity\)/.test(stageSync) && /catalogue_entry_for_match_key\(v_match\)/.test(stageSync));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[D] Failed source retrieval is a failure, never an empty success');
// ════════════════════════════════════════════════════════════════════════════
const realFetch = globalThis.fetch;
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { Object.assign(console, { log, warn, error }); }
};
{
  const abort = (async () => { const e = new Error('This operation was aborted'); e.name = 'AbortError'; throw e; }) as typeof fetch;
  const [r] = await quiet(() => withFetch(abort, () => runDryRun([BOAAdapter], { requireItems: true })));
  check('simulated timeout: the adapter is recorded as FAILED', typeof r.error === 'string' && /abort/i.test(r.error), r.error);
  check('…with no candidates', r.candidates.length === 0 && r.totalDiscovered === 0);

  const garbage = (async () => new Response('<html><body><p>Site maintenance</p></body></html>', { status: 200 })) as typeof fetch;
  const [g] = await quiet(() => withFetch(garbage, () => runDryRun([BOAAdapter], { requireItems: true })));
  check('HTTP 200 without BOA section evidence: FAILED before it can be an empty success', typeof g.error === 'string' && /BOA index structure/.test(g.error), g.error);
  const [g2] = await quiet(() => withFetch(garbage, () => runDryRun([BOAAdapter])));
  check('…requireItems opt-out cannot bypass the BOA structural guard', typeof g2.error === 'string' && /BOA index structure/.test(g2.error));
  const empty: ProviderAdapter = {name:'Synthetic empty adapter',sourceTag:'BOA',async fetchCandidates(){return [];}};
  const [required] = await quiet(()=>runDryRun([empty],{requireItems:true}));
  const [optional] = await quiet(()=>runDryRun([empty]));
  check('generic adapter emptiness fails when items are required', /parsed 0 items/.test(required.error ?? ''));
  check('generic stub opt-out preserves its empty-array contract', !optional.error && optional.totalDiscovered === 0);

  const truncated = (async () => new Response('<html><body><a href="/asset/', { status: 200 })) as typeof fetch;
  const [t] = await quiet(() => withFetch(truncated, () => runDryRun([BOAAdapter], { requireItems: true })));
  check('truncated / malformed HTML: FAILED, not empty', typeof t.error === 'string');

  const http500 = (async () => new Response('err', { status: 500 })) as typeof fetch;
  const [h] = await quiet(() => withFetch(http500, () => runDryRun([BOAAdapter], { requireItems: true })));
  check('HTTP 500: FAILED', typeof h.error === 'string' && /500/.test(h.error), h.error);
  check('the CLI entrypoint requires items', /runDryRun\(adapters, \{ requireItems: true \}\)/.test(read('scripts/sync-providers.ts')));
}

// stage-candidates.ts as a subprocess, DRY_RUN, from a temp cwd (so no .env.local
// is ever loaded) with a clean environment (no credentials).
const STAGE = resolve(ROOT, 'scripts/stage-candidates.ts');
// Absolute, because `--import tsx` resolves from the child's cwd (a temp dir).
const TSX = import.meta.resolve('tsx');
function stage(file: object): { code: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'stage-candidates-'));
  const path = join(dir, 'candidates.json');
  writeFileSync(path, JSON.stringify(file));
  const res = spawnSync(process.execPath, ['--import', TSX, STAGE, path], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', DRY_RUN: 'true', NODE_PATH: join(ROOT, 'node_modules') },
  });
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}
const stub = (sourceTag: string, items: DiscoveredItem[]): ProviderAdapter => ({ name: `Synthetic ${sourceTag}`, sourceTag, async fetchCandidates() { return items; } });
const failing = (sourceTag: string): ProviderAdapter => ({ name: `Failing ${sourceTag}`, sourceTag, async fetchCandidates() { throw new Error('synthetic: connect ETIMEDOUT'); } });
const item = (n: number): DiscoveredItem => ({ topic: `Synthetic guideline ${n}`, source: 'BOA', versions: [{ label: 'PDF', url: `https://synthetic.example.test/guidance-${n}.pdf` }] });
{
  const okAndFailed = buildCandidatesFile(await quiet(() => runDryRun([stub('BOA', [item(1)]), failing('BSG')])), '2026-11-05T00:00:00.000Z');
  const s1 = stage(okAndFailed);
  check('one adapter failed, one succeeded: stage exits 1', s1.code === 1, `exit ${s1.code}\n${s1.out.slice(-600)}`);
  check('…and still lists the good adapter\'s candidate', /Would submit 1 candidate/.test(s1.out));
  check('…and names the failed adapter', /FAILED during discovery[^]*Failing BSG/.test(s1.out));

  const allFailed = buildCandidatesFile(await quiet(() => runDryRun([failing('BOA'), failing('BSG')])), '2026-11-05T00:00:00.000Z');
  const s2 = stage(allFailed);
  check('every adapter failed ("nothing to file"): exit 1, not a green empty run', s2.code === 1, `exit ${s2.code}`);

  const clean = buildCandidatesFile(await quiet(() => runDryRun([stub('BOA', [item(2)])])), '2026-11-05T00:00:00.000Z');
  const s3 = stage(clean);
  check('no failures: exit 0', s3.code === 0, `exit ${s3.code}\n${s3.out.slice(-600)}`);

  // [E] publisher identity through the same path.
  const wrongTag = buildCandidatesFile(await quiet(() => runDryRun([stub('B0A', [item(3)])])), '2026-11-05T00:00:00.000Z');
  const s4 = stage(wrongTag);
  check('[E] an unknown publisher tag ("B0A") is NOT submitted and fails the run', s4.code === 1 && /NOT submitted/.test(s4.out) && !/Would submit/.test(s4.out), `exit ${s4.code}`);
  const otherOwner = buildCandidatesFile(await quiet(() => runDryRun([stub('BESS', [item(4)])])), '2026-11-05T00:00:00.000Z');
  const s5 = stage(otherOwner);
  check('[E] a publisher owned by discovery (BESS) is not staged by sync-providers', /NOT submitted/.test(s5.out) && !/Would submit/.test(s5.out));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[E] Publisher identity');
// ════════════════════════════════════════════════════════════════════════════
eq('ownership: BOA is staged by sync-providers', checkOwnership('BOA', 'sync-providers').ok, true);
eq('ownership: tags are exact — "boa" has no owner', (checkOwnership('boa', 'sync-providers') as { status?: string }).status, 'unowned');
eq('ownership: "B.O.A." has no owner (no silent aliasing at the staging gate)', (checkOwnership('B.O.A.', 'sync-providers') as { status?: string }).status, 'unowned');
eq('ownership: prototype keys are not owners', (checkOwnership('constructor', 'sync-providers') as { status?: string }).status, 'unowned');
check('the queue row\'s publisher (source) is the adapter tag, not the adapter-reported item.source',
  /p_c->>'provider', p_c->>'providerName', p_c->>'topic', p_c->>'provider',/.test(stageSync));
{
  const spoof: DiscoveredItem = { topic: 'Spoofed', source: 'NICE', versions: [{ label: 'x', url: 'https://synthetic.example.test/spoof.pdf' }] };
  const [r] = await quiet(() => runDryRun([stub('BOA', [spoof])]));
  eq('an item claiming source "NICE" from the BOA adapter is filed as BOA', r.candidates[0]?.provider, 'BOA');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[F] Publish guards: ambiguous matches, holds, non-queue candidates');
// ════════════════════════════════════════════════════════════════════════════
const REASONS: QueueReason[] = ['NEW_GUIDELINE', 'REVISED', 'WITHDRAWN', 'CONTENT_DRIFT', 'URL_MOVED', 'UNREACHABLE_LINK', 'POSSIBLE_SAME_DOCUMENT', 'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED'];
const STATUSES: ReviewStatus[] = ['pending', 'deferred', 'accepted', 'rejected', 'resolved'];
const publishable = REASONS.flatMap((r) => STATUSES.flatMap((s) => [false, true].map((h) => [r, s, h] as const)))
  .filter(([r, s, h]) => allowedActions(r, s, null, h).publish);
eq('the ONLY publishable combination is NEW_GUIDELINE + pending + not held', publishable, [['NEW_GUIDELINE', 'pending', false]]);
const app = read('src/App.tsx');
const handler = /const handleReviewCandidate = \(candidate: DisplayCandidate\) => \{[^]*?\n  \};/.exec(app)?.[0] ?? '';
check('App refuses a candidate with no queue row BEFORE the matrix and before opening the form',
  /if \(!candidate\.stagedId\) \{[^]*?return;\s*\}/.test(handler)
  && handler.indexOf('!candidate.stagedId') < handler.indexOf('allowedActions(')
  && handler.indexOf('!candidate.stagedId') < handler.indexOf('setEditingGuideline'));
check('…the old fail-open condition is gone', !/if \(candidate\.stagedId && !allowedActions/.test(app));

const approve = fnBody(QUEUE_SQL, 'approve_staged_guideline');
check('approve_staged_guideline (20261024) located', approve.length > 0);
check('approve: null-safe editor gate first', approve.indexOf('is_editor() is not true') > 0 && approve.indexOf('is_editor() is not true') < approve.indexOf('select * into v_staged'));
check('approve: refuses anything but NEW_GUIDELINE (ambiguous matches cannot publish) — 42809',
  /if v_staged\.change_reason <> 'NEW_GUIDELINE' then[^]*?errcode = '42809'/.test(approve));
check('approve: refuses a NEW_GUIDELINE row linked to an existing entry', /if v_staged\.matched_guideline_id is not null then[^]*?errcode = '42809'/.test(approve));
check('approve: refuses an exact identity holder and a near (loose-key) holder',
  /catalogue_entry_for_identity_key\(public\.document_identity_key\(v_staged\.primary_url\)\)/.test(approve)
  && /catalogue_entry_for_match_key\(public\.document_match_key\(v_staged\.primary_url\)\)/.test(approve));
check('approve: hold checked on the staged document AND on every link being published (RQ002)',
  /where match_key = public\.document_match_key\(v_staged\.primary_url\)/.test(approve)
  && /jsonb_array_elements\(v_new\.versions\) v\s*\n\s*join public\.discovery_staging_holds h on h\.match_key = public\.document_match_key\(v->>'url'\)/.test(approve));
gap('approve: duplicate checks use v_staged.primary_url only — the links actually PUBLISHED (v_new.versions, editable in the form) are checked against holds but NOT against the catalogue, so an edited link can publish a duplicate (proposed SQL P-1)',
  !/catalogue_entry_for_identity_key\([^)]*v->>'url'/.test(approve));
gap('approve: a row with primary_url NULL skips every duplicate check (proposed SQL P-1)',
  /if v_staged\.primary_url is not null then\s*\n\s*v_holder := public\.catalogue_entry_for_identity_key/.test(approve));
gap('approve: link_verification_status / link_last_verified are taken from the editor payload, so publishing can assert "verified" with no check (proposed SQL P-2)',
  /coalesce\(v_new\.link_verification_status, 'unchecked'\),\s*\n\s*v_new\.link_last_verified/.test(approve));
gap('approve: a payload without guidance_status publishes as "current" (proposed SQL P-4, clinical-status rule — owner decision)',
  /coalesce\(v_new\.guidance_status, 'current'\)/.test(approve));
gap('editors hold a direct INSERT/UPDATE policy on guidelines, so the ordinary add/edit path bypasses every approve-time duplicate and hold check (proposed SQL P-1 trigger)',
  /create policy guidelines_editor_insert\s*\n\s*on public\.guidelines\s*\n\s*for insert/.test(ROLES_SQL));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[G] Static export integrity');
// ════════════════════════════════════════════════════════════════════════════
const dbRow = (over: Partial<DbGuideline>): DbGuideline => ({
  id: 'syn-g', section: 'S', type: 'T', topic: 'Topic', sub_group: null, source: 'SYN', summary: null, notes: null,
  status: 'Verified', regional_variation: false, local_overlay_needed: false, last_checked: null, cross_listed_in: [],
  priority: null, archived: false, source_access_status: null, link_verification_status: 'unchecked', link_last_verified: null,
  link_verification_notes: null, versions: [{ label: 'Source', url: 'https://pub.example.test/g.pdf' }], source_type: 'national',
  guidance_status: 'needs-review', scope_note: null, editorial_review_date: null, inclusion_reason: 'synthetic', created_at: '', updated_at: '',
  ...over,
});
for (const s of ['unchecked', 'verified', 'needs-review', 'broken', 'moved', 'withdrawn', 'superseded', 'blocked']) {
  const g = toGuideline(dbRow({ link_verification_status: s, link_last_verified: s === 'unchecked' ? null : '2026-10-01' }));
  check(`export maps link status "${s}" through unchanged`, g.linkVerificationStatus === s);
}
const unchecked = toGuideline(dbRow({}));
check('an unchecked row exports with NO check date (none invented)', unchecked.linkLastVerified === undefined);
check('an unchecked row is never upgraded', unchecked.linkVerificationStatus === 'unchecked');
check('guidance status passes through (never defaulted to current on export)', unchecked.guidanceStatus === 'needs-review');
const round = toDbRow(toGuideline(dbRow({ link_verification_status: 'moved', link_last_verified: '2026-10-02', link_verification_notes: 'n' })));
eq('row → Guideline → row keeps the verification triple', [round.link_verification_status, round.link_last_verified, round.link_verification_notes], ['moved', '2026-10-02', 'n']);
const exportSrc = read('scripts/export-static.ts');
check('export-static sets no verification field itself', !/link_verification_status|linkVerificationStatus|linkLastVerified/.test(exportSrc));
check('export-static runs the integrity check before writing', exportSrc.indexOf('exportIntegrityProblems(guidelines)') > 0 && exportSrc.indexOf('exportIntegrityProblems(guidelines)') < exportSrc.indexOf('writeFileSync(DATA_FILE'));
eq('the committed static catalogue passes the integrity check', exportIntegrityProblems(GUIDELINES_DATA as Guideline[], '2026-11-05'), []);
const g0 = GUIDELINES_DATA[0] as Guideline;
const bad = (over: Partial<Guideline>) => exportIntegrityProblems([{ ...g0, ...over }], '2026-11-05');
check('refuses "verified" with no check date', bad({ linkVerificationStatus: 'verified', linkLastVerified: undefined }).some((p) => /no date/.test(p)));
check('refuses "verified" with no http(s) link', bad({ linkVerificationStatus: 'verified', linkLastVerified: '2026-10-01', versions: [{ label: 'x', url: '#' }] }).some((p) => /no http/.test(p)));
check('refuses a future check date', bad({ linkLastVerified: '2027-01-01' }).some((p) => /future/.test(p)));
check('refuses a non-date', bad({ linkLastVerified: '06/08/2026' }).some((p) => /not a YYYY-MM-DD/.test(p)));
check('refuses a date that JavaScript would roll into the next month', bad({linkLastVerified:'2026-02-30'}).some(p=>/not a YYYY-MM-DD/.test(p)));
check('refuses February 29 in a non-leap year', bad({linkLastVerified:'2025-02-29'}).some(p=>/not a YYYY-MM-DD/.test(p)));
check('accepts a real leap-day check date', bad({linkLastVerified:'2024-02-29'}).length === 0);
check('refuses an unknown status', bad({ linkVerificationStatus: 'approved' as Guideline['linkVerificationStatus'] }).some((p) => /unknown link status/.test(p)));
check('refuses duplicate ids', exportIntegrityProblems([g0, g0], '2026-11-05').some((p) => /duplicate id/.test(p)));
check('accepts unchecked with no date', bad({ linkVerificationStatus: 'unchecked', linkLastVerified: undefined }).length === 0);

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[H] Idempotent review actions and audit trail (SQL source)');
// ════════════════════════════════════════════════════════════════════════════
const resolveFn = fnBody(QUEUE_SQL, 'resolve_discovery_candidate');
for (const [name, fn, guard] of [
  ['approve', approve, "review_status <> 'pending'"],
  ['resolve', resolveFn, "review_status not in ('pending', 'deferred')"],
] as const) {
  check(`${name}: locks the row (FOR UPDATE) before testing its state`, fn.indexOf('for update') > 0 && fn.indexOf('for update') < fn.indexOf(guard));
  check(`${name}: a closed row is refused with 55000 (a retry cannot act twice)`, new RegExp(`${guard.replace(/[()']/g, (c) => `\\${c}`)}[^]*?errcode = '55000'`).test(fn));
  check(`${name}: requires a non-blank note`, /!~ '\\S'/.test(fn));
  check(`${name}: appends to staged_discovery_decisions in the same function`, /insert into public\.staged_discovery_decisions/.test(fn));
}
check('approve: the decision-log insert follows the publish (logged iff it published)', approve.indexOf('insert into public.guidelines') < approve.indexOf('insert into public.staged_discovery_decisions'));
check('approve: the changelog entry is written in the same transaction as the guideline', approve.indexOf('insert into public.guidelines') < approve.indexOf('insert into public.guideline_changelog'));
for (const t of ['staged_discovery_decisions', 'staged_discovery_evidence']) {
  check(`${t}: UPDATE/DELETE forbidden by trigger`, new RegExp(`before update or delete on public\\.${t}\\s*\\n\\s*for each row execute function public\\.forbid_mutation\\(\\)`).test(QUEUE_SQL));
  check(`${t}: TRUNCATE forbidden by trigger`, new RegExp(`before truncate on public\\.${t}\\s*\\n\\s*for each statement execute function public\\.forbid_mutation\\(\\)`).test(QUEUE_SQL));
}
check('guideline_changelog: editors get INSERT only (no UPDATE/DELETE policy)',
  /create policy changelog_editor_insert\s*\n\s*on public\.guideline_changelog\s*\n\s*for insert/.test(ROLES_SQL)
  && !/on public\.guideline_changelog\s*\n\s*for (update|delete)/.test(ROLES_SQL + QUEUE_SQL));
check('GitHub acknowledgement has no database client or mutation surface', !/createClient|from\('(?:guidelines|guideline_changelog)'\)|supabase\./.test(read('scripts/approve-change.ts')));
check('GitHub acknowledgement ignores a closed issue', /if\s*\(issue\.state\s*!==\s*'open'\)/.test(read('scripts/approve-change.ts')));
check('GitHub acknowledgement explicitly disclaims database or publication authority', read('scripts/approve-change.ts').includes('No database, verification, clinical approval or publication change'));

// ════════════════════════════════════════════════════════════════════════════
console.log('\n[I] Trust boundaries in GitHub workflows');
// ════════════════════════════════════════════════════════════════════════════
const WF = ['approve-change', 'dead-link-check', 'deploy', 'guideline-sync'];
const wf = Object.fromEntries(WF.map((n) => [n, read(`.github/workflows/${n}.yml`)]));
const UNTRUSTED = /\$\{\{\s*github\.event\.(comment\.body|issue\.title|issue\.body|pull_request\.(title|body|head\.ref))\s*\}\}/;
/** Every line of shell a workflow runs: inline `run: x` and the body of `run: |` blocks. */
function shellLines(yml: string): string[] {
  const out: string[] = [];
  const lines = yml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] && !/^[|>][-+]?\s*$/.test(m[2])) { out.push(m[2]); continue; }
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      if ((/^(\s*)/.exec(lines[j])?.[1].length ?? 0) <= indent) break;
      out.push(lines[j]);
    }
  }
  return out;
}
for (const n of WF) {
  const sh = shellLines(wf[n]);
  check(`${n}.yml: no untrusted event text interpolated into a shell step (${sh.length} shell line(s) scanned)`,
    sh.length > 0 && !sh.some((l) => UNTRUSTED.test(l)));
}
check('the shell scan detects an injected line (self-test)',
  shellLines('    steps:\n      - run: |\n          echo "${{ github.event.comment.body }}"\n').some((l) => UNTRUSTED.test(l)));
check('…and does not flag the same text in env (self-test)',
  !shellLines('      - env:\n          X: ${{ github.event.comment.body }}\n        run: npx tsx a.ts\n').some((l) => UNTRUSTED.test(l)));
const approveWf = wf['approve-change'];
check('approve-change.yml: acts only on the pending-guideline-update label', /contains\(github\.event\.issue\.labels\.\*\.name, 'pending-guideline-update'\)/.test(approveWf));
check('approve-change.yml: acts only on OWNER / COLLABORATOR / MEMBER comments',
  /author_association == 'OWNER'/.test(approveWf) && /author_association == 'COLLABORATOR'/.test(approveWf) && /author_association == 'MEMBER'/.test(approveWf)
  && !/author_association == '(CONTRIBUTOR|NONE|FIRST_TIME_CONTRIBUTOR)'/.test(approveWf));
check('approve-change.yml: the comment reaches the script as an env var', /COMMENT_BODY: \$\{\{ github\.event\.comment\.body \}\}/.test(approveWf));
const serviceRoleUsers = WF.filter((n) => /SUPABASE_SERVICE_ROLE_KEY/.test(wf[n].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')));
eq('only these workflows hold the service-role key (a new one must be a deliberate change)', serviceRoleUsers, ['guideline-sync']);
check('deploy.yml: the build never sees the service-role key', !/SERVICE_ROLE/.test(wf.deploy.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')));
gap('approve-change.yml: COLLABORATOR includes read-only collaborators; the gate is GitHub association, not the database editor allowlist (owner decision: restrict to OWNER)',
  /author_association == 'COLLABORATOR'/.test(approveWf) && serviceRoleUsers.includes('approve-change'));

console.log(`\n──────── ${pass} passed, ${fail} failed (${gaps} known gap(s) printed, not counted) ────────\n`);
process.exit(fail > 0 ? 1 : 0);
