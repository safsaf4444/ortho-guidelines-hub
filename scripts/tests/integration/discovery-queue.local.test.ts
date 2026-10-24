/**
 * scripts/tests/integration/discovery-queue.local.test.ts
 * ────────────────────────────────────────────────────────
 * Integration tests for supabase/migrations/20261024_discovery_review_queue.sql
 * against a DISPOSABLE LOCAL Supabase. Not part of `npm run test:offline`.
 *
 * SAFETY
 *   * Refuses to run unless LOCAL_SUPABASE_URL is a loopback address.
 *   * Reads every key from the environment; nothing is stored in the repo.
 *     The values are the local stack's own demo keys (`supabase status`).
 *   * Seeds the LOCAL database from src/data/guidelines-data.ts. It never
 *     touches production and never runs scripts/seed.ts.
 *   * Replaces public.is_editor() IN THE LOCAL DATABASE ONLY, with the same
 *     form and a test account's id, because the production allowlist names
 *     real accounts that do not exist locally.
 *
 * Prerequisites (outside the repo):
 *   1. A local stack: `npx supabase@2.119.0 start` in a scratch directory.
 *   2. Schema applied in supabase/REBUILD-ORDER.md order, then
 *      20261012_approve_guard_null_safe.sql, 20261012_reject_staged_candidate.sql
 *      and 20261024_discovery_review_queue.sql.
 *   3. Env: LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY,
 *      LOCAL_SUPABASE_SERVICE_KEY, LOCAL_DB_CONTAINER.
 *
 * Run:  npx tsx scripts/tests/integration/discovery-queue.local.test.ts
 *
 * Section [8] runs the ACTUAL scripts/stage-candidates.ts as a child process,
 * from an empty scratch directory (so no repo .env file can be loaded), with
 * SUPABASE_URL set to the same loopback URL and the local service key.
 */
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { CANDIDATE_SCHEMA_VERSION, documentIdentityKey, makeCandidateId, normaliseCandidateUrl } from '../../lib/ingestion';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Environment and safety ────────────────────────────────────────────────

const URL_ = process.env.LOCAL_SUPABASE_URL ?? '';
const ANON = process.env.LOCAL_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.LOCAL_SUPABASE_SERVICE_KEY ?? '';
const CONTAINER = process.env.LOCAL_DB_CONTAINER ?? '';

{
  let host = '';
  try { host = new URL(URL_).hostname; } catch { /* handled below */ }
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !ANON || !SERVICE || !CONTAINER) {
    console.error('Refusing to run: LOCAL_SUPABASE_URL must be a loopback address and all four LOCAL_* variables must be set.');
    process.exit(2);
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL_, SERVICE, opts);
const anon = createClient(URL_, ANON, opts);

function psql(sql: string): { out: string; err: string; status: number | null } {
  const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-At', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf-8' });
  return { out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), status: r.status };
}
const dq = (s: string) => `$q$${s}$q$`;

async function userClient(email: string): Promise<{ client: SupabaseClient; id: string }> {
  const password = 'local-test-only-Password1!';
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  let id = created.data.user?.id;
  if (!id) {
    const list = await service.auth.admin.listUsers();
    id = list.data.users.find((u) => u.email === email)?.id;
  }
  const client = createClient(URL_, ANON, opts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error || !id) throw new Error(`could not sign in ${email}: ${error?.message}`);
  return { client, id };
}

/** A discovery candidate payload, keyed exactly as the TS authority keys it. */
function cand(over: Record<string, unknown> & { discoveredUrl: string }) {
  return {
    discoveryId: `test-${Math.random().toString(36).slice(2, 10)}`,
    classification: 'NEW_GUIDELINE',
    provider: 'BOFAS',
    providerName: 'British Orthopaedic Foot & Ankle Society (BOFAS)',
    topic: 'Test document',
    surfaceUrl: 'https://www.bofas.org.uk/clinician/research/bofas-publications',
    statedLabels: [{ origin: 'page-body', value: '(2025)', readFrom: 'https://www.bofas.org.uk/clinician/research/bofas-publications' }],
    urlAlternatives: [],
    observedAt: '2026-10-24T00:00:00.000Z',
    reportSchemaVersion: 1,
    sourceUrlKey: documentIdentityKey(over.discoveredUrl),
    ...over,
  };
}
const stage = (run: string, c: object, client: SupabaseClient = service) =>
  client.rpc('stage_discovery_candidate', { p_run_id: run, p_producer: 'discover', p_candidate: c });

function catalogueFingerprint(): string {
  return psql(`select count(*)||':'||md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g;
               select count(*)||':'||md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c;`).out;
}

