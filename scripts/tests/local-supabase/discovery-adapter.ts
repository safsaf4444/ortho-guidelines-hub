/**
 * scripts/tests/local-supabase/discovery-adapter.ts
 * ─────────────────────────────────────────────────
 * The ACTUAL discovery staging adapter (scripts/stage-discovery.ts), run as a
 * child process exactly as an operator would, against the disposable LOCAL
 * Supabase. Also runs the actual scripts/stage-candidates.ts for the
 * competing-producer cases. Synthetic reports only.
 * Run it through run.ts (`npx tsx scripts/tests/local-supabase/run.ts adapter`).
 *
 * Both scripts run from an EMPTY directory, so no .env or .env.local can be
 * loaded, with only the variables each case sets.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CANDIDATE_SCHEMA_VERSION, makeCandidateId, normaliseCandidateUrl } from '../../lib/ingestion';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { canonicalJson } from '../../stage-discovery';
import { makeChecks, psql as stackPsql, REPO, requireLoopbackEnv, WORK } from './stack';

const { url: SB_URL, anonKey: ANON, serviceKey: SERVICE } = requireLoopbackEnv();
const { check, eq, fail: countFail, counts } = makeChecks();
const DIR = path.join(WORK, 'adapter');
const RUN_DIR = path.join(DIR, 'run');        // empty cwd for the scripts
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(RUN_DIR, { recursive: true });
const TSX = path.join(REPO, 'node_modules/tsx/dist/cli.mjs');

const q = (sql: string) => { const r = stackPsql(sql); if (r.status !== 0) throw new Error(`psql: ${r.err}`); return r.out; };
const dq = (s: string) => `$q$${s}$q$`;
const fingerprint = () => q(`select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g;
  select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c;`);
const snapshot = () => q(`select (select count(*) from public.staged_guidelines)||'|'||(select count(*) from public.staged_discovery_evidence)||'|'||(select count(*) from public.staged_discovery_decisions)`);

/** Spawned, not spawnSync: the decoy server below must keep serving while a child runs. */
function run(script: string, args: string[], env: Record<string, string>): Promise<{ status: number; out: string }> {
  const base: Record<string, string> = {};
  for (const k of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP']) if (process.env[k]) base[k] = process.env[k] as string;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX, script, ...args], { cwd: RUN_DIR, env: { ...base, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('close', (code) => resolve({ status: code ?? -1, out }));
  });
}
const ADAPTER = path.join(REPO, 'scripts/stage-discovery.ts');
const STAGER = path.join(REPO, 'scripts/stage-candidates.ts');
type AdapterOut = { mode: string; runId: string; counts: Record<string, number>; items: Array<{ discoveryId: string; outcome: string; evidence?: string; catalogueRelation?: string; detail?: string; stagedId?: string }>; reportOnly: unknown[] };
let outN = 0;
async function adapter(reportFile: string, extra: string[], env: Record<string, string> = {}) {
  const outFile = path.join(DIR, `out-${++outN}.json`);
  const r = await run(ADAPTER, [reportFile, ...extra, '--out', outFile], env);
  const json = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf-8')) as AdapterOut : null;
  return { ...r, json };
}
const write = (reportFile: string, env: Record<string, string> = {}) =>
  adapter(reportFile, ['--write', '--target', SB_URL], { SUPABASE_SERVICE_ROLE_KEY: SERVICE, ...env });
const outcomeOf = (j: AdapterOut | null, id: string) => j?.items.find((i) => i.discoveryId === id)?.outcome;

// A decoy that counts every request made to it. Used as --target in dry runs
// and as SUPABASE_URL in write runs: any request to it is a failure.
let decoyHits = 0;
const decoy = http.createServer((_req, res) => { decoyHits++; res.statusCode = 500; res.end('decoy'); });
await new Promise<void>((r) => decoy.listen(0, '127.0.0.1', () => r()));
const DECOY = `http://127.0.0.1:${(decoy.address() as { port: number }).port}`;

