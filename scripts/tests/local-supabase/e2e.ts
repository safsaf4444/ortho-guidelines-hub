/**
 * scripts/tests/local-supabase/e2e.ts
 * ───────────────────────────────────
 * Dashboard end-to-end test: the real app (Vite dev server) in Chromium
 * against the disposable LOCAL Supabase, with synthetic fixtures only.
 * Run it through run.ts (`npx tsx scripts/tests/local-supabase/run.ts e2e`).
 *
 * Safety:
 *   - refuses unless LOCAL_SUPABASE_URL is loopback;
 *   - the app is started with VITE_SUPABASE_URL/ANON_KEY = the local stack
 *     (process env overrides .env.local in Vite);
 *   - EVERY browser request to a non-loopback host is aborted and recorded,
 *     service workers are blocked, and the run FAILS if any request to a
 *     *.supabase.co host was even attempted;
 *   - it asserts the app really talked to the local API.
 */
import { chromium, type Locator, type Page } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { documentIdentityKey, makeCandidateId, normaliseCandidateUrl } from '../../lib/ingestion';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { applyFile, M25, makeChecks, prepareSchema, psql as stackPsql, REPO, requireLoopbackEnv, WORK } from './stack';

// Browser-side globals, used only inside page.evaluate / waitForFunction
// callbacks (which run in the page). Declared here rather than adding the DOM
// lib to every script in tsconfig.scripts.json.
declare const document: {
  querySelector(selector: string): { getAttribute(name: string): string | null; textContent: string | null } | null;
  querySelectorAll(selector: string): ArrayLike<{ value: string }>;
  body: { innerText: string };
};

const { url: SB_URL, anonKey: ANON, serviceKey: SERVICE } = requireLoopbackEnv();
const PORT = 5199;
const APP = `http://127.0.0.1:${PORT}/ortho-guidelines-hub/`;
fs.mkdirSync(WORK, { recursive: true });

const { check, eq, fail: countFail, counts } = makeChecks();

function psql(sql: string) {
  const r = stackPsql(sql);
  if (r.status !== 0) throw new Error(`psql failed: ${r.err}`);
  return r.out;
}
const fingerprint = () => psql(`select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g;
  select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c;`);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const EDITOR = { email: 'e2e-editor@local.test', password: 'local-e2e-Password1!' };
// A second allowlisted editor, for the draft-privacy phase (P2b).
const EDITOR_B = { email: 'e2e-editor-b@local.test', password: 'local-e2e-Password2!' };

async function seed() {
  const service = createClient(SB_URL, SERVICE, opts);
  const rows = GUIDELINES_DATA.map(toDbRow);
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await service.from('guidelines').insert(rows.slice(i, i + 50));
    if (error) throw new Error(`seed failed: ${error.message}`);
  }
  const created = await service.auth.admin.createUser({ email: EDITOR.email, password: EDITOR.password, email_confirm: true });
  const id = created.data.user?.id;
  if (!id) throw new Error(`editor create failed: ${created.error?.message}`);
  const createdB = await service.auth.admin.createUser({ email: EDITOR_B.email, password: EDITOR_B.password, email_confirm: true });
  const idB = createdB.data.user?.id;
  if (!idB) throw new Error(`editor B create failed: ${createdB.error?.message}`);
  // LOCAL ONLY: the production allowlist names real accounts; replace it here with the test editors.
  const def = psql(`select pg_get_functiondef('public.is_editor()'::regprocedure)`);
  psql(def.replace(/array\[[\s\S]*?\]/, `array['${id}'::uuid, '${idB}'::uuid]`) + ';');
  const editor = createClient(SB_URL, ANON, opts);
  const { error } = await editor.auth.signInWithPassword(EDITOR);
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
  return { service, editor, editorId: id };
}

function disc(over: Record<string, unknown> & { discoveredUrl: string; discoveryId: string }) {
  return {
    classification: 'NEW_GUIDELINE', provider: 'BOFAS', providerName: 'BOFAS (synthetic e2e)', topic: 'E2E item',
    surfaceUrl: 'https://www.example.org/e2e/index', statedLabels: [], urlAlternatives: [],
    observedAt: '2026-10-25T00:00:00.000Z', reportSchemaVersion: 1,
    sourceUrlKey: documentIdentityKey(over.discoveredUrl), ...over,
  };
}

