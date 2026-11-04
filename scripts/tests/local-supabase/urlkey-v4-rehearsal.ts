/**
 * scripts/tests/local-supabase/urlkey-v4-rehearsal.ts
 * ──────────────────────────────────────────────────
 * Rehearses scripts/deploy/Apply-UrlKeyV4-Psql.ps1 (url-key v4,
 * 20261104_url_key_unreserved_decoding.sql) end to end against the disposable
 * LOCAL Supabase, with the same script, image, psql invocation, files and gate
 * as production; only the host (host.docker.internal:54322), the local
 * credential and sslmode differ. Then backs the upgraded database up with
 * scripts/backup/Backup-Public.ps1 and restore-verifies it, so the backup
 * route is proven on a database that HAS the review-queue objects.
 *
 * Run through run.ts (`npx tsx scripts/tests/local-supabase/run.ts urlkey-v4`). Windows only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { documentIdentityKey, normaliseCandidateUrl } from '../../lib/ingestion';
import { applyFile, makeChecks, prepareSchema, psql, REPO, requireLoopbackEnv } from './stack';

const ENV = requireLoopbackEnv();
if (process.platform !== 'win32') { console.log('Windows only (PowerShell wrapper).'); process.exit(0); }

const { check, eq, counts } = makeChecks();
const SCRIPT = path.join(REPO, 'scripts/deploy/Apply-UrlKeyV4-Psql.ps1');
const GATE = 'supabase/URL-KEY-V4-GATE-READONLY.sql';
const OLD_GATE = 'supabase/POST-MIGRATION-GATE-READONLY.sql';
const DEST = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-urlkey-v4-'));
const BOA = 'https://www.boa.ac.uk/asset/a811fc01%2defc3%2d44b7%2dbf6c4b0d4d4c2c85';

const q = (sql: string) => { const r = psql(sql); if (r.status !== 0) throw new Error(`psql: ${r.err}`); return r.out; };
const asAdmin = (sql: string) => {
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_ortho-disc-test', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`psql (supabase_admin): ${r.stderr}`);
  return (r.stdout ?? '').trim();
};
const keyDefs = () => q(`select md5(string_agg(coalesce(pg_get_functiondef(to_regprocedure(f)), '-') || coalesce(obj_description(to_regprocedure(f), 'pg_proc'), '-'), '|'))
  from unnest(array['public.document_match_key(text)','public.document_identity_key(text)','public._url_decode_unreserved(text)']) f`);
const schemaFp = () => q(`select md5(
    coalesce((select string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name) from information_schema.columns where table_schema='public'),'') ||
    coalesce((select string_agg(conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname) from pg_constraint where connamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(oid::regprocedure||':'||md5(pg_get_functiondef(oid))||':'||coalesce(array_to_string(proacl,','),'-'), ',' order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(indexname||':'||indexdef, ',' order by indexname) from pg_indexes where schemaname='public'),''))`);
const dataFp = () => q(`select (select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g) || ' ' ||
  (select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c) || ' ' ||
  (select md5(coalesce(string_agg(id || '=' || coalesce(versions::text, ''), '|' order by id), '')) from public.guidelines)`);

async function seed() {
  const service = createClient(ENV.url, ENV.serviceKey, { auth: { persistSession: false } });
  const rows = GUIDELINES_DATA.map(toDbRow);
  for (let i = 0; i < rows.length; i += 50) { const r = await service.from('guidelines').insert(rows.slice(i, i + 50)); if (r.error) throw new Error(r.error.message); }
  q(`insert into public.guideline_changelog (guideline_id, description) select id, 'v4 rehearsal note ' || id from public.guidelines order by id limit 5;
     insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason)
       values ('v4-plain', 'BESS', 'Unaffected queue row', '[]', 'https://example.org/Plain-Doc.pdf', 'NEW_GUIDELINE');`);
}
async function fresh() { prepareSchema({ with24: true, with25: true }); await seed(); }

function expectations() {
  return {
    guidelines: q(`select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g`),
    changelog: q(`select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c`),
    staged: q('select count(*) from public.staged_guidelines'),
    editors: '1',
    holds: q(`select count(*)||':'||md5(coalesce(string_agg(h::text,'|' order by match_key),'')) from public.discovery_staging_holds h`),
  };
}
type Exp = ReturnType<typeof expectations>;
interface Run { status: number | null; out: string; folder?: string; record?: Record<string, unknown>; transcript: string }
function run(opts: { mode?: 'apply' | 'inspect' | 'rollback' | 'dry'; exp?: Exp; extra?: string; host?: string; credential?: boolean; sourceRoot?: string; user?: string; ssl?: string; port?: number; confirmMigration?: string } = {}): Run {
  const exp = opts.exp ?? expectations();
  const before = new Set(fs.readdirSync(DEST));
  const cred = opts.credential === false ? '' : `-Credential (New-Object System.Management.Automation.PSCredential('postgres', (ConvertTo-SecureString 'postgres' -AsPlainText -Force)))`;
  const mode = opts.mode ?? 'apply';
  const modeArgs = mode === 'apply' ? `-Apply -ConfirmMigration ${opts.confirmMigration ?? '20261104_url_key_unreserved_decoding'}`
    : mode === 'inspect' ? '-Inspect' : mode === 'rollback' ? '-Rollback -ConfirmRollback URL-KEY-V4-ROLLBACK' : '';
  const ps = `& { & '${SCRIPT}' -PoolerHost '${opts.host ?? 'host.docker.internal'}' -Port ${opts.port ?? 54322} -DbUser '${opts.user ?? 'postgres'}' -SslMode ${opts.ssl ?? 'disable'} -RecordDir '${DEST}' ` +
    `-ExpectGuidelines '${exp.guidelines}' -ExpectChangelog '${exp.changelog}' -ExpectStaged ${exp.staged} -ExpectEditors ${exp.editors} -ExpectHolds '${exp.holds}' ` +
    `${modeArgs} ${cred} ${opts.sourceRoot ? `-SourceRoot '${opts.sourceRoot}'` : ''} ${opts.extra ?? ''}; exit $LASTEXITCODE }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf-8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const made = fs.readdirSync(DEST).filter((d) => !before.has(d));
  const folder = made.length === 1 ? path.join(DEST, made[0]) : undefined;
  const recPath = folder && path.join(folder, 'record.json');
  const record = recPath && fs.existsSync(recPath) ? JSON.parse(fs.readFileSync(recPath, 'utf-8').replace(/^﻿/, '')) : undefined;
  const tPath = folder && path.join(folder, 'log', 'transcript.log');
  const transcript = tPath && fs.existsSync(tPath) ? fs.readFileSync(tPath, 'utf-8') : '';
  return { status: r.status, out, folder, record, transcript };
}
const show = (r: Run) => console.log(r.out.trim().split('\n').filter((l) => /\[v4\]|ERROR|GATE|FAIL/.test(l)).map((l) => `    ${l.trim()}`).join('\n'));
const gate = (file: string, stage: number, exp: Exp) => applyFile(file, { readOnly: true, vars: {
  stage: String(stage), expect_guidelines: exp.guidelines, expect_changelog: exp.changelog, expect_staged: exp.staged, expect_editors: exp.editors, expect_holds: exp.holds } });

try {
  console.log('\n[1] Dry run and refusals: nothing is sent');
  await fresh();
  const v3Defs = keyDefs();
  const base = schemaFp();
  {
    const r = run({ mode: 'dry' });
    eq('dry run exits 0', r.status, 0);
    check('dry run shows the migration\'s full hash and says nothing was sent', r.out.includes('8c775bf8aab61b7235be7d911c8e6aa3eb310130f0e479bad590e3c1ab1e45a5') && /DRY RUN: nothing was sent/.test(r.out));
    check('dry run creates no record folder', r.folder === undefined);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-v4-src-'));
    for (const rel of ['supabase/migrations/20261104_url_key_unreserved_decoding.sql', GATE, 'supabase/URL-KEY-V4-ROLLBACK.sql']) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(path.join(REPO, rel), path.join(tmp, rel));
    }
    fs.appendFileSync(path.join(tmp, 'supabase/migrations/20261104_url_key_unreserved_decoding.sql'), '\n');
    const t = run({ sourceRoot: tmp });
    check('a migration differing by one byte is refused (exit 2)', t.status === 2 && /has sha256 .* the recorded value is/.test(t.out), t.out.slice(-300));
    fs.rmSync(tmp, { recursive: true, force: true });
    check('-Apply without -ConfirmMigration <exact name> is refused (exit 2)', run({ confirmMigration: '20261104' }).status === 2);
    check('a remote host with -Credential is refused (exit 2)', /-Credential is for the local rehearsal only/.test(run({ host: 'aws-0-eu-central-1.pooler.supabase.com', port: 5432, ssl: 'require' }).out));
    check('a remote host with the wrong user is refused (exit 2)', /is not postgres\.xutjahmbyrvifcltpxxu/.test(run({ host: 'aws-0-eu-central-1.pooler.supabase.com', credential: false, user: 'postgres.other', ssl: 'require', port: 5432 }).out));
    check('two modes at once are refused (exit 2)', run({ extra: '-Inspect' }).status === 2);
  }
  eq('schema unchanged by the dry run and refusals', schemaFp(), base);

  console.log('\n[1b] Local-host classification is exact (Codex P2 on #323): prefixes and malformed IPv4 take the REMOTE path');
  {
    const PROD = 'aws-0-eu-central-1.pooler.supabase.com';
    // LOCAL: -Credential is accepted and the dry run completes (exit 0).
    for (const h of ['localhost', 'LOCALHOST', 'host.docker.internal', 'Host.Docker.Internal', '127.0.0.1', '127.1.2.3', '127.255.255.254', '127.0.0.0']) {
      const r = run({ mode: 'dry', host: h });
      check(`local: ${JSON.stringify(h)} is local (dry run exit 0 with -Credential)`, r.status === 0 && /DRY RUN: nothing was sent/.test(r.out) && r.folder === undefined, r.out.slice(-200));
    }
    // NOT LOCAL: name prefixes, suffixes, malformed or non-loopback IPv4, other loopback spellings, trailing newline.
    const notLocal = [
      'localhost.prod.example', '127.attacker.example', 'localhost.example.com', '127.0.0.1.attacker.example',
      'host.docker.internal.evil', 'xlocalhost', 'localhost.', 'local-host',
      '127.0.0', '127.0.0.256', '127.0.0.1.', '127.00.0.1', '127.0.0.01', '0127.0.0.1', '127.0.0.-1', '128.0.0.1', '127..0.1', '::1',
      'localhost\n', '127.0.0.1\n', ' 127.0.0.1',
    ];
    for (const h of notLocal) {
      // With -Credential: refused as remote, before any connection, no record folder.
      const withCred = run({ mode: 'dry', host: h });
      check(`not local: ${JSON.stringify(h)} with -Credential is refused as remote (exit 2)`,
        withCred.status === 2 && /-Credential is for the local rehearsal only/.test(withCred.out) && withCred.folder === undefined, withCred.out.slice(-200));
      // Without -Credential and with every other remote input valid: refused by the pooler-host check.
      const noCred = run({ mode: 'dry', host: h, credential: false, ssl: 'require', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' });
      check(`not local: ${JSON.stringify(h)} without -Credential is refused by the remote host check (exit 2)`,
        noCred.status === 2 && /is not the eu-central-1 session pooler/.test(noCred.out) && noCred.folder === undefined, noCred.out.slice(-200));
    }
    // -Apply against a prefixed host with a credential: refused before Docker, SQL, password use or a record folder.
    const ap = run({ host: 'localhost.prod.example' });
    check('-Apply to localhost.prod.example with -Credential: exit 2 before anything ran (no record folder, no SQL)',
      ap.status === 2 && /-Credential is for the local rehearsal only/.test(ap.out) && ap.folder === undefined && !/sending|psql:|GATE/.test(ap.out));
    check('…and the credential is never echoed', !/ConvertTo-SecureString|PGPASSWORD=/.test(ap.out));
    // The documented production host still takes the remote path and passes it (dry run).
    const prod = run({ mode: 'dry', host: PROD, credential: false, ssl: 'require', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' });
    check('documented production host: remote path, dry run exit 0, project named', prod.status === 0 && /project xutjahmbyrvifcltpxxu/.test(prod.out) && prod.folder === undefined, prod.out.slice(-300));
    check('…and with -Credential it is refused (exit 2)', run({ mode: 'dry', host: PROD, ssl: 'require', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' }).status === 2);
    check('…and a trailing newline after it is refused', run({ mode: 'dry', host: `${PROD}\n`, credential: false, ssl: 'require', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' }).status === 2);
    check('…remote safeguards intact: sslmode disable refused', /needs -SslMode require/.test(run({ mode: 'dry', host: PROD, credential: false, ssl: 'disable', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' }).out));
    check('…remote safeguards intact: port 6543 refused', /SESSION pooler \(port 5432\)/.test(run({ mode: 'dry', host: PROD, credential: false, ssl: 'require', port: 6543, user: 'postgres.xutjahmbyrvifcltpxxu' }).out));
    check('…remote safeguards intact: -Apply without -ConfirmProject refused', /needs -ConfirmProject xutjahmbyrvifcltpxxu/.test(run({ host: PROD, credential: false, ssl: 'require', port: 5432, user: 'postgres.xutjahmbyrvifcltpxxu' }).out));
  }
  eq('schema unchanged by the host-classification checks', schemaFp(), base);

  console.log('\n[2] The gate\'s "unreserved escape" pattern matches exactly the 66 bytes v4 decodes');
  {
    const gateSql = fs.readFileSync(path.join(REPO, GATE), 'utf-8');
    const pat = gateSql.match(/c_unres constant text := '([^']+)'/)?.[1] ?? '';
    const sqlHits = JSON.parse(q(`select jsonb_agg(b order by b) from generate_series(0, 255) b where ('x%' || lpad(to_hex(b), 2, '0') || 'y') ~ '${pat}'`)) as number[];
    const tsHits = Array.from({ length: 256 }, (_, b) => b).filter((b) => /^[A-Za-z0-9\-._~]$/.test(String.fromCharCode(b)));
    eq('SQL pattern hits == TS unreserved set (66 bytes)', [sqlHits.length, sqlHits], [tsHits.length, tsHits]);
    const lower = JSON.parse(q(`select jsonb_agg(b order by b) from generate_series(0, 255) b where ('x%' || lower(lpad(to_hex(b), 2, '0')) || 'y') ~ '${pat}'`)) as number[];
    eq('…in lower-case hex too', lower, tsHits);
  }

  console.log('\n[3] Unexpected persisted keys: refused by gate 0 before anything is sent');
  {
    q(`insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason) values ('v4-affected', 'BOA', 'affected', '[]', '${BOA}', 'NEW_GUIDELINE');`);
    const r = run();
    show(r);
    check('queue row with an unreserved escape: exit 10 (PREFLIGHT REFUSED), V07 FAIL, nothing sent', r.status === 10 && /PREFLIGHT REFUSED/.test(r.transcript) && /FAIL V07/.test(r.transcript) && !/sending 20261104/.test(r.transcript), r.transcript.slice(-400));
    eq('…schema unchanged', schemaFp(), base);
    q(`delete from public.staged_guidelines where candidate_id = 'v4-affected';`);
    q(`insert into public.discovery_staging_holds (match_key, status, reason, held_since) values ('https://example.org/held%2ddoc', 'pending-editorial-decision', 'v4 rehearsal', current_date);`);
    const h = run();
    check('hold with an unreserved escape: exit 10, V07 FAIL, nothing sent', h.status === 10 && /FAIL V07/.test(h.transcript) && !/sending 20261104/.test(h.transcript));
    eq('…schema unchanged', schemaFp(), base);
    q(`delete from public.discovery_staging_holds where reason = 'v4 rehearsal';`);
  }

  console.log('\n[4] Catalogue collision: gate 0 passes, the MIGRATION refuses, nothing committed (verified by gate 0)');
  {
    const g = (id: string, url: string) => q(`insert into public.guidelines (id, section, type, topic, source, status, versions)
      values ('${id}', 'Trauma', 'Guideline', 'v4 ${id}', 'BOA', 'Live', '[{"label":"current","url":"${url}"}]'::jsonb);`);
    g('v4-cat-a', 'https://www.boa.ac.uk/asset/AB%2DCD');
    g('v4-cat-b', 'https://www.boa.ac.uk/asset/AB-CD/');
    const r = run();
    show(r);
    check('exit 11: migration refused, gate 0 re-passes (nothing committed)', r.status === 11 && /would newly share a document key/.test(r.transcript) && /v4-cat-a \/ v4-cat-b/.test(r.transcript), r.transcript.slice(-500));
    eq('…key functions and schema unchanged', [keyDefs(), schemaFp()], [v3Defs, base]);
    q(`delete from public.guidelines where id like 'v4-cat-%';`);
  }

  console.log('\n[4b] Migration COMMITS but post-verification fails (exit 12): reported as committed, NOT reversed');
  {
    // Local-only injection: an event trigger adds a hold inside the migration's own
    // transaction, so the migration commits and gate 1's holds check (V34) then fails.
    asAdmin(`create schema if not exists rehearsal;
      create or replace function rehearsal.inject_hold() returns event_trigger language plpgsql as $f$
      begin
        insert into public.discovery_staging_holds (match_key, status, reason, held_since)
        values ('https://example.org/injected-hold', 'pending-editorial-decision', 'v4 rehearsal injected', current_date)
        on conflict (match_key) do nothing;
      end $f$;
      create event trigger rehearsal_inject_hold on ddl_command_end when tag in ('COMMENT') execute function rehearsal.inject_hold();`);
    const e0 = expectations();
    const r = run({ exp: e0 });
    asAdmin('drop event trigger if exists rehearsal_inject_hold; drop schema if exists rehearsal cascade;');
    show(r);
    check('exit 12, worded as COMMITTED and NOT reversed', r.status === 12 && /COMMITTED \(COMMIT acknowledged\)/.test(r.transcript) && /NOT reversed/.test(r.transcript), r.transcript.slice(-300));
    check('…and it really is committed: decoder present, v4 comments', q(`select to_regprocedure('public._url_decode_unreserved(text)') is not null
      and obj_description('public.document_identity_key(text)'::regprocedure, 'pg_proc') like '[url-key v4 %'`) === 't');
    eq('…record.json says so', r.record?.outcome, 'the step COMMITTED but the after-gate failed; NOT reversed; run -Inspect and stop');
    eq('-Inspect with the original expectations reports 49 (state unknown: holds differ)', run({ mode: 'inspect', exp: e0 }).status, 49);
    q(`delete from public.discovery_staging_holds where reason = 'v4 rehearsal injected';`);
    eq('after removing the injected hold, -Inspect reports 41 (v4)', run({ mode: 'inspect', exp: e0 }).status, 41);
    eq('back to v3 for the next steps with the tested -Rollback (exit 0)', run({ mode: 'rollback', exp: e0 }).status, 0);
    eq('…key functions byte-identical to 20261024 again', keyDefs(), v3Defs);
  }

  console.log('\n[5] Success: gate 0 → 20261104 → gate 1; content and links unchanged');
  const exp = expectations();
  const data0 = dataFp();
  let v4Defs = '';
  {
    const r = run({ exp });
    show(r);
    eq('exit 0', r.status, 0);
    eq('steps in order', (r.record?.steps as string[] | undefined)?.map((s) => s.split('\t')[1]),
      ['sha256', 'sha256', 'sha256', 'gate0', 'apply', 'apply', 'gate1', 'RESULT']);
    check('two gates passed', (r.transcript.match(/GATE PASSED/g) ?? []).length === 2);
    eq('catalogue (every column), source links and changelog unchanged', dataFp(), data0);
    eq('the unaffected queue row kept its stored keys', q(`select identity_key || ' ' || match_key from public.staged_guidelines where candidate_id = 'v4-plain'`),
      'https://example.org/Plain-Doc.pdf https://example.org/plain-doc.pdf');
    check('record and transcript hold no password', !JSON.stringify(r.record).includes('PGPASSWORD=') && !/password\s*[:=]\s*postgres/i.test(r.transcript));
    eq('migration history untouched (no 20261104 entry, or no ledger at all locally)',
      q(`select case when to_regclass('supabase_migrations.schema_migrations') is null then 0
                else (xpath('/row/c/text()', query_to_xml($m$select count(*) as c from supabase_migrations.schema_migrations where version like '20261104%'$m$, false, true, '')))[1]::text::int end`), '0');
    v4Defs = keyDefs();
    const vec = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/tests/fixtures/url-key-vectors.json'), 'utf-8')).vectors as Array<{ why: string; input: string; match: string; identity: string }>;
    const lit = `$v$${JSON.stringify(vec.map((v) => v.input))}$v$`;
    const sql = JSON.parse(q(`select jsonb_agg(jsonb_build_array(public.document_identity_key(u), public.document_match_key(u)) order by n) from jsonb_array_elements_text(${lit}::jsonb) with ordinality t(u, n)`)) as Array<[string, string]>;
    eq(`TS == SQL == pinned on all ${vec.length} vectors after the procedure`, vec.filter((v, i) => sql[i][0] !== v.identity || sql[i][1] !== v.match || documentIdentityKey(v.input) !== v.identity || normaliseCandidateUrl(v.input) !== v.match).map((v) => v.why), []);
  }

  console.log('\n[6] Repeat execution, inspect, and the gates after v4');
  {
    const again = run({ exp });
    check('re-running -Apply: exit 14 (already v4), nothing sent', again.status === 14 && /already in the target state/.test(again.transcript) && !/sending 20261104/.test(again.transcript), again.transcript.slice(-300));
    eq('…record.json distinguishes it from a preflight refusal', again.record?.outcome, 'already in the target state; nothing sent');
    eq('…key functions unchanged by the refused repeat', keyDefs(), v4Defs);
    eq('-Inspect reports 41 (v4)', run({ mode: 'inspect', exp }).status, 41);
    eq('v4 gate stage 1 passes directly', gate(GATE, 1, exp).status, 0);
    const old = gate(OLD_GATE, 2, { ...exp });
    check('old review-queue gate (stage 2) fails ONLY at G19 after v4, as documented', old.status === 3 && /FAIL G19/.test(old.err) && (old.err.match(/NOTICE:\s+FAIL/g) ?? []).length === 1, old.err.split('\n').filter((l) => /FAIL/.test(l)).join(' | '));
  }

  console.log('\n[7] Rollback: refused while a row filed under v4 depends on v4; then succeeds and restores v3 exactly');
  {
    q(`insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason) values ('v4-filed', 'BOA', 'filed under v4', '[]', '${BOA}', 'NEW_GUIDELINE');`);
    const e2 = expectations();
    const r = run({ mode: 'rollback', exp: e2 });
    show(r);
    check('rollback with a v4-keyed row: exit 11, refused, gate 1 re-passes (v4 intact)', r.status === 11 && /queue rows filed under v4 would change key under v3/.test(r.transcript), r.transcript.slice(-400));
    eq('…key functions still v4', keyDefs(), v4Defs);
    q(`delete from public.staged_guidelines where candidate_id = 'v4-filed';`);
    const ok = run({ mode: 'rollback', exp });
    show(ok);
    eq('rollback: exit 0', ok.status, 0);
    eq('key functions and comments byte-identical to the 20261024 originals; decoder gone', keyDefs(), v3Defs);
    eq('schema identical to before the procedure', schemaFp(), base);
    eq('catalogue, links and changelog unchanged', dataFp(), data0);
    eq('-Inspect reports 40 (v3)', run({ mode: 'inspect', exp }).status, 40);
    const rb2 = run({ mode: 'rollback', exp });
    check('-Rollback on a v3 database: exit 14 (already v3), nothing sent', rb2.status === 14 && !/sending URL-KEY-V4-ROLLBACK/.test(rb2.transcript));
    eq('old review-queue gate (stage 2) passes again, G19 included', gate(OLD_GATE, 2, exp).status, 0);
    const re = run({ exp });
    eq('re-apply after rollback: exit 0 (round trip)', re.status, 0);
    eq('…v4 definitions identical to the first application', keyDefs(), v4Defs);
  }

  console.log('\n[8] Backup of the UPGRADED database (review-queue objects present) and restore-verify');
  {
    const sid = q(`select id from public.staged_guidelines where candidate_id = 'v4-plain'`);
    q(`insert into public.staged_discovery_decisions (staged_id, action, from_status, to_status, note, decided_by)
         values ('${sid}', 'defer', 'pending', 'deferred', 'v4 rehearsal decision', gen_random_uuid());`);
    const bdest = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-v4-backup-'));
    const ps = `& { $c = New-Object System.Management.Automation.PSCredential('postgres', (ConvertTo-SecureString 'postgres' -AsPlainText -Force)); & '${path.join(REPO, 'scripts/backup/Backup-Public.ps1')}' -PoolerHost host.docker.internal -Port 54322 -DbUser postgres -SslMode disable -Destination '${bdest}' -Credential $c -AcceptUnverifiedEncryption; exit $LASTEXITCODE }`;
    const bk = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf-8' });
    eq('backup exit 0', bk.status, 0);
    const folder = path.join(bdest, fs.readdirSync(bdest).filter((d) => d.startsWith('public-')).sort().pop()!);
    const fpTxt = fs.readFileSync(path.join(folder, 'source-fingerprint.txt'), 'utf-8');
    for (const t of ['staged_discovery_evidence', 'staged_discovery_decisions', 'discovery_staging_holds']) {
      check(`backup fingerprint covers ${t} (rows, columns, RLS)`, new RegExp(`^rows\\.${t}\\|`, 'm').test(fpTxt) && new RegExp(`^columns\\.${t}\\|`, 'm').test(fpTxt) && new RegExp(`^rls\\.${t}\\|true`, 'm').test(fpTxt));
    }
    check('backup fingerprint covers the v4 key functions and the decoder', /^function\._url_decode_unreserved\(p_url text\)\|/m.test(fpTxt) && /^function\.document_identity_key\(p_url text\)\|/m.test(fpTxt));
    check('…and the decision just recorded (1 row)', /^rows\.staged_discovery_decisions\|1:/m.test(fpTxt));
    const toc = fs.readFileSync(path.join(folder, 'public.toc.txt'), 'utf-8');
    check('dump contains the append-only triggers and the one-open-row index', /staged_discovery_decisions_no_update_delete/.test(toc) && /staged_guidelines_one_open_per_document/.test(toc));
    const TSX = path.join(REPO, 'node_modules/tsx/dist/cli.mjs');
    const rv = spawnSync(process.execPath, [TSX, path.join(REPO, 'scripts/backup/restore-verify.ts'), folder], { cwd: REPO, encoding: 'utf-8' });
    console.log(rv.stdout.trim().split('\n').filter((l) => /MATCH|differences|left behind|restoring/.test(l)).map((l) => `    ${l}`).join('\n'));
    check('restore-verify: MATCH, 0 differences (disposable stack removed afterwards)', rv.status === 0 && /differences: 0/.test(rv.stdout) && /MATCH/.test(rv.stdout), rv.stdout.slice(-600));
    fs.rmSync(bdest, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(DEST, { recursive: true, force: true });
}
const { pass, fail } = counts();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
