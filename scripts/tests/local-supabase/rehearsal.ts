/**
 * scripts/tests/local-supabase/rehearsal.ts
 * ─────────────────────────────────────────
 * Upgrade rehearsal: production-shaped SYNTHETIC data on the disposable LOCAL
 * Supabase, taken through supabase/DEPLOYMENT-RUNBOOK.md step by step.
 * Run it through run.ts (`npx tsx scripts/tests/local-supabase/run.ts rehearsal`).
 *
 * "Old" = scripts/stage-candidates.ts and scripts/lib/ingestion.ts as they are
 * at REHEARSAL_OLD_REF (default f2b71d9, main before this branch), extracted
 * with `git show` into ./.work/rehearsal/old, plus the exact data calls the
 * deployed app makes (select * … pending; reject_staged_candidate with 2 args;
 * approve). "New" = this checkout's scripts and src/lib/staged-service.ts calls.
 *
 * Both scripts run from an EMPTY directory (./.work/rehearsal/run), so neither
 * can load a repo .env or .env.local, with only SUPABASE_URL (loopback) and the
 * local service key in their environment.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import * as cur from '../../lib/ingestion';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import * as compat from '../../../src/lib/schema-compat';
import { applyFile, M24, M25, makeChecks, prepareSchema, psql, REPO, requireLoopbackEnv, WORK } from './stack';

const { url: SB_URL, anonKey: ANON, serviceKey: SERVICE } = requireLoopbackEnv();
const OLD_REF = process.env.REHEARSAL_OLD_REF ?? 'f2b71d9';
const R = path.join(WORK, 'rehearsal');
const PREFLIGHT = 'supabase/DEPLOY-PREFLIGHT-READONLY.sql';
const GAP = 'supabase/POST-UPGRADE-REJECTION-GAP-READONLY.sql';

// Fresh work directory, and the old code extracted from git.
fs.rmSync(R, { recursive: true, force: true });
fs.mkdirSync(path.join(R, 'old', 'lib'), { recursive: true });
fs.mkdirSync(path.join(R, 'run'), { recursive: true });
for (const rel of ['scripts/stage-candidates.ts', 'scripts/lib/ingestion.ts']) {
  const r = spawnSync('git', ['show', `${OLD_REF}:${rel}`], { cwd: REPO, encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(`git show ${OLD_REF}:${rel} failed: ${r.stderr}`); process.exit(2); }
  fs.writeFileSync(path.join(R, 'old', rel.replace(/^scripts\//, '')), r.stdout);
}
type Ingestion = typeof cur;
const old = await import(pathToFileURL(path.join(R, 'old/lib/ingestion.ts')).href) as Ingestion;

const { check, eq, fail: countFail, counts } = makeChecks();

const q = (sql: string) => { const r = psql(sql); if (r.status !== 0) throw new Error(`psql: ${r.err}`); return r.out; };
const dq = (s: string) => `$q$${s}$q$`;

const catalogueFp = () => q(`select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g;
  select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c;`);
const ORIGINAL_COLS = `concat_ws('|', id::text, candidate_id, review_status, coalesce(review_note,''), coalesce(reviewed_by::text,''),
  coalesce(reviewed_at::text,''), coalesce(resulting_guideline_id,''), coalesce(primary_url,''), change_reason,
  coalesce(matched_guideline_id,''), versions::text, topic, coalesce(provider,''), coalesce(discovered_at::text,''))`;
const stagedRows = () => Object.fromEntries(q(`select candidate_id||'='||md5(${ORIGINAL_COLS}) from public.staged_guidelines order by candidate_id`)
  .split('\n').filter(Boolean).map((l) => l.split('=') as [string, string]));
const schemaFp = () => q(`select md5(coalesce((select string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name)
      from information_schema.columns where table_schema='public'),'') ||
    coalesce((select string_agg(conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname)
      from pg_constraint where connamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(proname||'('||pg_get_function_identity_arguments(oid)||'):'||md5(prosrc), ',' order by proname, pg_get_function_identity_arguments(oid))
      from pg_proc where pronamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(indexname||':'||indexdef, ',' order by indexname) from pg_indexes where schemaname='public'),'') ||
    coalesce((select string_agg(tgrelid::regclass||'.'||tgname, ',' order by tgrelid::regclass::text, tgname)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),''))`);

const TSX = path.join(REPO, 'node_modules/tsx/dist/cli.mjs');
function runScript(script: string, file: string) {
  const r = spawnSync(process.execPath, [TSX, script, file], {
    cwd: path.join(R, 'run'), encoding: 'utf-8',
    env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '',
      SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE },
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
const OLD_SCRIPT = path.join(R, 'old/stage-candidates.ts');
const NEW_SCRIPT = path.join(REPO, 'scripts/stage-candidates.ts');

function candidate(lib: Ingestion, provider: string, url: string, topic: string) {
  return {
    candidateId: lib.makeCandidateId({ pipeline: 'sync-providers', provider, changeReason: 'NEW_GUIDELINE', primaryUrl: url }),
    pipeline: 'sync-providers', provider, providerName: `${provider} (synthetic)`, topic,
    versions: [{ label: 'PDF', url }], primaryUrl: lib.normaliseCandidateUrl(url),
    changeReason: 'NEW_GUIDELINE', reviewStatus: 'pending', discoveredAt: '2026-10-01T06:00:00.000Z',
    matchedGuidelineId: null, providerRef: null, notes: 'Synthetic rehearsal fixture.',
  };
}
function writeFile(name: string, schemaVersion: number, generatedAt: string, cands: object[]) {
  const f = path.join(R, 'run', name);
  fs.writeFileSync(f, JSON.stringify({ schemaVersion, generatedAt, reports: [{ adapter: 'Synthetic', provider: 'MIXED', candidates: cands }] }, null, 2));
  return f;
}

// Synthetic, production-shaped URLs (DNN ?ver=, encoded spaces, BOA asset GUIDs, NHFD query identity).
const U = {
  A: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/Synthetic%20Alpha.pdf?ver=AbC%3d%3d',
  B: 'https://www.boa.ac.uk/asset/AAAAAAAA-BBBB-4CCC-8DDDDDDDDDDDDDDD/',
  C: 'https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Synthetic,+Pathway.pdf',
  D: 'https://www.bofas.org.uk/Portals/0/Synthetic-Accept.pdf',
  E: 'https://www.bofas.org.uk/Portals/0/Synthetic-Reject.pdf',
  F: 'https://www.bofas.org.uk/Portals/0/Synthetic-Defer.pdf',
  G: 'https://www.bofas.org.uk/Portals/0/Synthetic-OldApp.pdf',
  DUP1: 'https://www.bofas.org.uk/Portals/0/Synthetic-Dup.pdf?ver=one',
  DUP2: 'https://www.bofas.org.uk/Portals/0/Synthetic-Dup.pdf/',
  I: 'https://www.bofas.org.uk/Portals/0/Synthetic-Interim.pdf',
  J: 'https://www.bofas.org.uk/Portals/0/Synthetic-OldInterim.pdf',
  // The document 20261024 seeds onto the editorial hold list (UK-FALCON).
  HELD: 'https://www.bofas.org.uk/Portals/0/Research/FALCON-Report-Phase%201%20and%202%20final.pdf?ver=hsYlmJh0ouIwz8sw99_7eA%3d%3d',
};
const lines = (out: string, id: string) => out.split('\n').filter((l) => l.startsWith(`${id}|`));

try {
  console.log('\n[R0] Production-like pre-upgrade schema (REBUILD-ORDER chain + both 20261012 migrations)');
  prepareSchema({ with24: false, with25: false });
  check('database prepared without 20261024/20261025', q(`select to_regclass('public.staged_discovery_evidence') is null`) === 't');
  console.log(`  info  old code from ${OLD_REF}`);
  const service = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
  const rows = GUIDELINES_DATA.map(toDbRow);
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await service.from('guidelines').insert(rows.slice(i, i + 50));
    if (error) throw new Error(error.message);
  }
  const created = await service.auth.admin.createUser({ email: 'rehearsal-editor@local.test', password: 'rehearsal-Password1!', email_confirm: true });
  const editorId = created.data.user!.id;
  const def = q(`select pg_get_functiondef('public.is_editor()'::regprocedure)`);
  q(def.replace(/array\[[\s\S]*?\]/, `array['${editorId}'::uuid]`) + ';');
  const editor = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  await editor.auth.signInWithPassword({ email: 'rehearsal-editor@local.test', password: 'rehearsal-Password1!' });

  console.log('\n[R1] Synthetic queue filed by the OLD script, decided through the OLD functions');
  const file1 = writeFile('v1-initial.json', old.CANDIDATE_SCHEMA_VERSION, '2026-10-01T06:00:00.000Z', [
    candidate(old, 'BOFAS', U.A, 'Synthetic alpha (DNN ver token)'), candidate(old, 'BOA', U.B, 'Synthetic BOA asset'),
    candidate(old, 'NHFD', U.C, 'Synthetic NHFD pathway'), candidate(old, 'BOFAS', U.D, 'Synthetic to accept'),
    candidate(old, 'BOFAS', U.E, 'Synthetic to reject'), candidate(old, 'BOFAS', U.F, 'Synthetic to defer'),
    candidate(old, 'BOFAS', U.G, 'Synthetic for the old app'),
    candidate(old, 'BOFAS', U.DUP1, 'Synthetic duplicate (BOFAS)'), candidate(old, 'BOFAS2', U.DUP2, 'Synthetic duplicate (BOFAS2)'),
  ]);
  const o1 = runScript(OLD_SCRIPT, file1);
  check('old stage-candidates.ts filed 9 rows on the old schema', o1.status === 0 && /Filed 9 NEW candidate/.test(o1.out), o1.out.slice(-400));
  const idOf = (url: string, provider = 'BOFAS') => q(`select id from public.staged_guidelines where candidate_id=${dq(old.makeCandidateId({ pipeline: 'sync-providers', provider, changeReason: 'NEW_GUIDELINE', primaryUrl: url }))}`);
  eq('old script stored the LOWERCASED key as primary_url (legacy shape)', q(`select primary_url from public.staged_guidelines where id='${idOf(U.A)}'`), old.normaliseCandidateUrl(U.A));
  const ap = await editor.rpc('approve_staged_guideline', { p_candidate_id: idOf(U.D), p_final_guideline_data: { id: 'synthetic-accepted', section: 'Foot & Ankle', type: 'Specialist society guidance', topic: 'Synthetic accepted', source: 'BOFAS', status: 'Live', versions: [{ label: 'PDF', url: U.D }] }, p_changelog_note: 'Synthetic approval (rehearsal)' });
  check('old approve published one row (accepted, guideline + changelog)', ap.data === 'synthetic-accepted', JSON.stringify(ap.error));
  const rj = await editor.rpc('reject_staged_candidate', { p_candidate_id: idOf(U.E), p_reason: 'Synthetic rejection (rehearsal)' });
  check('old reject recorded one rejection', !rj.error, JSON.stringify(rj.error));
  q(`update public.staged_guidelines set review_status='deferred' where id='${idOf(U.F)}';`);
  eq('queue shape: 1 accepted, 1 rejected, 1 deferred, 6 pending (incl. a duplicate-document pair)',
    q(`select string_agg(review_status||':'||n, ',' order by review_status) from (select review_status, count(*) n from public.staged_guidelines group by 1) s`),
    'accepted:1,deferred:1,pending:6,rejected:1');

  console.log('\n[R2] Step 0 (old schema): old and new application/script behaviour');
  const oldList = await editor.from('staged_guidelines').select('*').eq('review_status', 'pending');
  check('OLD app: pending list loads', !oldList.error && oldList.data.length === 6, JSON.stringify(oldList.error));
  const oldRej = await editor.rpc('reject_staged_candidate', { p_candidate_id: idOf(U.G), p_reason: 'Old app rejection (rehearsal)' });
  check('OLD app: reject (2 args) works', !oldRej.error, JSON.stringify(oldRej.error));
  const newList = await editor.from('staged_guidelines').select('id, review_outcome, producer, changed_url, identity_key').in('review_status', ['pending', 'deferred']);
  check('NEW app on the old schema: queue load fails with a missing-upgrade-column error → "feature unavailable" (not an empty queue)',
    Boolean(newList.error) && compat.isMissingSchemaObject(newList.error, 'column', compat.QUEUE_UPGRADE_COLUMNS), JSON.stringify(newList.error));
  const countBefore = q('select count(*) from public.staged_guidelines');
  const n0 = runScript(NEW_SCRIPT, writeFile('v2-step0.json', cur.CANDIDATE_SCHEMA_VERSION, '2026-10-20T06:00:00.000Z', [candidate(cur, 'BOFAS', U.I, 'Synthetic interim')]));
  check('NEW script on the old schema: exits 1, says the function is missing, writes nothing',
    n0.status === 1 && /stage_sync_candidates failed; NOTHING was filed/.test(n0.out) && q('select count(*) from public.staged_guidelines') === countBefore, n0.out.slice(-300));
  // A held document filed before the upgrade: nothing stopped it then.
  const oHeld = runScript(OLD_SCRIPT, writeFile('v1-held.json', old.CANDIDATE_SCHEMA_VERSION, '2026-10-02T06:00:00.000Z', [candidate(old, 'BOFAS', U.HELD, 'UK-FALCON audit report (synthetic sighting)')]));
  check('OLD script filed the (later held) UK-FALCON report as a pending NEW_GUIDELINE row', oHeld.status === 0 && /Filed 1 NEW candidate/.test(oHeld.out), oHeld.out.slice(-300));
  const heldId = idOf(U.HELD);

  const cat0 = catalogueFp();
  const schema0 = schemaFp();
  const rows0 = stagedRows();

  console.log('\n[R3] Read-only production preflight (DEPLOY-PREFLIGHT-READONLY.sql), session forced read-only');
  const pre = applyFile(PREFLIGHT, { readOnly: true });
  check('preflight ran in a read-only session without error', pre.status === 0, pre.err);
  eq('P2: no PR #174 objects', lines(pre.out, 'P2'), ['P2|f|f|f|f']);
  eq('P3: upgrade not yet applied', lines(pre.out, 'P3'), ['P3|f|f|f']);
  eq('P4: prerequisites present', lines(pre.out, 'P4'), ['P4|t|t|t|t|t']);
  eq('P6: no values the new CHECKs reject', lines(pre.out, 'P6'), []);
  eq('P7: no non-NEW_GUIDELINE rows', lines(pre.out, 'P7'), []);
  check('P8: flags the duplicate-open pair (coarse key)', lines(pre.out, 'P8').length === 1 && /synthetic-dup\.pdf\|2\|/.test(lines(pre.out, 'P8')[0]), JSON.stringify(lines(pre.out, 'P8')));
  check('P10: catalogue fingerprint reported', lines(pre.out, 'P10').length === 1);
  const p11 = lines(pre.out, 'P11');
  check('P11: lists the held legacy row (and only it)', p11.length === 1 && p11[0].startsWith(`P11|${old.makeCandidateId({ pipeline: 'sync-providers', provider: 'BOFAS', changeReason: 'NEW_GUIDELINE', primaryUrl: U.HELD })}|pending|NEW_GUIDELINE|`), JSON.stringify(p11));
  const stepZeroAt = lines(pre.out, 'P1')[0]?.split('|')[3] ?? '';
  check('P1 reports the time (recorded for the rejection-gap check)', /^\d{4}-\d\d-\d\d /.test(stepZeroAt), stepZeroAt);
  const ro = psql(`insert into public.guideline_changelog (guideline_id, description) values ('x','y');`, { readOnly: true });
  check('…and that session really was read-only (a write is refused)', ro.status !== 0 && /read-only transaction/.test(ro.err), ro.err);
  // The file must enforce read-only ITSELF, without PGOPTIONS.
  const preFile = fs.readFileSync(path.join(REPO, PREFLIGHT), 'utf-8');
  const bare = psql(preFile);
  check('preflight WITHOUT PGOPTIONS ran without error', bare.status === 0, bare.err);
  eq('…P0 reports read_only = on (the file enforces it)', lines(bare.out, 'P0'), ['P0|on']);
  check('…the file ends with ROLLBACK, never COMMIT', /\nrollback;\s*$/.test(preFile) && !/^\s*commit\b/im.test(preFile));
  const chFp = catalogueFp();
  const injected = preFile.replace(/\nrollback;\s*$/, "\ninsert into public.guideline_changelog (guideline_id, description) values ('x','injected');\nrollback;\n");
  check('…(test setup: a write was injected before the final ROLLBACK)', injected !== preFile);
  const inj = psql(injected);
  check('…an injected write inside the file is refused by Postgres (read-only transaction)', inj.status !== 0 && /read-only transaction/.test(inj.err), inj.err);
  eq('…and nothing changed', catalogueFp(), chFp);

  console.log('\n[R4] Apply 20261024 with the duplicate present → refused, fully rolled back');
  const a24 = applyFile(M24);
  check('20261024 refused with the duplicate named', a24.status !== 0 && /more than one OPEN queue row per document key/.test(a24.err) && /synthetic-dup\.pdf/i.test(a24.err), a24.err.slice(0, 400));
  eq('schema unchanged (columns, constraints, functions, indexes, triggers)', schemaFp(), schema0);
  eq('queue rows unchanged', stagedRows(), rows0);
  eq('catalogue and changelog unchanged', catalogueFp(), cat0);
  eq('no partial objects left (tables, columns, hold list)', q(`select (to_regclass('public.staged_discovery_evidence') is null)::text||(to_regclass('public.discovery_staging_holds') is null)::text||(not exists (select 1 from information_schema.columns where table_name='staged_guidelines' and column_name in ('identity_key','match_key','producer')))::text`), 'truetruetrue');

  console.log('\n[R5] Remedy: an editor closes one duplicate (old reject), then 20261024 applies');
  const dupBofas2 = idOf(U.DUP2, 'BOFAS2');
  const rem = await editor.rpc('reject_staged_candidate', { p_candidate_id: dupBofas2, p_reason: 'Duplicate of the BOFAS row (pre-migration clean-up)' });
  check('duplicate closed through the normal reject path', !rem.error, JSON.stringify(rem.error));
  const rows1 = stagedRows();
  const changed = Object.keys(rows1).filter((k) => rows1[k] !== rows0[k]);
  eq('…only that row changed', changed.length, 1);
  const pre2 = applyFile(PREFLIGHT, { readOnly: true });
  eq('P8 now clean', lines(pre2.out, 'P8'), []);
  const b24 = applyFile(M24);
  check('20261024 applied', b24.status === 0, b24.err.slice(0, 400));
  eq('catalogue and changelog unchanged by the migration', catalogueFp(), cat0);
  eq('every queue row\'s original fields unchanged by the migration', stagedRows(), rows1);
  eq('every row backfilled with both keys; all marked pre-migration (producer NULL); no outcomes',
    q(`select count(*) filter (where identity_key is null or match_key is null)||'|'||count(*) filter (where producer is not null)||'|'||count(*) filter (where review_outcome is not null) from public.staged_guidelines`), '0|0|0');
  eq('decisions intact: accepted→guideline, rejected notes kept',
    q(`select (select resulting_guideline_id from public.staged_guidelines where id='${idOf(U.D)}')||'|'||(select count(*) from public.guidelines where id='synthetic-accepted')||'|'||(select review_note from public.staged_guidelines where id='${idOf(U.E)}')`),
    'synthetic-accepted|1|Synthetic rejection (rehearsal)');
  eq('UK-FALCON hold present', q(`select status from public.discovery_staging_holds`), 'pending-editorial-decision');
  eq('…and the held legacy row\'s match key is the hold key (so approval will see it)',
    q(`select (s.match_key = h.match_key)::text from public.staged_guidelines s, public.discovery_staging_holds h where s.id='${heldId}'`), 'true');

  console.log('\n[R6] Step 1 (20261024 only): compatibility');
  const oldList2 = await editor.from('staged_guidelines').select('*').eq('review_status', 'pending');
  check('OLD app: pending list still loads', !oldList2.error && oldList2.data.length > 0, JSON.stringify(oldList2.error));
  const oldRej2 = await editor.rpc('reject_staged_candidate', { p_candidate_id: idOf(U.C, 'NHFD'), p_reason: 'Old app, step 1' });
  check('OLD app: reject (2 args) of a pending row still works', !oldRej2.error, JSON.stringify(oldRej2.error));
  eq('…but leaves NO decision-log entry (the history gap until 20261025)',
    q(`select count(*) from public.staged_discovery_decisions where staged_id='${idOf(U.C, 'NHFD')}'`), '0');
  const heldApprove = await editor.rpc('approve_staged_guideline', { p_candidate_id: heldId, p_final_guideline_data: { id: 'synthetic-held', section: 'Foot & Ankle', type: 'x', topic: 'UK-FALCON', source: 'BOFAS', status: 'Live', versions: [{ label: 'PDF', url: U.HELD }] }, p_changelog_note: 'Attempt to publish a held document' });
  check('the held legacy row cannot be approved after the upgrade: RQ002, naming the hold', heldApprove.error?.code === 'RQ002' && /hold list/.test(heldApprove.error?.message ?? ''), JSON.stringify(heldApprove.error));
  eq('…nothing published, row still pending, nothing logged',
    [q(`select count(*) from public.guidelines where id='synthetic-held'`), q(`select review_status from public.staged_guidelines where id='${heldId}'`), q(`select count(*) from public.staged_discovery_decisions where staged_id='${heldId}'`)],
    ['0', 'pending', '0']);
  const cnt = () => q('select count(*) from public.staged_guidelines');
  const c0 = cnt();
  const o2 = runScript(OLD_SCRIPT, writeFile('v1-step1-collide.json', 1, '2026-10-21T06:00:00.000Z', [
    candidate(old, 'BOFAS', U.I, 'Synthetic interim'), candidate(old, 'BOFAS3', U.DUP1, 'Same document as an open row, other provider')]));
  check('OLD script: one already-open document fails the WHOLE batch (23505), nothing filed', o2.status === 1 && /one_open_per_document|23505/.test(o2.out) && cnt() === c0, o2.out.slice(-300));
  const o3 = runScript(OLD_SCRIPT, writeFile('v1-step1-clean.json', 1, '2026-10-21T07:00:00.000Z', [candidate(old, 'BOFAS', U.J, 'Synthetic old-script interim')]));
  check('OLD script without a collision still files, as a pre-migration-shaped row (producer NULL, lowercased URL)',
    o3.status === 0 && q(`select coalesce(producer,'NULL')||'|'||primary_url from public.staged_guidelines where id='${idOf(U.J)}'`) === `NULL|${old.normaliseCandidateUrl(U.J)}`, o3.out.slice(-300));
  const n1 = runScript(NEW_SCRIPT, writeFile('v2-step1.json', cur.CANDIDATE_SCHEMA_VERSION, '2026-10-22T06:00:00.000Z', [
    candidate(cur, 'BOFAS', U.A, 'Synthetic alpha (DNN ver token)'), candidate(cur, 'BOFAS', U.I, 'Synthetic interim'),
    candidate(cur, 'BSG', U.DUP1, 'Same document as an open row, other provider')]));
  const num = (label: string) => Number(n1.out.match(new RegExp(`${label}\\s+(\\d+)`))?.[1] ?? NaN);
  eq('NEW script: legacy row existing, new row staged, same-document row already open; exit 0',
    [n1.status, num('staged \\(new\\)'), num('existing'), num('already open'), num('failed')], [0, 1, 1, 1, 0]);
  check('…and it says the legacy match is by loose key only (uncertain)', /pre-migration row, case unknown: 2/.test(n1.out), n1.out.slice(-600));
  const newList2 = await editor.from('staged_guidelines').select('id, candidate_id, review_status, review_outcome, producer, changed_url, identity_key').in('review_status', ['pending', 'deferred']);
  check('NEW app: queue loads, deferred row included', !newList2.error && newList2.data.some((r: { review_status: string }) => r.review_status === 'deferred'), JSON.stringify(newList2.error));
  const fId = idOf(U.F);
  const newRejF = await editor.rpc('reject_staged_candidate', { p_candidate_id: fId, p_reason: 'Deferred reject attempt', p_confirm_open_follow_up: false });
  check('NEW app: rejecting the deferred row without 20261025 → function missing → "feature unavailable"',
    Boolean(newRejF.error) && compat.isMissingSchemaObject(newRejF.error, 'function', ['reject_staged_candidate']), JSON.stringify(newRejF.error));
  eq('…row untouched', q(`select review_status from public.staged_guidelines where id='${fId}'`), 'deferred');

  console.log('\n[R7] Apply 20261025, then compatibility');
  const a25 = applyFile(M25);
  check('20261025 applied', a25.status === 0, a25.err.slice(0, 300));
  await new Promise((r) => setTimeout(r, 1500));
  const oldRej3 = await editor.rpc('reject_staged_candidate', { p_candidate_id: idOf(U.B, 'BOA'), p_reason: 'Old app, step 2' });
  check('OLD app: reject (2 args) still works after 20261025 (default third argument)', !oldRej3.error, JSON.stringify(oldRej3.error));
  eq('…and is now logged', q(`select action from public.staged_discovery_decisions where staged_id='${idOf(U.B, 'BOA')}'`), 'reject');
  const newRejF2 = await editor.rpc('reject_staged_candidate', { p_candidate_id: fId, p_reason: 'Deferred reject (new app)', p_confirm_open_follow_up: false });
  check('NEW app: the deferred row can now be rejected', !newRejF2.error, JSON.stringify(newRejF2.error));
  eq('…logged with the previous status', q(`select action||'|'||from_status||'|'||(decided_by='${editorId}') from public.staged_discovery_decisions where staged_id='${fId}'`), 'reject|deferred|true');
  const heldApprove2 = await editor.rpc('approve_staged_guideline', { p_candidate_id: heldId, p_final_guideline_data: { id: 'synthetic-held', section: 'Foot & Ankle', type: 'x', topic: 'UK-FALCON', source: 'BOFAS', status: 'Live' }, p_changelog_note: 'Second attempt' });
  eq('the held legacy row is still refused after 20261025 (RQ002)', heldApprove2.error?.code, 'RQ002');
  eq('catalogue and changelog unchanged across the whole upgrade', catalogueFp(), cat0);
  const post = applyFile(PREFLIGHT, { readOnly: true });
  eq('preflight after: P3 shows both applied', lines(post.out, 'P3'), ['P3|t|t|t']);
  eq('preflight after: P11 still lists the held row (until an editor rejects it)', lines(post.out, 'P11').length, 1);

  console.log('\n[R8] The rejection-gap check (POST-UPGRADE-REJECTION-GAP-READONLY.sql), since the step-0 preflight');
  const gap = applyFile(GAP, { readOnly: true, vars: { since: stepZeroAt } });
  check('gap check ran read-only without error', gap.status === 0, gap.err);
  eq('…G0 read_only = on', lines(gap.out, 'G0'), ['G0|on']);
  const gapRows = lines(gap.out, 'G1').map((l) => l.split('|')[1]).sort();
  eq('…lists exactly the rejections with no log entry made since step 0: the step-0 duplicate clean-up and the step-1 old-app rejection',
    gapRows, [old.makeCandidateId({ pipeline: 'sync-providers', provider: 'BOFAS2', changeReason: 'NEW_GUIDELINE', primaryUrl: U.DUP2 }),
      old.makeCandidateId({ pipeline: 'sync-providers', provider: 'NHFD', changeReason: 'NEW_GUIDELINE', primaryUrl: U.C })].sort());
  const gapLater = applyFile(GAP, { readOnly: true, vars: { since: q('select now()::text') } });
  eq('…and nothing when run with a time after the gap', lines(gapLater.out, 'G1'), []);
} catch (err) {
  countFail();
  console.log(`  FAIL  unexpected: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  const { pass, fail } = counts();
  console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
  process.exitCode = fail > 0 ? 1 : 0;
}