// Edition evidence shaped as #220's producer emits it.
const softMatch = (guidelineId: string) => ({
  guidelineId, guidelineTopic: 'synthetic', guidelineSource: 'synthetic', titleSimilarity: 0.8,
  sharedTitleTokens: ['e2e'], sharedPublishers: ['BOFAS'], discoveredPublishers: ['BOFAS'],
  publishersFromTitle: [], cataloguePublishers: ['BOFAS'],
});
const tokenChange = (guidelineId: string) => ({
  parameter: 'ver', previousValue: 'E2E-OLD', observedValue: 'E2E-NEW', previousObservedAt: '2026-10-01T00:00:00.000Z',
  guidelineId, statement: 'Synthetic e2e token change.',
});
// Catalogue links held by exactly one entry, without a query: a token change
// is that link plus ?ver=, so it relates EXACTLY to its own entry and no other.
const keyCount = new Map<string, number>();
for (const g of GUIDELINES_DATA) for (const v of g.versions ?? []) {
  if (v.url && v.url !== '#') keyCount.set(normaliseCandidateUrl(v.url), (keyCount.get(normaliseCandidateUrl(v.url)) ?? 0) + 1);
}
const tokenTargets = GUIDELINES_DATA.flatMap((g) => {
  const v = (g.versions ?? []).find((x) => x.url && x.url !== '#' && !x.url.includes('?') && keyCount.get(normaliseCandidateUrl(x.url)) === 1);
  return v ? [{ id: g.id, url: v.url }] : [];
});
const tokenOf = (i: number) => {
  const t = tokenTargets[i];
  if (!t) throw new Error('not enough single-entry catalogue links for the token fixtures');
  return { matchedGuidelineId: t.id, discoveredUrl: `${t.url}?ver=E2E-NEW`, tokenChange: tokenChange(t.id) };
};