try {
  // ── Setup ───────────────────────────────────────────────────────────────
  console.log('\n[0] Setup (local only)');
  const existing = psql('select count(*) from public.guidelines').out;
  if (existing === '0') {
    const rows = GUIDELINES_DATA.map(toDbRow);
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await service.from('guidelines').insert(rows.slice(i, i + 50));
      if (error) throw new Error(`local catalogue seed failed: ${error.message}`);
    }
  }
  eq('local catalogue seeded from the static file', psql('select count(*) from public.guidelines').out, String(GUIDELINES_DATA.length));

  const editor = await userClient('editor@local.test');
  const nonEditor = await userClient('reader@local.test');
  const def = psql(`select pg_get_functiondef('public.is_editor()'::regprocedure)`).out;
  const localDef = def.replace(/array\[[\s\S]*?\]/, `array['${editor.id}'::uuid]`);
  const r0 = psql(localDef + ';');
  check('is_editor() redefined locally with a test editor (same form)', r0.status === 0 && /auth\.uid\(\) = any/.test(localDef), r0.err);

  // ── 1. Document identity: TS authority vs SQL mirror ────────────────────
  console.log('\n[1] Document keys: TS vs SQL, identity (conservative) and match (loose)');
  const urls = new Set<string>();
  for (const g of GUIDELINES_DATA) for (const v of g.versions ?? []) if (v.url) urls.add(v.url);
  // SQL keys are fetched as JSON so inputs and outputs with tabs, newlines or
  // non-ASCII survive psql's text output intact.
  const sqlKeysOf = (inputs: string[], fn: 'document_identity_key' | 'document_match_key'): string[] => {
    const lit = dq(JSON.stringify(inputs));
    const out = psql(`select coalesce(jsonb_agg(public.${fn}(u) order by n), '[]') from jsonb_array_elements_text(${lit}::jsonb) with ordinality t(u, n);`);
    if (out.status !== 0) throw new Error(`${fn} query failed: ${out.err}`);
    return JSON.parse(out.out) as string[];
  };
  const vectors = (JSON.parse(fs.readFileSync(new URL('../fixtures/url-key-vectors.json', import.meta.url), 'utf-8')) as
    { vectors: Array<{ why: string; input: string; match: string; identity: string }> }).vectors;
  const vecId = sqlKeysOf(vectors.map((v) => v.input), 'document_identity_key');
  const vecMatch = sqlKeysOf(vectors.map((v) => v.input), 'document_match_key');
  vectors.forEach((v, i) => eq(`SQL identity key: ${v.why}`, vecId[i], v.identity));
  vectors.forEach((v, i) => eq(`SQL match key: ${v.why}`, vecMatch[i], v.match));
  vectors.forEach((v, i) => check(`TS agrees with SQL on both keys: ${v.why}`,
    documentIdentityKey(v.input) === vecId[i] && normaliseCandidateUrl(v.input) === vecMatch[i]));
  const list = [...urls];
  const catId = sqlKeysOf(list, 'document_identity_key');
  const catMatch = sqlKeysOf(list, 'document_match_key');
  eq(`TS and SQL agree on the identity key of all ${list.length} catalogue URLs`, list.filter((u, i) => documentIdentityKey(u) !== catId[i]), []);
  eq(`TS and SQL agree on the match key of all ${list.length} catalogue URLs`, list.filter((u, i) => normaliseCandidateUrl(u) !== catMatch[i]), []);
  const caseCollisions = new Map<string, Set<string>>();
  list.forEach((_, i) => caseCollisions.set(catMatch[i], (caseCollisions.get(catMatch[i]) ?? new Set()).add(catId[i])));
  console.log(`  info  catalogue: ${[...caseCollisions.values()].filter((v) => v.size > 1).length} match key(s) shared by more than one identity`);
  // Previously the one known divergence (TS re-encoded the remaining query
  // after stripping ver). It must now STAGE, keyed identically, URL verbatim.
  const formerlyDivergent = 'https://Example.org/A?q=a%20b&Ver=9&q=c,d';
  const rDiv = await stage('run-div', cand({ discoveredUrl: formerlyDivergent }));
  eq('formerly divergent URL (ver + encoded + repeated params) now stages', (rDiv.data as { status?: string })?.status ?? rDiv.error?.message, 'staged');
  const divId = (rDiv.data as { stagedId: string }).stagedId;
  eq('…keyed as both implementations agree (path case kept, host lowercased)', psql(`select identity_key||' | '||match_key from public.staged_guidelines where id='${divId}'`).out, 'https://example.org/A?q=a%20b&q=c,d | https://example.org/a?q=a%20b&q=c,d');
  eq('…with the original URL stored verbatim', psql(`select primary_url from public.staged_guidelines where id='${divId}'`).out, formerlyDivergent);
  const forged = await stage('run-div', cand({ discoveredUrl: 'https://example.org/z?ver=1&b=1', sourceUrlKey: 'https://example.org/z?b=1&x' }));
  eq('a producer key that genuinely disagrees is still refused (defence in depth)', forged.error?.code, '22023');
  const lowerKeyed = await stage('run-div', { ...cand({ discoveredUrl: 'https://example.org/Mixed/Case.pdf' }), sourceUrlKey: 'https://example.org/mixed/case.pdf' });
  eq('a producer sending the LOOSE key as identity is refused, not silently accepted', lowerKeyed.error?.code, '22023');

  // Distinct documents differing only in path / query-value case: neither is
  // merged into the other nor blocked as its duplicate.
  const csA = await stage('run-case', cand({ discoveredUrl: 'https://example.org/Docs/Guide.pdf' }));
  const csB = await stage('run-case', cand({ discoveredUrl: 'https://example.org/docs/guide.pdf' }));
  const qvA = await stage('run-case', cand({ discoveredUrl: 'https://example.org/view?doc=AbC' }));
  const qvB = await stage('run-case', cand({ discoveredUrl: 'https://example.org/view?doc=abc' }));
  eq('path-case variants: both staged as separate rows', [(csA.data as { status: string })?.status, (csB.data as { status: string })?.status], ['staged', 'staged']);
  eq('query-value-case variants: both staged as separate rows', [(qvA.data as { status: string })?.status, (qvB.data as { status: string })?.status], ['staged', 'staged']);
  check('…four distinct queue rows', new Set([csA, csB, qvA, qvB].map((r) => (r.data as { stagedId: string }).stagedId)).size === 4);
  const hostVariant = await stage('run-case', cand({ discoveredUrl: 'HTTPS://EXAMPLE.ORG/Docs/Guide.pdf/?ver=1' }));
  eq('host case + trailing path slash + ver token: the SAME document (documented merges) → already open', (hostVariant.data as { status: string; stagedId: string }), { ...(hostVariant.data as object), status: 'already_open', stagedId: (csA.data as { stagedId: string }).stagedId });
  const fragVariant = await stage('run-case', cand({ discoveredUrl: 'https://example.org/Docs/Guide.pdf#page=2' }));
  eq('a fragment variant is kept distinct (splits, never merges)', (fragVariant.data as { status: string }).status, 'staged');

  // ── 2. Permissions ──────────────────────────────────────────────────────
  console.log('\n[2] Permissions');
  const seedRun = await stage('run-perm', cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Perm-Test.pdf' }));
  const permStaged = (seedRun.data as { stagedId: string }).stagedId;
  eq('service role can stage', (seedRun.data as { status: string })?.status, 'staged');

  for (const [who, client] of [['anon', anon], ['authenticated non-editor', nonEditor.client], ['editor', editor.client]] as const) {
    const s = await stage('run-x', cand({ discoveredUrl: 'https://example.org/should-not-stage.pdf' }), client);
    eq(`${who}: cannot execute stage_discovery_candidate`, s.error?.code, '42501');
  }
  const anonResolve = await anon.rpc('resolve_discovery_candidate', { p_staged_id: permStaged, p_action: 'defer', p_note: 'x' });
  eq('anon: cannot execute resolve_discovery_candidate', anonResolve.error?.code, '42501');
  const readerResolve = await nonEditor.client.rpc('resolve_discovery_candidate', { p_staged_id: permStaged, p_action: 'defer', p_note: 'x' });
  eq('non-editor: resolve refused by the editor check', readerResolve.error?.code, '42501');
  const svcResolve = await service.rpc('resolve_discovery_candidate', { p_staged_id: permStaged, p_action: 'defer', p_note: 'x' });
  eq('service role (auth.uid() NULL): resolve refused — null-safe editor check', svcResolve.error?.code, '42501');
  const svcApprove = await service.rpc('approve_staged_guideline', { p_candidate_id: permStaged, p_final_guideline_data: { id: 'x' }, p_changelog_note: 'x' });
  eq('service role (auth.uid() NULL): approve refused — null-safe editor check', svcApprove.error?.code, '42501');

  for (const table of ['staged_discovery_evidence', 'staged_discovery_decisions', 'discovery_staging_holds']) {
    const a = await anon.from(table).select('*');
    check(`anon: cannot read ${table}`, (a.data?.length ?? 0) === 0, JSON.stringify(a.error ?? a.data?.length));
    const n = await nonEditor.client.from(table).select('*');
    check(`non-editor: cannot read ${table}`, (n.data?.length ?? 0) === 0, JSON.stringify(n.error ?? n.data?.length));
  }
  const edEv = await editor.client.from('staged_discovery_evidence').select('id');
  check('editor: can read evidence', (edEv.data?.length ?? 0) > 0, JSON.stringify(edEv.error));
  const edHold = await editor.client.from('discovery_staging_holds').select('match_key');
  eq('editor: can read the hold list', edHold.data?.length, 1);

  const evRow = psql(`select id from public.staged_discovery_evidence where staged_id = '${permStaged}' limit 1`).out;
  for (const [who, client] of [['anon', anon], ['non-editor', nonEditor.client], ['editor', editor.client]] as const) {
    const ins = await client.from('staged_discovery_evidence').insert({ staged_id: permStaged, discovery_run_id: 'evil', producer: 'discover', discovery_id: 'x', report_schema_version: 1, discovered_url: 'x', surface_url: 'x', observed_at: new Date().toISOString() });
    check(`${who}: cannot insert evidence`, !!ins.error, 'insert succeeded');
    const up = await client.from('staged_discovery_evidence').update({ discovered_url: 'tampered' }).eq('id', evRow).select();
    check(`${who}: cannot update evidence`, !!up.error || (up.data?.length ?? 0) === 0, JSON.stringify(up.data));
    const del = await client.from('staged_discovery_evidence').delete().eq('id', evRow).select();
    check(`${who}: cannot delete evidence`, !!del.error || (del.data?.length ?? 0) === 0, JSON.stringify(del.data));
    const dIns = await client.from('staged_discovery_decisions').insert({ staged_id: permStaged, action: 'defer', from_status: 'pending', to_status: 'deferred', note: 'x', decided_by: editor.id });
    check(`${who}: cannot insert a decision directly`, !!dIns.error, 'insert succeeded');
    const hIns = await client.from('discovery_staging_holds').delete().neq('match_key', '').select();
    check(`${who}: cannot remove a staging hold`, !!hIns.error || (hIns.data?.length ?? 0) === 0, JSON.stringify(hIns.data));
  }
  const svcUp = await service.from('staged_discovery_evidence').update({ discovered_url: 'tampered' }).eq('id', evRow);
  eq('service role (bypasses RLS): UPDATE of evidence refused by the append-only trigger', svcUp.error?.code, '42501');
  const svcDel = await service.from('staged_discovery_evidence').delete().eq('id', evRow);
  eq('service role: DELETE of evidence refused by the trigger', svcDel.error?.code, '42501');
  const trunc = psql('truncate public.staged_discovery_evidence;');
  check('owner session: a plain TRUNCATE of evidence is refused by the trigger', trunc.status !== 0 && /append-only/.test(trunc.err), trunc.err);
  const truncD = psql('truncate public.staged_discovery_decisions;');
  check('owner session: a plain TRUNCATE of the decision log is refused', truncD.status !== 0 && /append-only/.test(truncD.err), truncD.err);
  // The accurate threat model: the triggers stop ordinary DML from every role,
  // NOT whoever controls the schema. The owner can disable them and rewrite a
  // row. Demonstrated inside a transaction that is rolled back.
  const ownerBypass = psql(`begin;
    alter table public.staged_discovery_evidence disable trigger staged_discovery_evidence_no_update_delete;
    update public.staged_discovery_evidence set discovered_url = 'tampered-by-owner' where id = '${evRow}';
    select discovered_url from public.staged_discovery_evidence where id = '${evRow}';
    rollback;`);
  eq('threat model: the table owner CAN disable the trigger and alter evidence (shown, then rolled back)', ownerBypass.out, 'tampered-by-owner');
  eq('evidence row intact after every attempt (and after the rollback)', psql(`select discovered_url from public.staged_discovery_evidence where id='${evRow}'`).out, 'https://www.bofas.org.uk/Portals/0/Research/Perm-Test.pdf');
  eq('…and the trigger is enabled again', psql(`select tgenabled from pg_trigger where tgname='staged_discovery_evidence_no_update_delete'`).out, 'O');

  // ── 3. Evidence idempotency ─────────────────────────────────────────────
  console.log('\n[3] Evidence idempotency');
  const idem = cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Idem.pdf?ver=AAA' });
  const i1 = await stage('run-A', idem);
  const i2 = await stage('run-A', idem);
  const i3 = await stage('run-B', idem);
  eq('first sighting: staged', (i1.data as { status: string }).status, 'staged');
  eq('same run again: existing, evidence already recorded', [(i2.data as { status: string }).status, (i2.data as { evidence: string }).evidence], ['existing', 'already_recorded']);
  eq('a new run: existing, evidence appended', [(i3.data as { status: string }).status, (i3.data as { evidence: string }).evidence], ['existing', 'appended']);
  const idemId = (i1.data as { stagedId: string }).stagedId;
  eq('exactly one queue row', psql(`select count(*) from public.staged_guidelines where candidate_id='${idem.discoveryId}'`).out, '1');
  eq('exactly two evidence rows (one per run)', psql(`select count(*) from public.staged_discovery_evidence where staged_id='${idemId}'`).out, '2');
  eq('the original URL is stored verbatim', psql(`select primary_url from public.staged_guidelines where id='${idemId}'`).out, idem.discoveredUrl);
  eq('identity is the derived key (case preserved)', psql(`select identity_key from public.staged_guidelines where id='${idemId}'`).out, 'https://www.bofas.org.uk/Portals/0/Research/Idem.pdf');
  eq('stated labels are kept as structured JSON', psql(`select stated_labels->0->>'value' from public.staged_discovery_evidence where staged_id='${idemId}' limit 1`).out, '(2025)');
  const tamper = psql(`update public.staged_guidelines set identity_key='https://forged', match_key='https://forged' where id='${idemId}'; select identity_key||' | '||match_key from public.staged_guidelines where id='${idemId}';`);
  eq('forged keys are overwritten by derivation', tamper.out, 'https://www.bofas.org.uk/Portals/0/Research/Idem.pdf | https://www.bofas.org.uk/portals/0/research/idem.pdf');
  const wrongKey = await stage('run-C', { ...cand({ discoveredUrl: 'https://example.org/k.pdf' }), sourceUrlKey: 'https://example.org/other.pdf' });
  eq('a producer key that disagrees with the database is refused', wrongKey.error?.code, '22023');

  // ── 4. Concurrent duplicate staging ─────────────────────────────────────
  console.log('\n[4] Concurrent duplicate staging');
  const race = cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Race.pdf' });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => stage(`race-run-${i}`, race)));
  const statuses = results.map((r) => (r.data as { status?: string })?.status ?? r.error?.code);
  eq('20 concurrent stagings of one document: exactly one "staged"', statuses.filter((s) => s === 'staged').length, 1);
  check('…the rest were "existing" with evidence appended, none errored', results.every((r) => ['staged', 'existing'].includes((r.data as { status?: string })?.status ?? '') && (r.data as { evidence?: string })?.evidence === 'appended'), statuses.join(','));
  eq('…one queue row', psql(`select count(*) from public.staged_guidelines where identity_key='https://www.bofas.org.uk/Portals/0/Research/Race.pdf'`).out, '1');
  eq('…20 evidence rows, one per run', psql(`select count(*) from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.candidate_id='${race.discoveryId}'`).out, '20');

  // Cross-producer, deterministic: a sync-providers-style insert holds the
  // document's slot in an OPEN transaction; discovery staging must wait, then
  // report the slot occupied — never create a second row.
  const crossUrl = 'https://www.bofas.org.uk/Portals/0/Research/Cross.pdf';
  const holder = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q']);
  holder.stdin.write(`begin; insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason, producer) values ('sync-cross-1','sync-providers','BOFAS','Cross','[]',${dq(crossUrl + '?ver=Z')},'NEW_GUIDELINE','sync-providers'); select pg_sleep(3); commit;\n`);
  holder.stdin.end();
  const holderDone = new Promise<number>((res) => holder.on('close', (c) => res(c ?? -1)));
  await new Promise((r) => setTimeout(r, 800));
  const t0 = Date.now();
  const cross = await stage('cross-run', cand({ discoveredUrl: crossUrl }));
  const waited = Date.now() - t0;
  eq('the concurrent holder committed', await holderDone, 0);
  check('discovery staging WAITED for the other producer\'s open transaction', waited > 1500, `${waited}ms`);
  eq('…then reported the slot occupied by the other producer', (cross.data as { status?: string; heldByProducer?: string }), { ...(cross.data as object), status: 'already_open', evidence: 'appended', heldByProducer: 'sync-providers' });
  eq('…and only one open row exists for that document', psql(`select count(*) from public.staged_guidelines where identity_key='https://www.bofas.org.uk/Portals/0/Research/Cross.pdf' and review_status in ('pending','deferred')`).out, '1');
  const crossHolder = psql(`select id from public.staged_guidelines where candidate_id='sync-cross-1'`).out;
  eq('…and its sighting is attached to the HOLDER row, naming the discovery candidate', psql(`select staged_id||'|'||producer||'|'||discovered_url from public.staged_discovery_evidence where discovery_run_id='cross-run'`).out, `${crossHolder}|discover|${crossUrl}`);
  // And the reverse: a legacy-style insert colliding with a discovery-held slot fails loudly.
  const reverse = psql(`insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason, producer) values ('sync-race-1','sync-providers','BOFAS','Race','[]',${dq('https://WWW.BOFAS.org.uk/Portals/0/Research/Race.pdf/?ver=x')},'NEW_GUIDELINE','sync-providers');`);
  check('a second producer inserting a discovery-held document (same identity) gets 23505', reverse.status !== 0 && /one_open_per_document/.test(reverse.err), reverse.err);
  const caseDistinct = psql(`insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason, producer) values ('sync-race-2','sync-providers','BOFAS','RACE','[]',${dq('https://www.bofas.org.uk/Portals/0/Research/RACE.pdf')},'NEW_GUIDELINE','sync-providers');`);
  check('…but a path-case-distinct document is NOT blocked by the slot', caseDistinct.status === 0, caseDistinct.err);

  // ── 5. Edition approval refusal; classification is not permission ───────
  console.log('\n[5] Edition approval refusal');
  const before5 = catalogueFingerprint();
  const pne = await stage('run-ed', cand({
    classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'end-stage-ankle-arthritis',
    discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQNo1o8FEhD87h8-uYmQA%3d%3d',
    softMatch: { guidelineId: 'end-stage-ankle-arthritis', jaccard: 0.8, containment: 1 },
  }));
  const pneId = (pne.data as { stagedId: string }).stagedId;
  const etc = await stage('run-ed', cand({
    classification: 'EDITION_TOKEN_CHANGED', matchedGuidelineId: 'mobilisation-weightbearing',
    discoveredUrl: 'https://www.boa.ac.uk/asset/C735F86B-6172-43EF-AA90005C8E3F0706/?ver=NEW',
    tokenChange: { parameter: 'ver', previousValue: 'OLD', observedValue: 'NEW' },
  }));
  const etcId = (etc.data as { stagedId: string }).stagedId;
  eq('edition rows staged', [(pne.data as { status: string }).status, (etc.data as { status: string }).status], ['staged', 'staged']);
  eq('edition rows carry their target URL verbatim', psql(`select changed_url from public.staged_guidelines where id='${pneId}'`).out, 'https://www.bofas.org.uk/Portals/0/Position%20Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQNo1o8FEhD87h8-uYmQA%3d%3d');
  for (const [label, id] of [['POSSIBLE_NEW_EDITION', pneId], ['EDITION_TOKEN_CHANGED', etcId]] as const) {
    const a = await editor.client.rpc('approve_staged_guideline', { p_candidate_id: id, p_final_guideline_data: { id: `dup-${label}`, section: 'Foot & Ankle', type: 'x', topic: 'x', status: 'Live' }, p_changelog_note: 'try' });
    eq(`editor approving a ${label} row as a new entry: refused 42809`, a.error?.code, '42809');
  }
  const newWithMatch = await stage('run-ed', cand({ discoveredUrl: 'https://example.org/x.pdf', matchedGuidelineId: 'ankle-fracture' }));
  eq('staging a NEW_GUIDELINE that names an existing entry is refused', newWithMatch.error?.code, '22023');
  // Mislabelled rows from a non-discovery writer: the approval guard must still hold.
  const vteUrl = GUIDELINES_DATA.find((g) => g.id === 'bofas-vte-position-statement')?.versions?.[0]?.url ?? '';
  const vteHostUpper = vteUrl.replace(/^https:\/\/[^/]+/, (h) => h.toUpperCase());
  psql(`insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason) values ('mislabel-held','sync-providers','BOFAS','VTE','[]',${dq(vteHostUpper + '?ver=zzz')},'NEW_GUIDELINE');
        insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason) values ('mislabel-near','sync-providers','BOFAS','VTE upper','[]',${dq(vteUrl.toUpperCase())},'NEW_GUIDELINE');
        insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason, matched_guideline_id) values ('mislabel-linked','sync-providers','BOFAS','Linked','[]','https://example.org/linked.pdf','NEW_GUIDELINE','ankle-fracture');`);
  const approveCid = async (cid: string) => {
    const id = psql(`select id from public.staged_guidelines where candidate_id='${cid}'`).out;
    return editor.client.rpc('approve_staged_guideline', { p_candidate_id: id, p_final_guideline_data: { id: `dup-${cid}`, section: 'Foot & Ankle', type: 'x', topic: 'x', status: 'Live' }, p_changelog_note: 'try' });
  };
  const aHeld = await approveCid('mislabel-held');
  check('exact identity match with a catalogue link (host case, ver): refused 42809 "already held"', aHeld.error?.code === '42809' && /already held by entry bofas-vte-position-statement/.test(aHeld.error?.message ?? ''), JSON.stringify(aHeld.error));
  const aNear = await approveCid('mislabel-near');
  check('loose-only near match (path case differs): refused LOUDLY 42809, naming the entry', aNear.error?.code === '42809' && /nearly matches existing entry bofas-vte-position-statement/.test(aNear.error?.message ?? ''), JSON.stringify(aNear.error));
  const aLinked = await approveCid('mislabel-linked');
  eq('NEW_GUIDELINE row linked to an existing entry: approval refused 42809', aLinked.error?.code, '42809');
  eq('no refused approval changed the catalogue or changelog', catalogueFingerprint(), before5);
  // Positive control: the guard is not a blanket refusal.
  const genuine = await stage('run-ed', cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Genuinely-New.pdf' }));
  const ok = await editor.client.rpc('approve_staged_guideline', { p_candidate_id: (genuine.data as { stagedId: string }).stagedId, p_final_guideline_data: { id: 'local-test-genuinely-new', section: 'Foot & Ankle', type: 'Specialist society guidance', topic: 'Genuinely new', source: 'BOFAS', status: 'Live' }, p_changelog_note: 'Local integration test' });
  eq('a genuinely new NEW_GUIDELINE is still approvable (positive control)', ok.data, 'local-test-genuinely-new');

  // ── 6. Resolution records decisions only ────────────────────────────────
  console.log('\n[6] Edition resolution: decisions only, no catalogue change');
  const before6 = catalogueFingerprint();
  const res = (id: string, action: string, note = 'local test') =>
    editor.client.rpc('resolve_discovery_candidate', { p_staged_id: id, p_action: action, p_note: note });
  const rowState = (id: string) => psql(`select review_status||'|'||coalesce(review_outcome,'-')||'|'||(reviewed_by is not null) from public.staged_guidelines where id='${id}'`).out;

  const logOf = (id: string) => psql(`select action||'|'||to_status||'|'||(decided_by = '${editor.id}')||'|'||(decided_at is not null) from public.staged_discovery_decisions where staged_id='${id}' order by decided_at, id`).out.split('\n');
  const flag = await res(etcId, 'needs-document-check');
  eq('needs-document-check leaves the row OPEN', (flag.data as { open: boolean }).open, true);
  eq('…status pending, outcome recorded, NOT marked reviewed', rowState(etcId), 'pending|needs-document-check|false');
  eq('…reviewed_at also unset on the queue row', psql(`select reviewed_at is null from public.staged_guidelines where id='${etcId}'`).out, 't');
  eq('…but the decision log attributes it: actor = the editor, time recorded', logOf(etcId), ['needs-document-check|pending|true|true']);
  const deferred = await res(etcId, 'defer');
  eq('defer: status deferred, still open', [(deferred.data as { reviewStatus: string }).reviewStatus, (deferred.data as { open: boolean }).open], ['deferred', true]);
  const ack = await res(etcId, 'acknowledged');
  eq('acknowledged: resolved and closed', [(ack.data as { reviewStatus: string }).reviewStatus, (ack.data as { open: boolean }).open], ['resolved', false]);
  eq('…reviewed_by now set', rowState(etcId), 'resolved|acknowledged|true');
  eq('every action on the row, open and closing, is attributed in the log', logOf(etcId), ['needs-document-check|pending|true|true', 'defer|deferred|true|true', 'acknowledged|resolved|true|true']);

  const ne = await res(pneId, 'new-edition');
  eq('new-edition leaves the row OPEN, awaiting a revision path', rowState(pneId), 'pending|new-edition-awaiting-revision|false');
  check('…and does not report review as complete', (ne.data as { open: boolean }).open === true);
  const sameDoc = await res(pneId, 'same-document');
  eq('same-document: reported closed', (sameDoc.data as { open: boolean }).open, false);
  eq('same-document: resolved', rowState(pneId), 'resolved|same-document|true');
  eq('the decision log holds every action, open ones included', psql(`select string_agg(action||':'||to_status, ',' order by decided_at) from public.staged_discovery_decisions where staged_id in ('${etcId}','${pneId}')`).out.split(',').sort(), ['acknowledged:resolved', 'defer:deferred', 'needs-document-check:pending', 'new-edition:pending', 'same-document:resolved'].sort());
  eq('no resolution changed the catalogue or changelog', catalogueFingerprint(), before6);
  eq('nothing was published (no resulting_guideline_id)', psql(`select count(*) from public.staged_guidelines where id in ('${etcId}','${pneId}') and resulting_guideline_id is not null`).out, '0');

  eq('resolving an already-resolved row: 55000', (await res(pneId, 'no-action')).error?.code, '55000');
  eq('resolving a NEW_GUIDELINE row: 42809', (await res(permStaged, 'same-document')).error?.code, '42809');
  const pne2 = await stage('run-ed2', cand({ classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'ankle-fracture', discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS-BOA%20ankle%20fractures.pdf' }));
  const pne2Id = (pne2.data as { stagedId: string }).stagedId;
  eq('an action from the other class is refused: 22023', (await res(pne2Id, 'acknowledged')).error?.code, '22023');
  eq('a blank note is refused: 23514', (await res(pne2Id, 'no-action', '   ')).error?.code, '23514');
  // "different-document" must not vanish as resolved: no re-filing path exists
  // yet, so the row stays OPEN with an explicit follow-up outcome.
  const dd = await res(pne2Id, 'different-document', 'Separate document; needs filing as its own entry');
  eq('different-document: reported OPEN, not resolved', [(dd.data as { reviewStatus: string })?.reviewStatus, (dd.data as { open: boolean })?.open], ['pending', true]);
  eq('…row pending with a follow-up outcome, completion fields unset', rowState(pne2Id), 'pending|different-document-awaiting-refiling|false');
  eq('…attributed in the decision log', logOf(pne2Id), ['different-document|pending|true|true']);
  eq('…still holds its document slot (visible in the open queue)', psql(`select count(*) from public.staged_guidelines where id='${pne2Id}' and review_status in ('pending','deferred')`).out, '1');
  const ddForge = psql(`update public.staged_guidelines set review_status='resolved', review_outcome='different-document-awaiting-refiling', reviewed_by='${editor.id}', reviewed_at=now() where id='${pne2Id}';`);
  check('…and a direct write cannot close it as resolved (CHECK)', ddForge.status !== 0 && /resolved_is_closed_outcome/.test(ddForge.err), ddForge.err);
  const ddLegacy = psql(`update public.staged_guidelines set review_status='resolved', review_outcome='different-document', reviewed_by='${editor.id}', reviewed_at=now() where id='${pne2Id}';`);
  check('…nor with the old closing outcome "different-document" (CHECK)', ddLegacy.status !== 0 && /review_outcome_check|resolved_is_closed_outcome/.test(ddLegacy.err), ddLegacy.err);
  const direct = psql(`update public.staged_guidelines set review_status='resolved' where id='${pne2Id}';`);
  check('a direct write marking resolved without an outcome or reviewer violates the CHECK', direct.status !== 0 && /resolved_is_closed_outcome/.test(direct.err), direct.err);
  const again = await stage('run-ed3', cand({ classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'end-stage-ankle-arthritis',
    discoveryId: (await service.from('staged_guidelines').select('candidate_id').eq('id', pneId).single()).data?.candidate_id,
    discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQNo1o8FEhD87h8-uYmQA%3d%3d' }));
  eq('rediscovering a resolved item appends evidence but does NOT reopen it', [(again.data as { status: string }).status, (again.data as { evidence: string }).evidence, (again.data as { reviewStatus: string }).reviewStatus], ['existing', 'appended', 'resolved']);

  // ── 7. Retirement and FALCON staging holds ──────────────────────────────
  console.log('\n[7] Retirement report-only; UK-FALCON held from staging');
  const rowsBefore = psql('select count(*) from public.staged_guidelines').out;
  for (const cls of ['WITHDRAWN', 'RETIRED', 'PUBLISHER_ASSERTED_RETIREMENT', null]) {
    const r = await stage('run-ret', cand({ discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/troponin-test/', classification: cls }));
    eq(`classification ${cls}: refused — retirement is report-only`, r.error?.code, '22023');
  }
  const falcon = 'https://www.bofas.org.uk/Portals/0/Research/FALCON-Report-Phase%201%20and%202%20final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d';
  const h1 = await stage('run-falcon', cand({ discoveredUrl: falcon }));
  eq('UK-FALCON: held, not staged', (h1.data as { status: string; holdStatus: string }), { ...(h1.data as object), status: 'held', holdStatus: 'pending-editorial-decision' });
  const h2 = await stage('run-falcon', cand({ discoveredUrl: falcon.replace(/ver=[^&]+/, 'ver=DIFFERENT') }));
  eq('UK-FALCON with a different ?ver= token: still held', (h2.data as { status: string }).status, 'held');
  const h3 = await stage('run-falcon', cand({ discoveredUrl: falcon.replace('Research/FALCON', 'research/falcon') }));
  eq('UK-FALCON with a differently-cased path: still held (holds use the loose key)', (h3.data as { status: string }).status, 'held');
  eq('no queue rows or evidence were written for retirement or FALCON', psql('select count(*) from public.staged_guidelines').out, rowsBefore);
  eq('…and no evidence row mentions FALCON', psql(`select count(*) from public.staged_discovery_evidence where discovered_url ilike '%falcon%'`).out, '0');
  const other = await stage('run-falcon', cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Some-Other-Report.pdf' }));
  eq('a different research document is NOT held by the FALCON rule', (other.data as { status: string }).status, 'staged');

  // ── 8. The ACTUAL sync staging script ───────────────────────────────────
  console.log('\n[8] scripts/stage-candidates.ts (the real script) against the local database');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const stageScript = path.join(repoRoot, 'scripts', 'stage-candidates.ts');
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  // Empty working directory: the script's dotenv finds no .env file, and the
  // child sees ONLY the variables below — no VITE_* or production values.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-candidates-local-'));
  const runStage = (file: string) => {
    const r = spawnSync(process.execPath, [tsxCli, stageScript, file], {
      cwd: scratch, encoding: 'utf-8',
      env: {
        PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '',
        TEMP: os.tmpdir(), TMP: os.tmpdir(),
        SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      },
    });
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
  const count = (out: string, label: string) => Number(out.match(new RegExp(`${label}\\s+(\\d+)`))?.[1] ?? NaN);
  const counts = (out: string) => ({
    staged: count(out, 'staged \\(new\\)'), existing: count(out, 'existing'), alreadyOpen: count(out, 'already open'),
    held: count(out, 'held'), failed: count(out, 'failed'), evidence: count(out, 'evidence rows appended:'),
  });
  const syncCand = (provider: string, url: string, topic: string) => ({
    candidateId: makeCandidateId({ pipeline: 'sync-providers', provider, changeReason: 'NEW_GUIDELINE', primaryUrl: url }),
    pipeline: 'sync-providers', provider, providerName: `${provider} (local test)`, topic,
    versions: [{ label: 'Test PDF', url }], primaryUrl: normaliseCandidateUrl(url),
    changeReason: 'NEW_GUIDELINE', reviewStatus: 'pending', discoveredAt: '2026-10-24T06:00:00.000Z',
    matchedGuidelineId: null, providerRef: null,
  });
  const writeFile = (name: string, generatedAt: string, reports: Array<{ adapter: string; provider: string; candidates: object[] }>) => {
    const f = path.join(scratch, name);
    fs.writeFileSync(f, JSON.stringify({ schemaVersion: CANDIDATE_SCHEMA_VERSION, generatedAt, reports }, null, 2));
    return f;
  };

  const newA = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/New-A.PDF?ver=T1&Edition=2', 'Sync new A');
  const newB = syncCand('BSG', 'https://www.example.org/Docs/New B.pdf', 'Sync new B');
  const sameDocOtherId = syncCand('BSG2', 'https://www.example.org/Docs/New B.pdf', 'Sync new B, other adapter');
  const rejected = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Rejected.pdf', 'Sync previously rejected');
  const openElsewhere = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Research/Race.pdf?ver=sync', 'Open under discovery');
  const heldFalcon = syncCand('BOFAS', falcon, 'UK-FALCON via sync');
  const bad = { ...syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Bad.pdf', 'Bad key'), primaryUrl: 'https://forged.example/bad' };

  // An editor already rejected one of these in an earlier week.
  const rej = psql(`insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason, review_status, review_note, reviewed_at, producer)
    values (${dq(rejected.candidateId)}, 'sync-providers', 'BOFAS', 'Sync previously rejected', '[]', ${dq(rejected.versions[0].url)}, 'NEW_GUIDELINE', 'rejected', 'Out of scope (local test)', now(), 'sync-providers');`);
  check('setup: a previously rejected sync candidate exists', rej.status === 0, rej.err);

  const file1 = writeFile('candidates-1.json', '2026-10-24T06:00:00.000Z', [
    { adapter: 'Local A', provider: 'BOFAS', candidates: [newA, rejected, openElsewhere, heldFalcon, bad] },
    { adapter: 'Local B', provider: 'BSG', candidates: [newB, sameDocOtherId, newA] },
  ]);
  const run1 = runStage(file1);
  eq('run 1: exits 1 because one candidate failed', run1.status, 1);
  check('run 1: the in-file duplicate id was collapsed before submission', /Collapsed 1 duplicate candidate id/.test(run1.out), run1.out);
  eq('run 1: honest counts — staged 2, existing 1, already open 2, held 1, failed 1', counts(run1.out),
    { staged: 2, existing: 1, alreadyOpen: 2, held: 1, failed: 1, evidence: 5 });
  check('run 1: the failure is named with its SQLSTATE', new RegExp(`${bad.candidateId}.*22023`).test(run1.out), run1.out);
  check('run 1: the already-open holder is named', /Open under discovery — open as .*\(discover, pending\)/.test(run1.out), run1.out);
  const rowOf = (cid: string) => psql(`select review_status||'|'||coalesce(review_note,'-')||'|'||coalesce(producer,'-') from public.staged_guidelines where candidate_id=${dq(cid)}`).out;
  eq('unrelated candidates were filed despite the duplicate and the failure', [rowOf(newA.candidateId), rowOf(newB.candidateId)], ['pending|-|sync-providers', 'pending|-|sync-providers']);
  eq('the original URL is stored verbatim; identity keeps its case', psql(`select primary_url||' => '||identity_key from public.staged_guidelines where candidate_id=${dq(newA.candidateId)}`).out,
    `${newA.versions[0].url} => https://www.bofas.org.uk/Portals/0/Sync/New-A.PDF?Edition=2`);
  eq('the rejected decision is untouched (status, note)', rowOf(rejected.candidateId), 'rejected|Out of scope (local test)|sync-providers');
  const evOf = (cid: string) => psql(`select count(*) from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.candidate_id=${dq(cid)} and e.producer='sync-providers'`).out;
  eq('…and its rediscovery was appended as evidence', evOf(rejected.candidateId), '1');
  eq('nothing was filed for the failed, held or same-document candidates', psql(`select count(*) from public.staged_guidelines where candidate_id in (${[bad, heldFalcon, sameDocOtherId, openElsewhere].map((c) => dq(c.candidateId)).join(',')})`).out, '0');
  eq('the discovery row still alone holds its document', psql(`select count(*)||':'||max(producer) from public.staged_guidelines where identity_key='https://www.bofas.org.uk/Portals/0/Research/Race.pdf' and review_status in ('pending','deferred')`).out, '1:discover');
  const evOn = (cid: string, discoveryId: string) => psql(`select count(*) from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.candidate_id=${dq(cid)} and e.discovery_id=${dq(discoveryId)} and e.producer='sync-providers'`).out;
  eq('already-open sighting (Race) is attached to the discovery row that holds the document', evOn(race.discoveryId, openElsewhere.candidateId), '1');
  eq('already-open sighting (same document, other adapter) is attached to the row filed this run', evOn(newB.candidateId, sameDocOtherId.candidateId), '1');
  eq('…and to no other row', psql(`select count(*) from public.staged_discovery_evidence where discovery_id in (${dq(openElsewhere.candidateId)},${dq(sameDocOtherId.candidateId)})`).out, '2');

  const run2 = runStage(file1);
  eq('run 2 (same file, a retried job): same exit, nothing new, no duplicate evidence', [run2.status, counts(run2.out)],
    [1, { staged: 0, existing: 3, alreadyOpen: 2, held: 1, failed: 1, evidence: 0 }]);
  eq('…evidence for already-open sightings is not duplicated either', psql(`select count(*) from public.staged_discovery_evidence where discovery_id in (${dq(openElsewhere.candidateId)},${dq(sameDocOtherId.candidateId)})`).out, '2');

  const file3 = writeFile('candidates-3.json', '2026-10-31T06:00:00.000Z', [
    { adapter: 'Local A', provider: 'BOFAS', candidates: [newA, rejected, openElsewhere, heldFalcon] },
    { adapter: 'Local B', provider: 'BSG', candidates: [newB, sameDocOtherId] },
  ]);
  const run3 = runStage(file3);
  eq('run 3 (next week, no bad candidate): exits 0', run3.status, 0);
  eq('run 3: counts — existing 3 with fresh evidence, nothing failed', counts(run3.out), { staged: 0, existing: 3, alreadyOpen: 2, held: 1, failed: 0, evidence: 5 });
  eq('after three runs the rejected row is still rejected, with two sightings logged', [rowOf(rejected.candidateId), evOf(rejected.candidateId)], ['rejected|Out of scope (local test)|sync-providers', '2']);

  const directRpc = await service.rpc('stage_sync_candidates', { p_run_id: 'direct', p_candidates: [{ ...newA, sourceUrlKey: documentIdentityKey(newA.versions[0].url) }, 'not-an-object', { ...newB, pipeline: 'discovery' }, { ...newB, changeReason: 'REVISED' }, { ...newB }] });
  eq('RPC: one outcome per input, in order; malformed inputs fail alone', (directRpc.data as Array<{ status: string; code?: string }>)?.map((o) => `${o.status}${o.code ? `:${o.code}` : ''}`),
    ['existing', 'failed:22023', 'failed:22023', 'failed:22023', 'failed:22023']);
  for (const [who, client] of [['anon', anon], ['non-editor', nonEditor.client], ['editor', editor.client]] as const) {
    const r = await client.rpc('stage_sync_candidates', { p_run_id: 'x', p_candidates: [] });
    eq(`${who}: cannot execute stage_sync_candidates`, r.error?.code, '42501');
  }
  const inner = await service.rpc('_stage_sync_candidate', { p_run_id: 'x', p_c: newA });
  eq('service role: cannot call the inner per-candidate function directly', inner.error?.code, '42501');

  // ── 8b. Partial success and retry of the SAME report ────────────────────
  console.log('\n[8b] Partial failure (row write AND evidence write) and retry of the same report');
  const failRow = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Fail-On-Row.pdf', 'Fails writing its queue row');
  const failEv = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Fail-On-Evidence.pdf', 'Fails writing its evidence');
  const okNew = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Ok-New.pdf', 'Succeeds');
  // LOCAL-ONLY fault injection: two triggers that raise for one candidate each.
  const inject = psql(`
    create function public._test_fail_row() returns trigger language plpgsql as $f$ begin
      if new.candidate_id = ${dq(failRow.candidateId)} then raise exception 'injected row failure' using errcode = 'XX001'; end if; return new; end $f$;
    create trigger _test_fail_row before insert on public.staged_guidelines for each row execute function public._test_fail_row();
    create function public._test_fail_ev() returns trigger language plpgsql as $f$ begin
      if new.discovery_id = ${dq(failEv.candidateId)} then raise exception 'injected evidence failure' using errcode = 'XX002'; end if; return new; end $f$;
    create trigger _test_fail_ev before insert on public.staged_discovery_evidence for each row execute function public._test_fail_ev();`);
  check('setup: local fault-injection triggers created', inject.status === 0, inject.err);
  const fileR = writeFile('candidates-retry.json', '2026-11-07T06:00:00.000Z', [
    { adapter: 'Local A', provider: 'BOFAS', candidates: [failRow, okNew, failEv, newA] },
  ]);
  const evNewABefore = evOf(newA.candidateId);
  const r1 = runStage(fileR);
  eq('retry run 1: exit 1; staged 1, existing 1, failed 2', [r1.status, counts(r1.out)], [1, { staged: 1, existing: 1, alreadyOpen: 0, held: 0, failed: 2, evidence: 2 }]);
  check('…both failures named with their SQLSTATEs', /XX001/.test(r1.out) && /XX002/.test(r1.out), r1.out);
  check('…and the output says the rest are committed and how to retry', /are COMMITTED/.test(r1.out) && /Re-run with the same file/.test(r1.out), r1.out);
  eq('row-write failure: no queue row', rowOf(failRow.candidateId), '');
  eq('evidence-write failure: its queue row was rolled back too (no row without evidence)', rowOf(failEv.candidateId), '');
  eq('the successful candidate committed (row + one evidence row)', [rowOf(okNew.candidateId), evOf(okNew.candidateId)], ['pending|-|sync-providers', '1']);
  psql('drop trigger _test_fail_row on public.staged_guidelines; drop function public._test_fail_row(); drop trigger _test_fail_ev on public.staged_discovery_evidence; drop function public._test_fail_ev();');
  const r2 = runStage(fileR);
  eq('retry run 2 (same file, faults cleared): exit 0; the two failures now staged, nothing else new', [r2.status, counts(r2.out)], [0, { staged: 2, existing: 2, alreadyOpen: 0, held: 0, failed: 0, evidence: 2 }]);
  eq('no duplicated rows or evidence for the candidate that succeeded first time', [psql(`select count(*) from public.staged_guidelines where candidate_id=${dq(okNew.candidateId)}`).out, evOf(okNew.candidateId)], ['1', '1']);
  eq('the existing candidate gained exactly one sighting across both attempts', Number(evOf(newA.candidateId)) - Number(evNewABefore), 1);
  eq('every sighting from both attempts carries ONE run id (a retry, not a new run)', psql(`select count(distinct discovery_run_id) from public.staged_discovery_evidence where discovery_id in (${[failRow, failEv, okNew].map((c) => dq(c.candidateId)).join(',')})`).out, '1');

  // ── 8c. Candidate-id collisions and pre-migration rows ─────────────────────
  console.log('\n[8c] Case-distinct documents sharing a candidate id; rows filed before the migration');
  const colA = syncCand('BSG', 'https://www.example.org/Case/Doc.pdf', 'Case variant A');
  const colB = syncCand('BSG', 'https://www.example.org/case/doc.pdf', 'Case variant B');
  check('setup: the two case-distinct documents really share one candidate id', colA.candidateId === colB.candidateId);
  const fileC = writeFile('candidates-collision.json', '2026-11-14T06:00:00.000Z', [
    { adapter: 'Local B', provider: 'BSG', candidates: [colA, colB] },
  ]);
  const rc = runStage(fileC);
  check('the script warns that one id carries two documents (not silently collapsed)', /share a candidate id with a DIFFERENT document/.test(rc.out), rc.out);
  eq('both documents are staged, nothing failed', [rc.status, counts(rc.out).staged, counts(rc.out).failed], [0, 2, 0]);
  check('…the collision is reported explicitly, with the id it was filed under', new RegExp(`candidate id ${colA.candidateId} already names a different document; filed as ${colA.candidateId}~[0-9a-f]{12}`).test(rc.out) && /candidate-id collisions: 1/.test(rc.out), rc.out);
  const colRows = psql(`select candidate_id||' '||primary_url from public.staged_guidelines where candidate_id like ${dq(colA.candidateId + '%')} order by candidate_id`).out.split('\n');
  eq('…two rows, one per document, each with its own URL (never merged)', colRows.map((r) => r.replace(/~[0-9a-f]{12}/, '~HASH')), [`${colA.candidateId} ${colA.versions[0].url}`, `${colA.candidateId}~HASH ${colB.versions[0].url}`]);
  eq('…each sighting on its own document\'s row, both under the requested id', psql(`select string_agg(s.primary_url||'<-'||e.discovery_id, ' | ' order by s.candidate_id) from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.candidate_id like ${dq(colA.candidateId + '%')}`).out,
    `${colA.versions[0].url}<-${colA.candidateId} | ${colB.versions[0].url}<-${colA.candidateId}`);
  const rcAgain = runStage(fileC);
  eq('re-running the same file: both existing, collision still reported, no new rows or evidence', [rcAgain.status, counts(rcAgain.out).existing, counts(rcAgain.out).evidence, /candidate-id collisions: 1/.test(rcAgain.out)], [0, 2, 0, true]);
  const otherProvider = syncCand('BSG3', 'https://www.example.org/case/doc.pdf', 'Case variant B, own id');
  const rc2 = runStage(writeFile('candidates-collision-2.json', '2026-11-14T07:00:00.000Z', [{ adapter: 'Local C', provider: 'BSG3', candidates: [otherProvider] }]));
  eq('another candidate for the second document finds the row of THAT document already open, not the first', [rc2.status, counts(rc2.out).alreadyOpen, new RegExp(`open as ${colA.candidateId}~[0-9a-f]{12} `).test(rc2.out)], [0, 1, true]);

  // A row filed by the OLD script: producer NULL, primary_url = lowercased match key.
  const legacy = syncCand('BOFAS', 'https://www.bofas.org.uk/Portals/0/Sync/Legacy-Doc.pdf', 'Filed before the migration');
  const lg = psql(`insert into public.staged_guidelines (candidate_id, pipeline, provider, topic, versions, primary_url, change_reason) values (${dq(legacy.candidateId)}, 'sync-providers', 'BOFAS', 'Legacy', '[]', ${dq(legacy.primaryUrl)}, 'NEW_GUIDELINE');`);
  check('setup: a pre-migration-style row (lowercased primary_url, producer NULL)', lg.status === 0, lg.err);
  const rl = runStage(writeFile('candidates-legacy.json', '2026-11-21T06:00:00.000Z', [{ adapter: 'Local A', provider: 'BOFAS', candidates: [legacy] }]));
  eq('its candidate is recognised as EXISTING (match-key compatibility), not refused or duplicated', [rl.status, counts(rl.out).existing, counts(rl.out).staged], [0, 1, 0]);
  check('…but reported as UNCERTAIN, not as an exact match', /pre-migration row, case unknown: 1/.test(rl.out) && /matched by LOOSE key only; original URL case unknown/.test(rl.out), rl.out);
  eq('…and its evidence row records the loose basis', psql(`select e.row_match_basis from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.candidate_id=${dq(legacy.candidateId)}`).out, 'legacy-match-key');
  const legacyDisc = await stage('run-legacy', cand({ discoveredUrl: legacy.versions[0].url }));
  eq('a discovery candidate for the same document finds the pre-migration row already open — flagged uncertain', [(legacyDisc.data as { status: string }).status, (legacyDisc.data as { heldByCandidateId: string }).heldByCandidateId, (legacyDisc.data as { identityBasis: string }).identityBasis], ['already_open', legacy.candidateId, 'legacy-match-key']);
  const basisRun = await stage('run-basis', cand({ discoveredUrl: crossUrl }));
  eq('an ordinary exact match (a row with a producer) reports identityBasis "identity"', [(basisRun.data as { status: string }).status, (basisRun.data as { identityBasis: string }).identityBasis], ['already_open', 'identity']);

  // ── 8d. Producer matching, end to end through the real scripts ───────────
  console.log('\n[8d] sync-providers matching → candidates.json → stage-candidates.ts');
  const { runDryRun, buildCandidatesFile } = await import('../../sync-providers');
  const entryOf = (pred: (u: string) => boolean) => {
    for (const g of GUIDELINES_DATA) for (const v of g.versions ?? []) if (v.url && pred(v.url)) return { id: g.id, url: v.url };
    throw new Error('fixture URL not found in the catalogue');
  };
  const pathEntry = entryOf((u) => /^https:\/\/[^?#]*\/[^?#]*[A-Z]/.test(u) && !u.includes('?') && !/falcon/i.test(u));
  const queryEntry = entryOf((u) => /\?[^#]*[A-Z]/.test(u));
  const exactUrl = pathEntry.url;
  const equivUrl = pathEntry.url.replace(/^https:\/\/([^/]+)/, (_m, h: string) => `HTTPS://${h.toUpperCase()}`) + '/?ver=Z';
  const pathLower = pathEntry.url.replace(/\/([^/]*)$/, (_m, last: string) => `/${last.toLowerCase()}`);
  const queryLower = queryEntry.url.toLowerCase();
  const novel = 'https://www.bofas.org.uk/Portals/0/Sync/Novel-8d.pdf';
  const stub = { name: 'Local 8d stub', sourceTag: 'BOFAS', fetchCandidates: async () => [exactUrl, equivUrl, pathLower, queryLower, novel]
    .map((url, i) => ({ topic: `8d item ${i}`, source: 'BOFAS', versions: [{ label: 'L', url }] })) };
  const reports8 = await runDryRun([stub]);
  const f8 = path.join(scratch, 'candidates-8d.json');
  fs.writeFileSync(f8, JSON.stringify(buildCandidatesFile(reports8, '2026-11-28T06:00:00.000Z'), null, 2));
  eq('sync-providers: 2 catalogued (exact; host-case/slash/ver-equivalent), 2 for comparison, 1 new',
    [reports8[0].matchedExisting, reports8[0].requiresComparison, reports8[0].candidates.map((c) => c.changeReason)],
    [2, 2, ['POSSIBLE_SAME_DOCUMENT', 'POSSIBLE_SAME_DOCUMENT', 'NEW_GUIDELINE']]);
  const fp8 = catalogueFingerprint();
  const r8 = runStage(f8);
  eq('stage-candidates: exit 0; staged 3, nothing else', [r8.status, counts(r8.out)], [0, { staged: 3, existing: 0, alreadyOpen: 0, held: 0, failed: 0, evidence: 3 }]);
  check('…the two comparisons are reported, naming their entries and the reason', /require document comparison: 2/.test(r8.out)
    && r8.out.includes(`compare with entry ${pathEntry.id}:`) && r8.out.includes(`compare with entry ${queryEntry.id}:`) && /letter case in the path/.test(r8.out) && /letter case in the query/.test(r8.out), r8.out);
  const rowFor = (url: string) => psql(`select change_reason||'|'||coalesce(matched_guideline_id,'-')||'|'||coalesce(changed_url,'-')||'|'||(notes like '%REQUIRES DOCUMENT COMPARISON%') from public.staged_guidelines where primary_url=${dq(url)}`).out;
  eq('path-case variant: POSSIBLE_SAME_DOCUMENT, matched entry and URL recorded', rowFor(pathLower), `POSSIBLE_SAME_DOCUMENT|${pathEntry.id}|${pathLower}|true`);
  eq('query-value-case variant: POSSIBLE_SAME_DOCUMENT, matched entry and URL recorded', rowFor(queryLower), `POSSIBLE_SAME_DOCUMENT|${queryEntry.id}|${queryLower}|true`);
  eq('…and the evidence keeps the comparison (entry, catalogue link, reason)', psql(`select e.soft_match->>'guidelineId'||'|'||(e.soft_match->>'catalogueUrl')||'|'||(length(e.soft_match->>'reason') > 40) from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where s.primary_url=${dq(pathLower)}`).out, `${pathEntry.id}|${pathEntry.url}|true`);
  eq('the genuinely new link: NEW_GUIDELINE', rowFor(novel), 'NEW_GUIDELINE|-|-|false');
  eq('exact and equivalent catalogue links: NO queue row (not duplicated)', psql(`select count(*) from public.staged_guidelines where identity_key=${dq(documentIdentityKey(exactUrl))}`).out, '0');
  const cmpId = psql(`select id from public.staged_guidelines where primary_url=${dq(pathLower)}`).out;
  const cmpId2 = psql(`select id from public.staged_guidelines where primary_url=${dq(queryLower)}`).out;
  const ap8 = await editor.client.rpc('approve_staged_guideline', { p_candidate_id: cmpId, p_final_guideline_data: { id: 'local-8d-dup', section: 'Foot & Ankle', type: 'x', topic: 'x', status: 'Live' }, p_changelog_note: 'try' });
  eq('a comparison candidate cannot be approved as a new entry (42809)', ap8.error?.code, '42809');
  const dd8 = await editor.client.rpc('resolve_discovery_candidate', { p_staged_id: cmpId, p_action: 'different-document', p_note: 'Server treats case as distinct; separate document' });
  eq('different-document keeps it OPEN, awaiting re-filing (not approvable, not closed)', [(dd8.data as { reviewStatus: string })?.reviewStatus, rowState(cmpId)], ['pending', 'pending|different-document-awaiting-refiling|false']);
  const sd8 = await editor.client.rpc('resolve_discovery_candidate', { p_staged_id: cmpId2, p_action: 'same-document', p_note: 'Same PDF under a lower-cased link' });
  eq('same-document closes it as resolved', [(sd8.data as { reviewStatus: string })?.reviewStatus, rowState(cmpId2)], ['resolved', 'resolved|same-document|true']);
  eq('…an edition-only action is refused for this class', (await editor.client.rpc('resolve_discovery_candidate', { p_staged_id: cmpId, p_action: 'new-edition', p_note: 'x' })).error?.code, '22023');
  eq('staging, refusal and resolution changed nothing in the catalogue or changelog', catalogueFingerprint(), fp8);
  const r8b = runStage(f8);
  eq('re-running the same report: all existing, no new rows or evidence', [r8b.status, counts(r8b.out).staged, counts(r8b.out).existing, counts(r8b.out).evidence], [0, 0, 3, 0]);

  // Database defence: the producer's classification is re-checked before a NEW row is filed.
  const asPayload = (c: (typeof reports8)[0]['candidates'][0], over: object = {}) => ({ ...c, schemaVersion: CANDIDATE_SCHEMA_VERSION, sourceUrlKey: documentIdentityKey(c.versions[0].url), documentComparison: c.documentComparison ?? null, ...over });
  const mk = (url: string, reason: 'NEW_GUIDELINE' | 'POSSIBLE_SAME_DOCUMENT', extra: object = {}) => asPayload({
    candidateId: makeCandidateId({ pipeline: 'sync-providers', provider: 'DEF', changeReason: reason, primaryUrl: url }),
    pipeline: 'sync-providers', provider: 'DEF', providerName: 'Defence', topic: 'defence', versions: [{ label: 'L', url }],
    primaryUrl: normaliseCandidateUrl(url), changeReason: reason, reviewStatus: 'pending', discoveredAt: '2026-11-28T06:00:00.000Z',
    matchedGuidelineId: null, providerRef: null, ...extra,
  } as (typeof reports8)[0]['candidates'][0]);
  const cmpOf = (url: string, id: string) => ({ matchedGuidelineId: id, documentComparison: { basis: 'match-key-only', guidelineId: id, guidelineIds: [id], catalogueUrl: 'x', discoveredUrl: url, reason: 'test reason' } });
  const otherLower = queryEntry.url.replace(/[A-Z]/, (c) => c.toLowerCase());
  const defRpc = await service.rpc('stage_sync_candidates', { p_run_id: 'defence', p_candidates: [
    mk(otherLower, 'NEW_GUIDELINE'),
    mk(exactUrl, 'NEW_GUIDELINE'),
    mk(otherLower, 'POSSIBLE_SAME_DOCUMENT', cmpOf(otherLower, 'ankle-fracture')),
    mk(otherLower, 'POSSIBLE_SAME_DOCUMENT', { matchedGuidelineId: queryEntry.id }),
  ] });
  const defOut = (defRpc.data as Array<{ status: string; code?: string; message?: string }>) ?? [];
  eq('DB refuses: loose-only link sent as NEW_GUIDELINE; exact catalogued link; wrong entry; comparison without reason',
    defOut.map((o) => `${o.status}:${o.code ?? ''}`), ['failed:22023', 'failed:22023', 'failed:22023', 'failed:22023']);
  check('…with messages naming the entry', /loosely matches catalogue entry/.test(defOut[0]?.message ?? '') && new RegExp(`already catalogued exactly as entry ${pathEntry.id}`).test(defOut[1]?.message ?? ''), JSON.stringify(defOut.map((o) => o.message)));

  // ── 8e. Collision ids: deterministic across retries and input order ─────
  console.log('\n[8e] Derived collision ids: retries, reordered input, and first filing');
  const derivedId = (cid: string, url: string) => `${cid}~${createHash('md5').update(documentIdentityKey(url), 'utf8').digest('hex').slice(0, 12)}`;
  const assignment = (cid: string) => psql(`select string_agg(candidate_id||' '||primary_url, ' | ' order by candidate_id) from public.staged_guidelines where candidate_id like ${dq(cid + '%')}`).out;
  const oA = syncCand('ORD', 'https://www.example.org/Order/Doc.pdf', 'Order A');
  const oB = syncCand('ORD', 'https://www.example.org/order/doc.pdf', 'Order B');
  check('setup: one candidate id for two documents', oA.candidateId === oB.candidateId);
  const fBA = writeFile('order-ba.json', '2026-12-05T06:00:00.000Z', [{ adapter: 'Local', provider: 'ORD', candidates: [oB, oA] }]);
  const o1 = runStage(fBA);
  const expected = `${oA.candidateId} ${oB.versions[0].url} | ${derivedId(oA.candidateId, oA.versions[0].url)} ${oA.versions[0].url}`;
  eq('first filing [B, A]: B takes the base id, A the derived id (formula recomputed independently)', [o1.status, assignment(oA.candidateId)], [0, expected]);
  const o2 = runStage(fBA);
  eq('retry of the same file: assignment unchanged, nothing new', [o2.status, counts(o2.out).staged, counts(o2.out).evidence, assignment(oA.candidateId)], [0, 0, 0, expected]);
  const o3 = runStage(writeFile('order-ab.json', '2026-12-12T06:00:00.000Z', [{ adapter: 'Local', provider: 'ORD', candidates: [oA, oB] }]));
  eq('a later run with REVERSED order: both existing, assignment unchanged, sighting on each own row', [o3.status, counts(o3.out).existing, counts(o3.out).staged, assignment(oA.candidateId)], [0, 2, 0, expected]);
  eq('…each sighting landed on its own document row', psql(`select s.primary_url||' <- '||e.observed_topic from public.staged_discovery_evidence e join public.staged_guidelines s on s.id=e.staged_id where e.discovery_run_id like 'sync-providers:2026-12-12%'`).out.split('\n').sort(),
    [`${oA.versions[0].url} <- ${oA.topic}`, `${oB.versions[0].url} <- ${oB.topic}`].sort());
  // The FIRST filing depends on arrival order: a fresh id pair filed [A, B] gives A the base id.
  const pA = syncCand('ORD2', 'https://www.example.org/Order2/Doc.pdf', 'Order A2');
  const pB = syncCand('ORD2', 'https://www.example.org/order2/doc.pdf', 'Order B2');
  runStage(writeFile('order-ab-fresh.json', '2026-12-05T07:00:00.000Z', [{ adapter: 'Local', provider: 'ORD2', candidates: [pA, pB] }]));
  eq('documented limit: on FIRST filing, whichever document arrives first takes the base id',
    assignment(pA.candidateId), `${pA.candidateId} ${pA.versions[0].url} | ${derivedId(pA.candidateId, pB.versions[0].url)} ${pB.versions[0].url}`);

  // Discovery path: an evidence-write failure writes nothing at all.
  const discFail = cand({ discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/Disc-Ev-Fail.pdf' });
  psql(`create function public._test_fail_ev2() returns trigger language plpgsql as $f$ begin raise exception 'injected' using errcode = 'XX003'; end $f$;
        create trigger _test_fail_ev2 before insert on public.staged_discovery_evidence for each row execute function public._test_fail_ev2();`);
  const df = await stage('run-df', discFail);
  psql('drop trigger _test_fail_ev2 on public.staged_discovery_evidence; drop function public._test_fail_ev2();');
  eq('discovery staging with a failing evidence write: error, and NO queue row left behind', [df.error?.code, psql(`select count(*) from public.staged_guidelines where candidate_id=${dq(discFail.discoveryId)}`).out], ['XX003', '0']);
  fs.rmSync(scratch, { recursive: true, force: true });
} finally {
  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
}
process.exit(fail > 0 ? 1 : 0);