// ── fixtures ──────────────────────────────────────────────────────────────
const SWEEP = '2026-10-24T00:45:41.732Z';
const EBI_SURFACE = 'https://ebi.aomrc.org.uk/specialty/musculoskeletal/';
const keyCount = new Map<string, number>();
for (const g of GUIDELINES_DATA) for (const v of g.versions ?? []) if (v.url && v.url !== '#') keyCount.set(normaliseCandidateUrl(v.url), (keyCount.get(normaliseCandidateUrl(v.url)) ?? 0) + 1);
const SINGLE = GUIDELINES_DATA.flatMap((g) => {
  const v = (g.versions ?? []).find((x) => x.url && x.url !== '#' && !x.url.includes('?') && keyCount.get(normaliseCandidateUrl(x.url)) === 1);
  return v ? [{ id: g.id, url: v.url }] : [];
});
const softMatch = (guidelineId: string) => ({ guidelineId, guidelineTopic: 'synthetic', guidelineSource: 'synthetic', titleSimilarity: 0.71,
  sharedTitleTokens: ['ankle'], sharedPublishers: ['BOA'], discoveredPublishers: ['NHS EBI'], publishersFromTitle: [], cataloguePublishers: ['BOA'], statement: 'Synthetic soft match.' });
const tokenChange = (guidelineId: string) => ({ parameter: 'ver', previousValue: 'OLD', observedValue: 'NEW', previousObservedAt: '2026-10-01T00:00:00.000Z', guidelineId,
  statement: 'Synthetic: the ver token differs. That is the entire observation.' });