// ── app + browser ─────────────────────────────────────────────────────────
let vite: ChildProcess | null = null;
async function startApp() {
  vite = spawn(process.execPath, [path.join(REPO, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: REPO,
    env: { ...process.env, VITE_SUPABASE_URL: SB_URL, VITE_SUPABASE_ANON_KEY: ANON },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(APP)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('vite did not start');
}
function stopApp() {
  if (!vite?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F']);
  else vite.kill('SIGTERM');
}

const externalAttempts: string[] = [];
let localApiCalls = 0;
const dialogs: string[] = [];
const apiPort = new URL(SB_URL).port;

async function signIn(page: Page) {
  await page.goto(APP);
  await signInHere(page, EDITOR);
}
/** Sign in WITHOUT navigating, so in-page state (drafts) is not reset by a reload. */
async function signInHere(page: Page, who: { email: string; password: string }) {
  await page.click('button[title^="Sign in as an editor"]');
  await page.fill('#editor-email', who.email);
  await page.fill('#editor-password', who.password);
  await page.press('#editor-password', 'Enter');
  await page.waitForSelector('#editor-email', { state: 'detached', timeout: 15000 });
}
async function signOutHere(page: Page) {
  await page.click('button[title^="Sign out"]');
  await page.waitForSelector('button[title^="Sign in as an editor"]', { timeout: 15000 });
}
/** Every visible text AND every form value (typed text lives in .value, not in the HTML). */
const pageText = (page: Page) => page.evaluate(() =>
  document.body.innerText + '\n' + Array.from(document.querySelectorAll('textarea, input')).map((e) => e.value).join('\n'));
const PRIVATE = 'PRIVATE-DRAFT';
async function openQueue(page: Page) {
  await page.click('button[title^="Manually review discovered guideline candidates"]');
  await page.waitForSelector('[data-testid=group-pending], [data-testid=queue-state], [data-testid=queue-empty]', { timeout: 15000 });
}
const card = (page: Page, cid: string): Locator => page.locator(`[data-testid=queue-card][data-candidate-id="${cid}"]`);
const btn = (c: Locator, name: string) => c.getByRole('button', { name, exact: true });
async function rowState(id: string) {
  return psql(`select review_status||'|'||coalesce(review_outcome,'-') from public.staged_guidelines where id='${id}'`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' });
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
    if (u.port === apiPort) localApiCalls++;
    return route.continue();
  }
  externalAttempts.push(u.href);
  return route.abort();
});
const page = await context.newPage();
page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });

try {
  // ══ Phase 1: upgrade (20261024) WITHOUT 20261025 ═══════════════════════
  console.log('\n[P1] Review-queue upgrade applied, reject-open migration NOT applied');
  prepareSchema({ with24: true, with25: false });
  const { service, editor } = await seed();
  await startApp();

  const stage = (c: object) => service.rpc('stage_discovery_candidate', { p_run_id: 'e2e-run', p_producer: 'discover', p_candidate: c });
  const F1 = disc({ discoveryId: 'e2e-new', topic: 'E2E new guideline', discoveredUrl: 'https://www.example.org/e2e/New-Guideline.pdf' });
  const F3 = disc({ discoveryId: 'e2e-edition', topic: 'E2E possible edition', classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'ankle-fracture', discoveredUrl: 'https://www.example.org/e2e/Edition.pdf', softMatch: softMatch('ankle-fracture') });
  const F4 = disc({ discoveryId: 'e2e-token', topic: 'E2E token change', classification: 'EDITION_TOKEN_CHANGED', ...tokenOf(0) });
  const F6 = disc({ discoveryId: 'e2e-stale', topic: 'E2E stale view', classification: 'EDITION_TOKEN_CHANGED', ...tokenOf(1) });
  const ids: Record<string, string> = {};
  for (const c of [F1, F3, F4, F6]) {
    const r = await stage(c);
    if (r.error) throw new Error(`stage ${c.discoveryId}: ${r.error.message}`);
    ids[c.discoveryId] = (r.data as { stagedId: string }).stagedId;
  }
  // Comparison row through the sync path, against a real catalogue link.
  let entry: { id: string; url: string } | null = null;
  for (const g of GUIDELINES_DATA) for (const v of g.versions ?? []) {
    if (!entry && v.url && !v.url.includes('?') && /\/[^/?#]*[A-Z][^/?#]*$/.test(v.url)) entry = { id: g.id, url: v.url };
  }
  if (!entry) throw new Error('no catalogue URL with an upper-case last segment');
  const lowered = entry.url.replace(/\/([^/]*)$/, (_m, s: string) => `/${s.toLowerCase()}`);
  const F2cid = makeCandidateId({ pipeline: 'sync-providers', provider: 'BOFAS', changeReason: 'POSSIBLE_SAME_DOCUMENT', primaryUrl: lowered });
  const reason = 'E2E: the links are equal only if letter case in the path is ignored. Compare the documents before deciding.';
  const sync = await service.rpc('stage_sync_candidates', { p_run_id: 'e2e-sync-run', p_candidates: [{
    candidateId: F2cid, schemaVersion: 2, pipeline: 'sync-providers', provider: 'BOFAS', providerName: 'BOFAS (synthetic e2e)',
    topic: 'E2E comparison', summary: null, notes: `REQUIRES DOCUMENT COMPARISON with catalogue entry ${entry.id}: ${reason}`,
    versions: [{ label: 'L', url: lowered }], primaryUrl: normaliseCandidateUrl(lowered), sourceUrlKey: documentIdentityKey(lowered),
    changeReason: 'POSSIBLE_SAME_DOCUMENT', discoveredAt: '2026-10-25T00:00:00.000Z', providerRef: null,
    matchedGuidelineId: entry.id,
    documentComparison: { basis: 'match-key-only', guidelineId: entry.id, guidelineIds: [entry.id], catalogueUrl: entry.url, discoveredUrl: lowered, reason },
  }] });
  const syncOut = (sync.data as Array<{ status: string; stagedId: string; message?: string }>)?.[0];
  if (syncOut?.status !== 'staged') throw new Error(`sync stage: ${JSON.stringify(sync.error ?? syncOut)}`);
  ids.F2 = syncOut.stagedId;
  psql(`insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason)
        values ('e2e-legacy', 'BOFAS', 'E2E legacy row', '[]', 'https://www.example.org/legacy/doc.pdf', 'NEW_GUIDELINE');`);
  await editor.rpc('resolve_discovery_candidate', { p_staged_id: ids['e2e-edition'], p_action: 'defer', p_note: 'later (e2e)' });
  await editor.rpc('resolve_discovery_candidate', { p_staged_id: ids['e2e-token'], p_action: 'needs-document-check', p_note: 'check (e2e)' });
  const fp = fingerprint();

  await signIn(page);
  await openQueue(page);

  // Grouping and deferred visibility
  const pendingGroup = page.locator('[data-testid=group-pending]');
  const deferredGroup = page.locator('[data-testid=group-deferred]');
  check('Pending and Deferred groups are both shown', (await pendingGroup.count()) === 1 && (await deferredGroup.count()) === 1);
  eq('Deferred heading counts the deferred row', (await deferredGroup.locator('h3').innerText()).trim(), 'Deferred (1)');
  eq('the deferred row is in the Deferred group', await deferredGroup.locator('[data-candidate-id="e2e-edition"]').count(), 1);
  eq('Pending holds the five pending rows (new, comparison, token, stale, legacy)', (await pendingGroup.locator('h3').innerText()).trim(), 'Pending (5)');

  // Action restrictions
  const c1 = card(page, 'e2e-new');
  const c2 = card(page, F2cid);
  const c3 = card(page, 'e2e-edition');
  const c4 = card(page, 'e2e-token');
  eq('NEW_GUIDELINE offers Review & publish', await btn(c1, 'Review & publish…').count(), 1);
  for (const [n, c] of [['comparison', c2], ['deferred edition', c3], ['token change', c4], ['stale', card(page, 'e2e-stale')]] as const) {
    eq(`${n} row: NO Review & publish`, await btn(c, 'Review & publish…').count(), 0);
  }
  eq('comparison row offers its decisions', [await btn(c2, 'Same document…').count(), await btn(c2, 'Different document…').count(), await btn(c2, 'Defer…').count(), await btn(c2, 'Reject…').count()], [1, 1, 1, 1]);
  eq('deferred row is not offered Defer again', await btn(c3, 'Defer…').count(), 0);
  eq('row with a needs-document-check follow-up is not offered it again', await btn(c4, 'Needs document check…').count(), 0);
  check('open follow-up is shown on the card', /Open follow-up: needs a document check/.test(await c4.locator('[data-testid=follow-up]').innerText()));

  // Matched entry, original URL, reason, uncertainty
  check('comparison row names the matched entry', (await c2.locator('[data-testid=matched-entry]').innerText()).includes(entry.id));
  eq('comparison row shows the discovered URL verbatim', (await c2.locator('[data-testid=discovered-url]').innerText()).trim(), lowered);
  check('comparison row shows the reason', (await c2.locator('[data-testid=comparison-reason]').innerText()).includes('letter case in the path'));
  check('pre-migration row is flagged as uncertain', await card(page, 'e2e-legacy').locator('[data-testid=uncertain]').isVisible());

  // Evidence and history on demand
  await btn(c2, 'Evidence & history').click();
  await c2.locator('[data-testid=history]').waitFor();
  check('evidence lists the sighting with the comparison reason', (await c2.locator('[data-testid=evidence-list]').innerText()).includes('letter case in the path'));
  await btn(c3, 'Evidence & history').click();
  await c3.locator('[data-testid=decision-list]').waitFor();
  check('decision history lists the defer decision with its note', /defer[\s\S]*later \(e2e\)/.test(await c3.locator('[data-testid=decision-list]').innerText()));
  check('edition evidence says how its link relates to the entry (none: rests on the title match)',
    /no match with its links/.test(await c3.locator('[data-testid=catalogue-relation]').innerText()));
  await btn(c4, 'Evidence & history').click();
  await c4.locator('[data-testid=history]').waitFor();
  check('token-change evidence: the link is the same document as one of the entry\'s links',
    /same document as one of its catalogue links/.test(await c4.locator('[data-testid=catalogue-relation]').innerText()));

  // Resolve: different-document stays open, nothing published
  await btn(c2, 'Different document…').click();
  await c2.locator(`textarea[id="resolve-note-${F2cid}"]`).fill('Different document (e2e)');
  await btn(c2, 'Record decision').click();
  await page.locator('[data-testid=decision-recorded]').waitFor();
  const banner = await page.locator('[data-testid=decision-recorded]').innerText();
  check('decision banner says the item stays open and nothing was published', /stays open/.test(banner) && /Nothing was published/.test(banner), banner);
  await page.waitForSelector(`[data-testid=group-pending] [data-candidate-id="${F2cid}"] [data-testid=follow-up]`);
  eq('…the row is still pending, now with the follow-up', await rowState(ids.F2), 'pending|different-document-awaiting-refiling');

  // Draft preserved across cancel, and across an UNCONFIRMED failure
  await btn(c1, 'Reject…').click();
  await c1.locator('textarea[id="reject-reason-e2e-new"]').fill('draft reason (e2e)');
  await btn(c1, 'Cancel').click();
  await btn(c1, 'Reject…').click();
  eq('the reject draft survives Cancel', await c1.locator('textarea[id="reject-reason-e2e-new"]').inputValue(), 'draft reason (e2e)');
  await page.route('**/rest/v1/rpc/reject_staged_candidate', (r) => r.abort('failed'));
  await btn(c1, 'Confirm rejection').click();
  await c1.locator('[role=alert]').waitFor();
  check('a dropped response is reported as NOT confirmed (not as failure or success)', /could not be confirmed/i.test(await c1.locator('[role=alert]').innerText()));
  await page.unroute('**/rest/v1/rpc/reject_staged_candidate');
  eq('…the draft survives the failure', await c1.locator('textarea[id="reject-reason-e2e-new"]').inputValue(), 'draft reason (e2e)');
  eq('…and the row is untouched', await rowState(ids['e2e-new']), 'pending|-');

  // Already processed: rejected behind the UI's back
  psql(`update public.staged_guidelines set review_status='rejected', review_note='rejected elsewhere (e2e)', reviewed_at=now() where id='${ids['e2e-new']}';`);
  await btn(c1, 'Confirm rejection').click();
  await page.waitForFunction(() => /no longer open/.test(document.querySelector('[data-candidate-id="e2e-new"] [role=alert]')?.textContent ?? ''));
  check('already-processed is reported from the read-back, not guessed', /This candidate is already rejected/.test(await c1.locator('[role=alert]').innerText()));

  // Deferred reject WITHOUT 20261025 → feature unavailable, nothing written
  await btn(c3, 'Reject…').click();
  await c3.locator('textarea[id="reject-reason-e2e-edition"]').fill('Out of scope (e2e)');
  await btn(c3, 'Confirm rejection').click();
  await c3.locator('[role=alert]').waitFor();
  check('rejecting a deferred row without 20261025 says "Feature unavailable"', /Feature unavailable/.test(await c3.locator('[role=alert]').innerText()));
  eq('…and the deferred row is untouched', await rowState(ids['e2e-edition']), 'deferred|-');
  eq('Phase 1 changed nothing in the catalogue or changelog', fingerprint(), fp);

  // ══ Phase 2: apply 20261025 ═════════════════════════════════════════════
  console.log('\n[P2] 20261025 applied');
  const a25 = applyFile(M25);
  check('20261025 applied', a25.status === 0 && psql(`select to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is not null`) === 't', a25.err);
  await new Promise((r) => setTimeout(r, 1500));       // PostgREST schema reload
  await page.reload();
  await openQueue(page);
  const c3b = card(page, 'e2e-edition');
  await btn(c3b, 'Reject…').click();
  eq('the reject draft for the deferred row is gone after a page reload (session-only, by design)', await c3b.locator('textarea[id="reject-reason-e2e-edition"]').inputValue(), '');
  await c3b.locator('textarea[id="reject-reason-e2e-edition"]').fill('Out of scope (e2e)');
  await btn(c3b, 'Confirm rejection').click();
  await page.getByText('and recorded your reason').waitFor();
  await page.reload();
  await openQueue(page);
  eq('rejection persists: the deferred row is gone after a reload', await card(page, 'e2e-edition').count(), 0);
  eq('…and the database says rejected', await rowState(ids['e2e-edition']), 'rejected|-');
  eq('…with a reject log entry from deferred', psql(`select action||'|'||from_status from public.staged_discovery_decisions where staged_id='${ids['e2e-edition']}' order by decided_at desc limit 1`), 'reject|deferred');

  // Open follow-up: explicit confirmation
  const c4b = card(page, 'e2e-token');
  await btn(c4b, 'Reject…').click();
  await c4b.locator('textarea[id="reject-reason-e2e-token"]').fill('Not needed (e2e)');
  check('the confirmation checkbox is shown for an open follow-up', await c4b.getByRole('checkbox').isVisible());
  await btn(c4b, 'Confirm rejection').click();
  check('without the tick, nothing is sent and the editor is told why', /Tick the confirmation/.test(await c4b.locator('[role=alert]').innerText()));
  eq('…row untouched', await rowState(ids['e2e-token']), 'pending|needs-document-check');
  await c4b.getByRole('checkbox').check();
  await btn(c4b, 'Confirm rejection').click();
  await page.getByText('and recorded your reason').waitFor();
  eq('with the tick: rejected, follow-up closed', await rowState(ids['e2e-token']), 'rejected|-');
  eq('…previous outcome logged', psql(`select from_outcome from public.staged_discovery_decisions where staged_id='${ids['e2e-token']}' and action='reject'`), 'needs-document-check');

  // Stale view: a follow-up appeared after the page loaded → server RQ001 → checkbox appears
  const c6 = card(page, 'e2e-stale');
  await btn(c6, 'Reject…').click();
  check('stale row: no checkbox at first (no follow-up when loaded)', (await c6.getByRole('checkbox').count()) === 0);
  psql(`update public.staged_guidelines set review_outcome='needs-document-check' where id='${ids['e2e-stale']}';`);
  await c6.locator('textarea[id="reject-reason-e2e-stale"]').fill('Stale reject (e2e)');
  await btn(c6, 'Confirm rejection').click();
  await c6.getByRole('checkbox').waitFor();
  check('the server\'s demand for confirmation is shown, nothing written', /open follow-up/.test(await c6.locator('[role=alert]').innerText()) && (await rowState(ids['e2e-stale'])) === 'pending|needs-document-check');
  eq('…the reason survived the refusal', await c6.locator('textarea[id="reject-reason-e2e-stale"]').inputValue(), 'Stale reject (e2e)');
  await c6.getByRole('checkbox').check();
  await btn(c6, 'Confirm rejection').click();
  await page.getByText('and recorded your reason').waitFor();
  eq('…then rejected after explicit confirmation', await rowState(ids['e2e-stale']), 'rejected|-');

  // Closing a comparison never claims publication
  const c2b = card(page, F2cid);
  await btn(c2b, 'Same document…').click();
  await c2b.locator(`textarea[id="resolve-note-${F2cid}"]`).fill('Same PDF (e2e)');
  await btn(c2b, 'Record decision').click();
  await page.locator('[data-testid=decision-recorded]').waitFor();
  const banner2 = await page.locator('[data-testid=decision-recorded]').innerText();
  check('closing banner: nothing published, catalogue unchanged', /closed the item/.test(banner2) && /Nothing was published and the catalogue was not changed/.test(banner2), banner2);
  eq('…row resolved, not accepted', await rowState(ids.F2), 'resolved|same-document');
  eq('no dashboard action changed the catalogue or changelog', fingerprint(), fp);
  eq('no App alert was raised (no publish path was ever entered)', dialogs, []);

  // ══ Phase 2b: drafts belong to the account that typed them ══════════════
  console.log('\n[P2b] Draft privacy: sign-out, a second editor, an account change from another tab');
  const F7 = disc({ discoveryId: 'e2e-private', topic: 'E2E private draft', classification: 'EDITION_TOKEN_CHANGED', ...tokenOf(2) });
  const s7 = await stage(F7);
  if (s7.error) throw new Error(`stage e2e-private: ${s7.error.message}`);
  ids['e2e-private'] = (s7.data as { stagedId: string }).stagedId;
  await page.getByTitle('Re-read the staging queue').click();
  const cL = card(page, 'e2e-legacy');
  const c7 = card(page, 'e2e-private');
  await c7.waitFor();
  const rejectL = () => card(page, 'e2e-legacy').locator('textarea[id="reject-reason-e2e-legacy"]');
  const note7 = () => card(page, 'e2e-private').locator('textarea[id="resolve-note-e2e-private"]');
  const legacyState = () => psql(`select review_status||'|'||coalesce(review_outcome,'-') from public.staged_guidelines where candidate_id='e2e-legacy'`);
  // A stored draft (panel cancelled) AND an open panel with text in it.
  await btn(cL, 'Reject…').click();
  await rejectL().fill(`${PRIVATE} reject reason by editor A`);
  await btn(cL, 'Cancel').click();
  await btn(c7, 'Acknowledge…').click();
  await note7().fill(`${PRIVATE} decision note by editor A`);
  check("sanity: editor A's drafts are on screen before sign-out", (await pageText(page)).includes(`${PRIVATE} decision note by editor A`));
  await signOutHere(page);
  await page.waitForFunction(() => document.querySelector('[data-testid=queue-state]')?.getAttribute('data-reason') === 'signed-out');
  check('after sign-out: no draft text anywhere in the page', !(await pageText(page)).includes(PRIVATE));
  await signInHere(page, EDITOR_B);
  await card(page, 'e2e-private').waitFor();
  check('editor B signed in on the same tab: no inherited text anywhere', !(await pageText(page)).includes(PRIVATE));
  await btn(card(page, 'e2e-legacy'), 'Reject…').click();
  eq("editor B: A's reject reason is not prefilled", await rejectL().inputValue(), '');
  await btn(card(page, 'e2e-private'), 'Acknowledge…').click();
  eq("editor B: A's decision note is not prefilled", await note7().inputValue(), '');
  eq('…and nothing was written for either row', [await legacyState(), await rowState(ids['e2e-private'])], ['pending|-', 'pending|-']);

  // Card note and Edit modal, then an account change made in ANOTHER tab.
  await page.getByRole('button', { name: /All guidelines/ }).click();
  const g0 = GUIDELINES_DATA.find((g) => g.id === 'ankle-fracture') ?? GUIDELINES_DATA[0];
  await page.locator('div[role=button][aria-expanded]', { hasText: g0.topic }).first().click();
  const noteInput = page.getByPlaceholder('Add a note…');
  eq('one card note input is shown (one card expanded)', await noteInput.count(), 1);
  await noteInput.fill(`${PRIVATE} card note by editor B`);
  await page.getByTitle('Edit this guideline').first().click();
  await page.locator('#change-note').fill(`${PRIVATE} change note by editor B`);
  check("sanity: B's card note and Edit-modal change note are on screen", (await pageText(page)).includes(`${PRIVATE} change note by editor B`) && (await noteInput.inputValue()).includes(PRIVATE));
  const page2 = await context.newPage();
  page2.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await page2.goto(APP);
  await page2.waitForSelector('button[title^="Sign out"]', { timeout: 15000 });
  await signOutHere(page2);
  await signInHere(page2, EDITOR);
  await page.waitForSelector('#change-note', { state: 'detached', timeout: 15000 });
  check("tab 1: the Edit modal holding B's change note was closed", (await page.locator('#change-note').count()) === 0);
  await page.waitForSelector('button[title^="Sign out"]', { timeout: 15000 });
  check('tab 1 followed the other tab and is signed in as A', (await page.locator(`[title^="Signed in as ${EDITOR.email}"]`).count()) === 1);
  eq('tab 1: the card note input is back for A, and empty', [await noteInput.count(), await noteInput.inputValue()], [1, '']);
  check("tab 1: none of B's text anywhere in the page", !(await pageText(page)).includes(PRIVATE));
  await page2.close();
  eq('P2b wrote nothing to the catalogue or changelog', fingerprint(), fp);
  eq('no App alert was raised in P2b', dialogs, []);

  // ══ Phase 2c: an editorial hold on a row filed before the upgrade ════════
  console.log('\n[P2c] Editorial hold surfaced on a legacy row');
  const falcon = 'https://www.bofas.org.uk/Portals/0/Research/FALCON-Report-Phase%201%20and%202%20final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d';
  // The old script's shape: producer NULL, URL stored lowercased.
  psql(`insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason)
        values ('e2e-held', 'BOFAS', 'E2E held legacy row', '[]', ${`$q$${falcon.toLowerCase()}$q$`}, 'NEW_GUIDELINE');`);
  await openQueue(page);
  const cH = card(page, 'e2e-held');
  await cH.waitFor();
  check('the held row is marked "On hold"', await cH.locator('[data-testid=held]').isVisible());
  check('…with the hold\'s reason', /UK-FALCON/.test(await cH.locator('[data-testid=hold-reason]').innerText()));
  eq('…and NO Review & publish (a NEW_GUIDELINE row that would otherwise offer it)', await btn(cH, 'Review & publish…').count(), 0);
  eq('…but it can still be rejected', await btn(cH, 'Reject…').count(), 1);
  eq('an unheld legacy NEW_GUIDELINE row still offers Review & publish (control)', await btn(card(page, 'e2e-legacy'), 'Review & publish…').count(), 1);

  // ══ Phase 3: OLD schema (no 20261024) ═══════════════════════════════════
  console.log('\n[P3] Old schema: review-queue upgrade NOT applied');
  prepareSchema({ with24: false, with25: false });
  await seed();
  psql(`insert into public.staged_guidelines (candidate_id, provider, topic, primary_url, change_reason) values ('e2e-old', 'BOFAS', 'E2E old-schema row', 'https://www.example.org/old.pdf', 'NEW_GUIDELINE');`);
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page);
  await openQueue(page);
  const st = page.locator('[data-testid=queue-state]');
  eq('old schema: the queue reports "unavailable"', await st.getAttribute('data-reason'), 'unavailable');
  check('…with a "Feature unavailable" message', /Feature unavailable/.test(await st.innerText()));
  eq('…and NOT an empty queue', await page.locator('[data-testid=queue-empty]').count(), 0);
  // An unrelated failure is NOT disguised as a compatibility gap
  await page.route('**/rest/v1/staged_guidelines?**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'synthetic internal error', details: null, hint: null }) }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=queue-state]')?.getAttribute('data-reason') === 'error');
  check('an unrelated failure is shown as an error, not as "unavailable"', /synthetic internal error/.test(await st.innerText()));
  await page.unroute('**/rest/v1/staged_guidelines?**');
} catch (err) {
  countFail();
  console.log(`  FAIL  unexpected: ${err instanceof Error ? err.stack : String(err)}`);
  try { await page.screenshot({ path: path.join(WORK, 'e2e-failure.png'), fullPage: true }); } catch { /* ignore */ }
} finally {
  // Safety assertions over the whole run
  const prod = externalAttempts.filter((u) => /supabase\.co/.test(u));
  eq('NO request to any *.supabase.co host was attempted', prod, []);
  check(`the app talked to the local stack (${SB_URL})`, localApiCalls > 0, String(localApiCalls));
  console.log(`  info  non-loopback requests blocked: ${externalAttempts.length} (${[...new Set(externalAttempts.map((u) => new URL(u).hostname))].join(', ') || 'none'})`);
  await browser.close();
  stopApp();
  const { pass, fail } = counts();
  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
  process.exitCode = fail > 0 ? 1 : 0;
}
