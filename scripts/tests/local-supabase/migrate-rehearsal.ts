/**
 * scripts/tests/local-supabase/migrate-rehearsal.ts
 * ─────────────────────────────────────────────────
 * Rehearses scripts/deploy/Apply-Migrations-Psql.ps1 end to end against the
 * disposable LOCAL Supabase: the same script, image, psql invocation, files and
 * gates as production; only the host (host.docker.internal:54322), the local
 * credential and sslmode differ. Run it through run.ts
 * (`npx tsx scripts/tests/local-supabase/run.ts migrate`). Windows only.
 *
 * Failures INSIDE each migration's BEGIN … COMMIT are injected locally with an
 * event trigger (schema `rehearsal`, never in production) that raises at the
 * LAST GRANT before COMMIT: everything else in the file has already run, so
 * "nothing committed" is the strongest claim the rollback has to meet.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { applyFile, M24, makeChecks, prepareSchema, psql, REPO, requireLoopbackEnv } from './stack';

const ENV = requireLoopbackEnv();
if (process.platform !== 'win32') { console.log('Windows only (PowerShell wrapper).'); process.exit(0); }

const { check, eq, counts } = makeChecks();
const SCRIPT = path.join(REPO, 'scripts/deploy/Apply-Migrations-Psql.ps1');
const GATE = 'supabase/POST-MIGRATION-GATE-READONLY.sql';
const DEST = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-migrate-rehearsal-'));

const q = (sql: string) => { const r = psql(sql); if (r.status !== 0) throw new Error(`psql: ${r.err}`); return r.out; };
const asAdmin = (sql: string) => {
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_ortho-disc-test', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`psql (supabase_admin): ${r.stderr}`);
};
const dataFp = () => q(`select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g`);
const changelogFp = () => q(`select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c`);
const schemaFp = () => q(`select md5(coalesce((select string_agg(table_name||'.'||column_name||':'||data_type, ',' order by table_name, column_name)
      from information_schema.columns where table_schema='public'),'') ||
    coalesce((select string_agg(conrelid::regclass||'.'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname)
      from pg_constraint where connamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(oid::regprocedure||':'||md5(prosrc)||':'||coalesce(array_to_string(proacl,','),'-'), ',' order by oid::regprocedure::text)
      from pg_proc where pronamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(indexname||':'||indexdef, ',' order by indexname) from pg_indexes where schemaname='public'),'') ||
    coalesce((select string_agg(relname||':'||coalesce(array_to_string(relacl,','),'-')||':'||relrowsecurity, ',' order by relname)
      from pg_class where relnamespace='public'::regnamespace),'') ||
    coalesce((select string_agg(polrelid::regclass||'.'||polname, ',' order by 1) from pg_policy),'') ||
    coalesce((select string_agg(tgrelid::regclass||'.'||tgname, ',' order by tgrelid::regclass::text, tgname)
      from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),''))`);

// Production-shaped: the full catalogue, some changelog, one open queue row.
async function seed() {
  const service = createClient(ENV.url, ENV.serviceKey, { auth: { persistSession: false } });
  const rows = GUIDELINES_DATA.map(toDbRow);
  for (let i = 0; i < rows.length; i += 50) { const r = await service.from('guidelines').insert(rows.slice(i, i + 50)); if (r.error) throw new Error(r.error.message); }
  q(`insert into public.guideline_changelog (guideline_id, description) select id, 'Local rehearsal note ' || id from public.guidelines order by id limit 5;
     insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason)
       values ('mig-1','BOFAS','Migration rehearsal row','[]','https://example.org/Mig-1.pdf','NEW_GUIDELINE');`);
}
async function fresh(with24 = false) { prepareSchema({ with24, with25: false }); await seed(); }

function expectations() {
  return { guidelines: dataFp(), changelog: changelogFp(), staged: q('select count(*) from public.staged_guidelines'), editors: '1' };
}
interface Run { status: number | null; out: string; folder?: string; record?: Record<string, unknown>; transcript: string }
function run(opts: { apply?: boolean; inspect?: boolean; exp?: ReturnType<typeof expectations>; extra?: string; host?: string; credential?: boolean; sourceRoot?: string; user?: string; ssl?: string; port?: number } = {}): Run {
  const exp = opts.exp ?? expectations();
  const before = new Set(fs.readdirSync(DEST));
  const cred = opts.credential === false ? '' : `-Credential (New-Object System.Management.Automation.PSCredential('postgres', (ConvertTo-SecureString 'postgres' -AsPlainText -Force)))`;
  const ps = `& { & '${SCRIPT}' -PoolerHost '${opts.host ?? 'host.docker.internal'}' -Port ${opts.port ?? 54322} -DbUser '${opts.user ?? 'postgres'}' -SslMode ${opts.ssl ?? 'disable'} -RecordDir '${DEST}' ` +
    `-ExpectGuidelines '${exp.guidelines}' -ExpectChangelog '${exp.changelog}' -ExpectStaged ${exp.staged} -ExpectEditors ${exp.editors} ` +
    `${opts.inspect ? '-Inspect' : opts.apply === false ? '' : '-Apply'} ${cred} ${opts.sourceRoot ? `-SourceRoot '${opts.sourceRoot}'` : ''} ${opts.extra ?? ''}; exit $LASTEXITCODE }`;
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
const show = (r: Run) => console.log(r.out.trim().split('\n').filter((l) => /\[migrate\]|\[apply\]|ERROR|GATE/.test(l)).map((l) => `    ${l.trim()}`).join('\n'));
const gate = (stage: number, exp: ReturnType<typeof expectations>) => applyFile(GATE, { readOnly: true, vars: {
  stage: String(stage), expect_guidelines: exp.guidelines, expect_changelog: exp.changelog, expect_staged: exp.staged, expect_editors: exp.editors } });

// Fails the LAST GRANT of a migration, after everything else in it ran.
const INJECT = (cond: string, label: string) => `
  create schema if not exists rehearsal;
  create or replace function rehearsal.fail_late() returns event_trigger language plpgsql as $f$
  begin
    if tg_tag = 'GRANT' and (${cond}) then
      raise exception 'rehearsal: injected failure at the last GRANT of %', '${label}' using errcode = 'XX000';
    end if;
  end $f$;
  drop event trigger if exists rehearsal_fail_late;
  create event trigger rehearsal_fail_late on ddl_command_start execute function rehearsal.fail_late();`;
const UNINJECT = 'drop event trigger if exists rehearsal_fail_late; drop schema if exists rehearsal cascade;';
const M1_LATE = `coalesce(pg_get_functiondef(to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)')) like '%discovery-guards v1%', false)
                 and to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is null`;
const M2_LATE = `to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is not null`;

try {
  console.log('\n[1] Dry run and refusals: nothing is sent');
  await fresh();
  const base = schemaFp();
  check('seeded: 231 guidelines, 5 changelog rows, 1 open queue row', q(`select (select count(*) from public.guidelines)||'/'||(select count(*) from public.guideline_changelog)||'/'||(select count(*) from public.staged_guidelines)`) === '231/5/1');
  {
    const r = run({ apply: false });
    eq('dry run exits 0', r.status, 0);
    check('dry run says nothing was sent, and shows the three full hashes', /DRY RUN: nothing was sent/.test(r.out)
      && ['61ca5eab301a037a024bab5ae85084dcb46c9b00e38eefa00f2b84c4e20f3be1', 'a21ae5561ce588da64daf2b7df9eea52021185aec4302419024dabd23030e030'].every((h) => r.out.includes(h)));
    check('dry run creates no record folder', r.folder === undefined);
  }
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-migrate-src-'));
    for (const rel of [M24, 'supabase/migrations/20261025_reject_open_candidate.sql', GATE]) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
      fs.copyFileSync(path.join(REPO, rel), path.join(tmp, rel));
    }
    fs.appendFileSync(path.join(tmp, M24), '\n');
    const r = run({ sourceRoot: tmp });
    check('a migration file differing by one byte is refused (exit 2) before anything runs', r.status === 2 && /has sha256 .* the recorded value is/.test(r.out), r.out.slice(-300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  {
    const r = run({ host: 'aws-0-eu-central-1.pooler.supabase.com' });
    check('a remote host with -Credential is refused (exit 2), no connection', r.status === 2 && /-Credential is for the local rehearsal only/.test(r.out));
    const r2 = run({ host: 'aws-0-eu-central-1.pooler.supabase.com', credential: false, user: 'postgres.someotherref', ssl: 'require', port: 5432 });
    check('a remote host with the wrong user is refused (exit 2)', r2.status === 2 && /is not the|is not postgres\./.test(r2.out), r2.out.slice(-300));
  }
  eq('schema unchanged by the dry run and refusals', schemaFp(), base);

  console.log('\n[2] Wrong expectations: gate 0 refuses, nothing sent');
  {
    const exp = { ...expectations(), guidelines: `999:${'0'.repeat(32)}` };
    const r = run({ exp });
    show(r);
    eq('exit 10 (refused before sending anything)', r.status, 10);
    check('the transcript shows G30 FAIL', /FAIL G30/.test(r.transcript));
    eq('schema unchanged', schemaFp(), base);
  }

  console.log('\n[3] M1 fails at its LAST GRANT (inside BEGIN … COMMIT): nothing committed, verified by gate 0');
  {
    const exp = expectations();
    asAdmin(INJECT(M1_LATE, '20261024'));
    const r = run({ exp });
    asAdmin(UNINJECT);
    show(r);
    eq('exit 11 (M1 failed; gate 0 verifies nothing committed; M2 not sent)', r.status, 11);
    check('psql reported the injected error and exited 3', /injected failure at the last GRANT of 20261024/.test(r.transcript) && /M1: psql exit 3/.test(r.transcript));
    check('M2 was never sent', !/sending 20261025/.test(r.transcript));
    eq('schema byte-for-byte as before (fingerprint)', schemaFp(), base);
    eq('data unchanged', [dataFp(), changelogFp()], [exp.guidelines, exp.changelog]);
    eq('record.json carries the outcome', r.record?.outcome, 'M1 failed; verified nothing of it committed; M2 not sent');
  }

  console.log('\n[3b] A lock M1 needs is held elsewhere: lock_timeout (5 s, transaction-local) fails M1; nothing committed');
  {
    const exp = expectations();
    // Another session holds ACCESS SHARE on staged_guidelines; M1's ALTER TABLE needs ACCESS EXCLUSIVE.
    const holder = spawn('docker', ['exec', '-i', 'supabase_db_ortho-disc-test', 'psql', '-U', 'postgres', '-d', 'postgres', '-q']);
    holder.stdin.end('begin; lock table public.staged_guidelines in access share mode; select pg_sleep(60); commit;\n');
    await new Promise((r) => setTimeout(r, 1500));
    const t0 = Date.now();
    const r = run({ exp });
    const secs = (Date.now() - t0) / 1000;
    holder.kill();
    q(`select pg_terminate_backend(pid) from pg_stat_activity where query like '%pg_sleep(60)%' and pid <> pg_backend_pid()`);
    show(r);
    eq('exit 11 (M1 failed; gate 0 verifies nothing committed)', r.status, 11);
    check('the failure is the lock timeout, not a hang', /lock timeout/i.test(r.transcript), r.transcript.slice(-400));
    check(`the whole run ended promptly (${secs.toFixed(1)} s < 60 s)`, secs < 60);
    eq('schema byte-for-byte as before', schemaFp(), base);
    eq('the timeouts did not outlive the transaction (new session: lock_timeout, statement_timeout)', q('show lock_timeout; show statement_timeout').split('\n'), ['0', '0']);
  }

  console.log('\n[3c] -Inspect on the pre-upgrade database: read-only, reports state 40');
  {
    const r = run({ inspect: true });
    eq('exit 40 (gate 0 passes)', r.status, 40);
    check('inspect sent no migration', !/sending 2026102/.test(r.transcript));
    eq('schema unchanged', schemaFp(), base);
  }

  console.log('\n[4] M2 fails at its LAST GRANT: M1 committed, nothing of M2, verified by gate 1');
  let afterM1 = '';
  {
    const exp = expectations();
    asAdmin(INJECT(M2_LATE, '20261025'));
    const r = run({ exp });
    asAdmin(UNINJECT);
    show(r);
    eq('exit 21 (M2 failed; gate 1 verifies M1 committed and nothing of M2)', r.status, 21);
    check('gate 1 passed before M2 was sent', /gate1: passed[\s\S]*sending 20261025/.test(r.transcript));
    check('psql reported the injected error and exited 3', /injected failure at the last GRANT of 20261025/.test(r.transcript) && /M2: psql exit 3/.test(r.transcript));
    afterM1 = schemaFp();
    // Compare with a clean M24-only database: the M2 attempt left no trace.
    await fresh(true);
    eq('schema equals a clean 20261024-only database', schemaFp(), afterM1);
    const i = run({ inspect: true });
    eq('-Inspect reports 41 (20261024 committed, 20261025 not)', i.status, 41);
  }

  console.log('\n[5] Already-upgraded database: gate 0 refuses, nothing sent');
  {
    // (from [4]: 20261024 applied)
    const r = run();
    eq('exit 10', r.status, 10);
    check('G09 (pre-state) failed', /FAIL G09/.test(r.transcript));
    eq('schema unchanged', schemaFp(), afterM1);
  }

  console.log('\n[6] Success: gate 0 → M1 → gate 1 → M2 → gate 2');
  {
    await fresh();
    const exp = expectations();
    const r = run({ exp });
    show(r);
    eq('exit 0', r.status, 0);
    eq('steps in order', (r.record?.steps as string[] | undefined)?.map((s) => s.split('\t')[1]),
      ['sha256', 'sha256', 'sha256', 'gate0', 'M1', 'M1', 'gate1', 'M2', 'M2', 'gate2', 'RESULT']);
    check('three gates passed', (r.transcript.match(/GATE PASSED/g) ?? []).length === 3);
    eq('-Inspect reports 42 (final state)', run({ inspect: true, exp }).status, 42);
    eq('data unchanged', [dataFp(), changelogFp()], [exp.guidelines, exp.changelog]);
    check('record.json and the transcript hold no password', !JSON.stringify(r.record).includes('PGPASSWORD=') && !/password\s*[:=]\s*postgres/i.test(r.transcript));
    check('migration history not written (recorded as such)', r.record?.migrationHistory === 'NOT written by this route');
    check('every file in the run folder is read-only', fs.readdirSync(r.folder!, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile()).every((d) => (fs.statSync(path.join(d.parentPath, d.name)).mode & 0o200) === 0));

    console.log('\n[7] The gate catches drift after success (negative controls, then reverted)');
    q(`grant execute on function public.approve_staged_guideline(uuid,jsonb,text) to anon;`);
    const g1 = gate(2, exp);
    check('anon EXECUTE on approve → gate 2 FAILS at G16 (psql exit 3)', g1.status === 3 && /FAIL G16/.test(g1.err));
    q(`revoke execute on function public.approve_staged_guideline(uuid,jsonb,text) from anon;`);
    asAdmin(`alter table public.guidelines disable trigger user; update public.guidelines set topic = topic || ' ' where id = (select min(id) from public.guidelines);`);
    const g2 = gate(2, exp);
    check('one changed catalogue row → gate 2 FAILS at G30', g2.status === 3 && /FAIL G30/.test(g2.err));
    asAdmin(`update public.guidelines set topic = rtrim(topic) where id = (select min(id) from public.guidelines); alter table public.guidelines enable trigger user;`);
    eq('reverted: gate 2 passes again', gate(2, exp).status, 0);
  }
} finally {
  try { asAdmin(UNINJECT); } catch { /* stack may be gone */ }
  fs.rmSync(DEST, { recursive: true, force: true });
}

const { pass, fail } = counts();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