const labels = (readFrom: string) => [
  { origin: 'page-body', value: 'Published:  1 May 2024 ', readFrom, fieldLabel: 'Published' },
  { origin: 'anchor-text', value: '(v2.1 — draft?)', readFrom },
];
type Cand = Record<string, unknown> & {
  discoveryId: string; discoveredUrl: string; notes: string; statedLabels: unknown; urlAlternatives: unknown;
  softMatch?: unknown; tokenChange?: unknown;
};
function c(over: Record<string, unknown> & { discoveryId: string; discoveredUrl: string }): Cand {
  return { provider: 'NHS EBI', providerName: 'NHS Evidence-Based Interventions', surface: EBI_SURFACE, topic: `Synthetic ${over.discoveryId}`,
    urlAlternatives: [], statedLabels: labels(EBI_SURFACE), classification: 'NEW_GUIDELINE', matchedGuidelineId: null,
    verificationRequired: true, discoveredAt: SWEEP, notes: `Synthetic note for ${over.discoveryId}.`, ...over };
}
function reportFile(name: string, reports: object[], generatedAt = SWEEP, indent = 2) {
  const f = path.join(DIR, name);
  fs.writeFileSync(f, JSON.stringify({ schemaVersion: 1, generatedAt, note: 'Synthetic discovery report (local adapter test).', catalogueEntryCount: GUIDELINES_DATA.length, reports }, null, indent));
  return f;
}
const FALCON = 'https://www.bofas.org.uk/Portals/0/Research/FALCON-Report-Phase%201%20and%202%20final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d';
const T = SINGLE[0];
const N = c({ discoveryId: 'nhsebi-new-guideline-a0000001', discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/Adapter-New-Guidance/?Ref=AbC' });
const E = c({ discoveryId: 'nhsebi-possible-new-edition-a0000002', classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'ankle-fracture',
  discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/adapter-edition-2026/', softMatch: softMatch('ankle-fracture'),
  urlAlternatives: [{ url: 'https://www.boa.ac.uk/asset/F8B1C499%2DC38A%2D4805%2D8CB8D8EB3087BCA7/', relation: 'co-publisher-host', scope: 'document', derivedFrom: 'x', transform: 'none — read from the existing catalogue entry', equivalence: 'not-probed', statement: 'May be the same document on a second host.' }] });
const K = c({ discoveryId: 'nhsebi-edition-token-changed-a0000003', classification: 'EDITION_TOKEN_CHANGED', matchedGuidelineId: T.id,
  discoveredUrl: `${T.url}?ver=NEW`, tokenChange: tokenChange(T.id) });
const H = c({ discoveryId: 'bess-new-guideline-a0000004', provider: 'BESS', providerName: 'BESS', surface: 'https://bess.ac.uk/pathways/', discoveredUrl: FALCON, statedLabels: labels('https://bess.ac.uk/pathways/') });
const B = c({ discoveryId: 'bofas-new-guideline-a0000005', provider: 'BOFAS', providerName: 'BOFAS', surface: 'https://www.bofas.org.uk/clinician/research/bofas-publications', discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Adapter-Test.pdf' });
const F = c({ discoveryId: 'bask-new-guideline-a0000006', provider: 'BASK', providerName: 'BASK', discoveredUrl: 'https://baskonline.com/adapter.pdf' });
const RETIRED = { url: 'https://ebi.aomrc.org.uk/interventions/retired-thing/', topic: 'Retired thing', guidelineId: SINGLE[1].id, statement: 'Listed under the retired-guidance term.' };
const reportsA = (cands: { N: object; E: object; K: object; H: object }) => [
  { provider: 'NHS EBI', providerName: 'NHS EBI', outcome: 'ok', candidates: [cands.N, cands.E, cands.K],
    surfaces: [{ url: 'https://ebi.aomrc.org.uk/specialty/retired-guidance/', retirementAssertions: [RETIRED] }] },
  { provider: 'BESS', providerName: 'BESS', outcome: 'ok', candidates: [cands.H], surfaces: [] },
  { provider: 'BOFAS', providerName: 'BOFAS', outcome: 'ok', candidates: [B], surfaces: [] },
  { provider: 'BASK', providerName: 'BASK', outcome: 'failed', outcomeReason: 'HTTP 403', candidates: [F], surfaces: [] },
];
const rowOf = (cid: string) => q(`select coalesce((select id::text||'|'||review_status||'|'||change_reason||'|'||coalesce(producer,'-')||'|'||primary_url from public.staged_guidelines where candidate_id=${dq(cid)}),'none')`);

const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  console.log('\n[0] Setup');
  if (q('select count(*) from public.guidelines') === '0') {
    const rows = GUIDELINES_DATA.map(toDbRow);
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await service.from('guidelines').insert(rows.slice(i, i + 50));
      if (error) throw new Error(`seed: ${error.message}`);
    }
  }
  const made = await service.auth.admin.createUser({ email: 'adapter-editor@local.test', password: 'adapter-Password1!', email_confirm: true });
  const editorId = made.data.user!.id;
  q(q(`select pg_get_functiondef('public.is_editor()'::regprocedure)`).replace(/array\[[\s\S]*?\]/, `array['${editorId}'::uuid]`) + ';');
  const editor = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await editor.auth.signInWithPassword({ email: 'adapter-editor@local.test', password: 'adapter-Password1!' });
  check('setup: catalogue seeded, 20261024 + 20261025 present', q(`select to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is not null`) === 't');
  check('setup: enough single-entry catalogue links', SINGLE.length >= 4);
  const cat0 = fingerprint();
  const A = reportFile('report-a.json', reportsA({ N, E, K, H }));

  console.log('\n[1] Dry run (the default): no database requests at all');
  const snap0 = snapshot();
  const d1 = await adapter(A, ['--target', DECOY], { SUPABASE_URL: DECOY, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  eq('exit 0', d1.status, 0);
  eq('the decoy (given as --target AND as SUPABASE_URL) received no request', decoyHits, 0);
  eq('nothing changed in the database', snapshot(), snap0);
  eq('it says what it WOULD submit: the four discovery-owned items', d1.json?.counts['would-submit'], 4);
  eq('…and why the rest are not submitted', [outcomeOf(d1.json, B.discoveryId), outcomeOf(d1.json, F.discoveryId)], ['not-owner', 'provider-not-ok']);
  eq('…with the retirement assertion as report-only', d1.json?.reportOnly.length, 1);
  check('…and the BOFAS transition shown as pending, not active', /Pending ownership transition \(NOT active\): BOFAS → discover \(awaiting-approval\)/.test(d1.out), d1.out.slice(-600));
  const d2 = await adapter(A, []);
  eq('a dry run with no target and no key at all: exit 0, nothing written', [d2.status, snapshot()], [0, snap0]);

  console.log('\n[2] Write mode needs an explicit target and key; no fallback');
  const w0 = await run(ADAPTER, [A, '--write'], { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  check('--write without --target is refused even with SUPABASE_URL set', w0.status === 2 && /needs --target/.test(w0.out), w0.out);
  const w0b = await run(ADAPTER, [A, '--write', '--target', 'https://example.invalid'], { SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  check('a non-loopback target without --allow-remote-target is refused', w0b.status === 2 && /not a loopback address/.test(w0b.out), w0b.out);
  const w0c = await run(ADAPTER, [A, '--write', '--target', SB_URL], {});
  check('no service key in the environment: refused (no .env is read)', w0c.status === 2 && /SUPABASE_SERVICE_ROLE_KEY is not set/.test(w0c.out), w0c.out);
  eq('…none of these wrote anything', snapshot(), snap0);

  console.log('\n[3] Write a valid report: every supported class staged, with its evidence');
  const w1 = await write(A, { SUPABASE_URL: DECOY });
  eq('exit 0', w1.status, 0);
  eq('the decoy SUPABASE_URL was never used', decoyHits, 0);
  eq('outcomes: NEW / EDITION / TOKEN staged, UK-FALCON held',
    [N, E, K, H].map((x) => outcomeOf(w1.json, x.discoveryId)), ['staged', 'staged', 'staged', 'held']);
  eq('…BOFAS not submitted (not-owner), the failed provider not submitted', [outcomeOf(w1.json, B.discoveryId), outcomeOf(w1.json, F.discoveryId)], ['not-owner', 'provider-not-ok']);
  eq('…no failed or unsupported items', [w1.json?.counts.failed, w1.json?.counts.unsupported], [0, 0]);
  eq('rows: discover-produced, one per class, URL stored verbatim',
    [N, E, K].map((x) => rowOf(x.discoveryId).split('|').slice(1).join('|')),
    [`pending|NEW_GUIDELINE|discover|${N.discoveredUrl}`, `pending|POSSIBLE_NEW_EDITION|discover|${E.discoveredUrl}`, `pending|EDITION_TOKEN_CHANGED|discover|${K.discoveredUrl}`]);
  const ev = (x: { discoveryId: string }) => JSON.parse(q(`select row_to_json(e)::text from public.staged_discovery_evidence e where discovery_id=${dq(x.discoveryId)} and discovery_run_id=${dq(w1.json!.runId)}`)) as Record<string, unknown>;
  // jsonb stores object keys in its own order; every key and value must match.
  const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
  check('stated labels kept verbatim (spacing and punctuation included)', same(ev(N).stated_labels, N.statedLabels), JSON.stringify(ev(N).stated_labels));
  check('URL alternatives kept verbatim', same(ev(E).url_alternatives, E.urlAlternatives), JSON.stringify(ev(E).url_alternatives));
  check('soft-match evidence kept verbatim', same(ev(E).soft_match, E.softMatch), JSON.stringify(ev(E).soft_match));
  check('token-change evidence kept verbatim', same(ev(K).token_change, K.tokenChange), JSON.stringify(ev(K).token_change));
  eq('surface and observed time kept', [ev(N).surface_url, new Date(String(ev(N).observed_at)).toISOString()], [EBI_SURFACE, SWEEP]);
  eq('the database\'s link relation recorded: edition none (rests on the title), token exact', [ev(E).catalogue_relation, ev(K).catalogue_relation], ['none', 'exact']);
  eq('producer notes kept on the queue row', q(`select notes from public.staged_guidelines where candidate_id=${dq(N.discoveryId)}`), N.notes);
  eq('UK-FALCON: no queue row and no evidence', q(`select (select count(*) from public.staged_guidelines where primary_url ilike '%falcon%')||'|'||(select count(*) from public.staged_discovery_evidence where discovered_url ilike '%falcon%')`), '0|0');
  eq('retirement and BOFAS and the failed provider: no rows', [RETIRED.url, B.discoveredUrl, F.discoveredUrl].map((u) => q(`select count(*) from public.staged_guidelines where primary_url=${dq(u)}`)), ['0', '0', '0']);
  eq('no decision was logged and nothing was published', [q('select count(*) from public.staged_discovery_decisions'), fingerprint()], ['0', cat0]);
  const snap1 = snapshot();

  console.log('\n[4] Retrying the same report adds nothing');
  const w2 = await write(A);
  eq('exit 0, same run id', [w2.status, w2.json?.runId], [0, w1.json?.runId]);
  eq('staged items now existing, evidence already recorded', [N, E, K].map((x) => [outcomeOf(w2.json, x.discoveryId), w2.json?.items.find((i) => i.discoveryId === x.discoveryId)?.evidence]),
    [['existing', 'already_recorded'], ['existing', 'already_recorded'], ['existing', 'already_recorded']]);
  eq('…UK-FALCON still held', outcomeOf(w2.json, H.discoveryId), 'held');
  eq('…no new rows, evidence or decisions', snapshot(), snap1);

  console.log('\n[5] Changing only generatedAt (and re-formatting the file) cannot bypass retry protection');
  const raw = JSON.parse(fs.readFileSync(A, 'utf-8')) as Record<string, unknown>;
  const restamped = path.join(DIR, 'report-a-restamped.json');
  // New generatedAt, new note, keys in reverse order, no indentation.
  const rev = Object.fromEntries(Object.entries({ ...raw, generatedAt: '2031-01-01T00:00:00.000Z', note: 'Re-saved.' }).reverse());
  fs.writeFileSync(restamped, JSON.stringify(rev));
  const w3 = await write(restamped);
  eq('same run id as the original', w3.json?.runId, w1.json?.runId);
  eq('every item existing / already recorded; nothing added', [w3.json?.counts.staged, w3.json?.items.filter((i) => i.evidence === 'appended').length, snapshot()], [0, 0, snap1]);

  console.log('\n[6] Editor decisions stand; a new sweep only adds sightings');
  const idN = rowOf(N.discoveryId).split('|')[0];
  const idE = rowOf(E.discoveryId).split('|')[0];
  const ap = await editor.rpc('approve_staged_guideline', { p_candidate_id: idN, p_final_guideline_data: { id: 'adapter-test-published', section: 'Foot & Ankle', type: 'x', topic: 'Adapter test', source: 'NHS EBI', status: 'Live', versions: [{ label: 'Link', url: N.discoveredUrl }] }, p_changelog_note: 'Editor approval (adapter test)' });
  eq('(setup) the editor approved the new guideline', ap.data, 'adapter-test-published');
  const rj = await editor.rpc('reject_staged_candidate', { p_candidate_id: idE, p_reason: 'Editor rejection (adapter test)' });
  eq('(setup) the editor rejected the edition', rj.error, null);
  const cat1 = fingerprint();
  const decided = () => q(`select string_agg(candidate_id||':'||review_status||':'||coalesce(review_note,'-')||':'||coalesce(resulting_guideline_id,'-'), ',' order by candidate_id) from public.staged_guidelines where id in ('${idN}','${idE}')`);
  const decided0 = decided();
  const sweep2 = '2026-10-31T00:45:00.000Z';
  const A2 = reportFile('report-a-sweep2.json', reportsA({ N: { ...N, discoveredAt: sweep2 }, E: { ...E, discoveredAt: sweep2 }, K: { ...K, discoveredAt: sweep2 }, H: { ...H, discoveredAt: sweep2 } }), sweep2);
  const w4 = await write(A2);
  check('a new sweep is a new run', w4.json?.runId !== w1.json?.runId);
  eq('accepted and rejected rows come back "existing", their sightings appended',
    [N, E].map((x) => [outcomeOf(w4.json, x.discoveryId), w4.json?.items.find((i) => i.discoveryId === x.discoveryId)?.evidence]), [['existing', 'appended'], ['existing', 'appended']]);
  eq('…their decisions are unchanged (status, note, published id)', decided(), decided0);
  eq('…no new queue rows', q('select count(*) from public.staged_guidelines'), snap1.split('|')[0]);
  eq('…and the adapter published nothing (catalogue as the editor left it)', fingerprint(), cat1);

  console.log('\n[7] A partial failure, then a retry of the same report');
  const P = [1, 2, 3].map((i) => c({ discoveryId: `nhsebi-new-guideline-p000000${i}`, discoveredUrl: `https://ebi.aomrc.org.uk/interventions/partial-${i}/` }));
  const C = reportFile('report-c.json', [{ provider: 'NHS EBI', providerName: 'NHS EBI', outcome: 'ok', candidates: P, surfaces: [] }]);
  q(`create function public._test_fail_evidence() returns trigger language plpgsql as $f$
       begin if new.discovered_url = ${dq(P[1].discoveredUrl)} then raise exception 'synthetic transient failure' using errcode = 'XX003'; end if; return new; end $f$;
     create trigger _test_fail_evidence before insert on public.staged_discovery_evidence for each row execute function public._test_fail_evidence();`);
  const p1 = await write(C);
  eq('exit 1 with one failure; the others staged', [p1.status, P.map((x) => outcomeOf(p1.json, x.discoveryId))], [1, ['staged', 'failed', 'staged']]);
  check('…the failure is reported with its cause', /XX003.*synthetic transient failure/.test(p1.json?.items.find((i) => i.discoveryId === P[1].discoveryId)?.detail ?? ''));
  eq('…and left no row behind (row and evidence roll back together)', rowOf(P[1].discoveryId), 'none');
  q('drop trigger _test_fail_evidence on public.staged_discovery_evidence; drop function public._test_fail_evidence();');
  const p2 = await write(C);
  eq('retry: exit 0, the failed item staged, the others existing / already recorded',
    [p2.status, P.map((x) => [outcomeOf(p2.json, x.discoveryId), p2.json?.items.find((i) => i.discoveryId === x.discoveryId)?.evidence])],
    [0, [['existing', 'already_recorded'], ['staged', 'appended'], ['existing', 'already_recorded']]]);
  eq('…exactly one row and one sighting per item', P.map((x) => q(`select count(*)||'/'||(select count(*) from public.staged_discovery_evidence e where e.discovery_id=${dq(x.discoveryId)}) from public.staged_guidelines where candidate_id=${dq(x.discoveryId)}`)), ['1/1', '1/1', '1/1']);

  console.log('\n[8] Competing producers cannot create duplicate review items');
  const syncCand = (provider: string, url: string) => ({
    candidateId: makeCandidateId({ pipeline: 'sync-providers', provider, changeReason: 'NEW_GUIDELINE', primaryUrl: url }),
    pipeline: 'sync-providers', provider, providerName: `${provider} (local test)`, topic: `Sync ${provider}`,
    versions: [{ label: 'PDF', url }], primaryUrl: normaliseCandidateUrl(url), changeReason: 'NEW_GUIDELINE', reviewStatus: 'pending',
    discoveredAt: '2026-10-24T06:00:00.000Z', matchedGuidelineId: null, providerRef: null,
  });
  const syncFile = (name: string, cands: object[]) => {
    const f = path.join(DIR, name);
    fs.writeFileSync(f, JSON.stringify({ schemaVersion: CANDIDATE_SCHEMA_VERSION, generatedAt: '2026-10-24T06:00:00.000Z', reports: [{ adapter: 'Local', provider: 'MIXED', candidates: cands }] }, null, 2));
    return f;
  };
  const stager = (f: string) => run(STAGER, [f], { SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  const num = (out: string, label: string) => Number(out.match(new RegExp(`${label}\\s+(\\d+)`))?.[1] ?? NaN);
  const openFor = (url: string) => q(`select count(*) from public.staged_guidelines where identity_key = public.document_identity_key(${dq(url)}) and review_status in ('pending','deferred')`);
  // (a) sync-providers first, then discovery for the same document
  const X = 'https://ebi.aomrc.org.uk/interventions/Shared-Doc-X/';
  const sx = await stager(syncFile('sync-x.json', [syncCand('BSG', X)]));
  eq('(a) sync-providers files the document', [sx.status, num(sx.out, 'staged \\(new\\)')], [0, 1]);
  const dx = await write(reportFile('report-x.json', [{ provider: 'NHS EBI', outcome: 'ok', candidates: [c({ discoveryId: 'nhsebi-new-guideline-x0000001', discoveredUrl: X })], surfaces: [] }]));
  eq('(a) discovery then finds it already open, held by sync-providers', [outcomeOf(dx.json, 'nhsebi-new-guideline-x0000001'), /sync-providers/.test(dx.json?.items[0]?.detail ?? '')], ['already_open', true]);
  eq('(a) one open row for the document', openFor(X), '1');
  // (b) discovery first, then sync-providers for the same document
  const Y = 'https://ebi.aomrc.org.uk/interventions/Shared-Doc-Y/';
  const dy = await write(reportFile('report-y.json', [{ provider: 'NHS EBI', outcome: 'ok', candidates: [c({ discoveryId: 'nhsebi-new-guideline-y0000001', discoveredUrl: Y })], surfaces: [] }]));
  eq('(b) discovery files the document', outcomeOf(dy.json, 'nhsebi-new-guideline-y0000001'), 'staged');
  const sy = await stager(syncFile('sync-y.json', [syncCand('BSSH', Y)]));
  eq('(b) sync-providers then finds it already open', [sy.status, num(sy.out, 'already open')], [0, 1]);
  eq('(b) one open row for the document', openFor(Y), '1');
  // (c) the sync path enforces ownership too
  const Z = 'https://ebi.aomrc.org.uk/interventions/Owned-By-Discovery-Z/';
  const W = 'https://ros.example/unowned-w.pdf';
  const V = 'https://www.bsg.example/owned-v.pdf';
  const sz = await stager(syncFile('sync-z.json', [syncCand('NHS EBI', Z), syncCand('ROS', W), syncCand('BSG', V)]));
  check('(c) sync-providers does not submit an NHS EBI candidate: reported not-owner', /NHS EBI .*not-owner: provider "NHS EBI" is staged by discover/.test(sz.out), sz.out.slice(0, 900));
  check('(c) …nor an unowned provider, which fails the run (exit 1)', sz.status === 1 && /ROS .*unowned/.test(sz.out), sz.out.slice(0, 900));
  eq('(c) …while its own provider\'s candidate is still filed', [num(sz.out, 'staged \\(new\\)'), [Z, W, V].map((u) => q(`select count(*) from public.staged_guidelines where primary_url=${dq(u)}`))], [1, ['0', '0', '1']]);

  console.log('\n[9] Unsupported, contradictory or unowned items are refused and reported, never written');
  const snap9 = snapshot();
  const Bd = reportFile('report-b.json', [
    { provider: 'NHS EBI', outcome: 'ok', surfaces: [], candidates: [
      c({ discoveryId: 'nhsebi-new-guideline-b0000001', discoveredUrl: SINGLE[2].url }),
      c({ discoveryId: 'nhsebi-possible-new-edition-b0000002', classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: SINGLE[3].id, discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/no-evidence/' }),
      c({ discoveryId: 'nhsebi-retired-b0000003', classification: 'PUBLISHER_ASSERTED_RETIREMENT', discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/retired-b/' }),
    ] },
    { provider: 'ROS', outcome: 'ok', surfaces: [], candidates: [c({ discoveryId: 'ros-new-guideline-b0000004', provider: 'ROS', discoveredUrl: 'https://ros.example/b.pdf' })] },
  ]);
  const b1 = await write(Bd);
  eq('exit 1', b1.status, 1);
  eq('already-catalogued NEW_GUIDELINE: unsupported (refused by the database)', [outcomeOf(b1.json, 'nhsebi-new-guideline-b0000001'), /already catalogued exactly/.test(b1.json?.items.find((i) => i.discoveryId === 'nhsebi-new-guideline-b0000001')?.detail ?? '')], ['unsupported', true]);
  eq('edition without its evidence: unsupported (refused by the database)', outcomeOf(b1.json, 'nhsebi-possible-new-edition-b0000002'), 'unsupported');
  eq('a retirement-type class: unsupported, never submitted', outcomeOf(b1.json, 'nhsebi-retired-b0000003'), 'unsupported');
  eq('an unowned provider: unowned', outcomeOf(b1.json, 'ros-new-guideline-b0000004'), 'unowned');
  eq('…and nothing was written for any of them', snapshot(), snap9);

  console.log('\n[10] Over the whole run');
  eq('the adapter never published: the only catalogue change is the editor\'s one approval', Number(fingerprint().split('\n')[0].split(':')[0]) - Number(cat0.split('\n')[0].split(':')[0]), 1);
  eq('UK-FALCON never entered the queue', q(`select count(*) from public.staged_guidelines where primary_url ilike '%falcon%'`), '0');
  eq('the decoy was never contacted', decoyHits, 0);
} catch (err) {
  countFail();
  console.log(`  FAIL  unexpected: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  decoy.close();
  const { pass, fail } = counts();
  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
  process.exitCode = fail > 0 ? 1 : 0;
}
