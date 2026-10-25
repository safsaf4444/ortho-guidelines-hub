/**
 * scripts/backup/restore-verify.ts
 * ────────────────────────────────
 * Restores a backup made by Backup-Public.ps1 into the DISPOSABLE local
 * Supabase (scripts/tests/local-supabase, project ortho-disc-test, loopback
 * only), and proves the restored copy equals the SOURCE SNAPSHOT: the same
 * fingerprint.sql, run on the restored copy, must match source-fingerprint.txt
 * line for line ("info." lines excepted).
 *
 *   npx tsx scripts/backup/restore-verify.ts <backup folder> [--keep-stack]
 *
 * Why a local Supabase, not plain postgres: the dump's policies, grants and
 * functions name Supabase roles (anon, authenticated, service_role) and call
 * auth.uid(). Those exist only in a Supabase database. Before restoring, this
 * script derives every role and schema the dump needs FROM THE DUMP and
 * refuses if the target lacks any.
 *
 * Never touches the backup files: their hashes are checked against
 * manifest.json before and after. Writes one new file, restore-check-<utc>.json,
 * into the folder. At the end the disposable database is removed
 * (`supabase stop --no-backup`), unless --keep-stack.
 * Exit: 0 = restored copy matches the snapshot; 1 = mismatch or failure.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINER, freshDatabase, localEnv, psql, stopStack } from '../tests/local-supabase/stack';

const args = process.argv.slice(2);
const keep = args.includes('--keep-stack');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('Usage: npx tsx scripts/backup/restore-verify.ts <backup folder> [--keep-stack]'); process.exit(2); }
const folder = path.resolve(dir);
const report: Record<string, unknown> = { folder, startedUtc: new Date().toISOString(), target: `${CONTAINER} (disposable local Supabase)` };
const problems: string[] = [];
const say = (s: string) => console.log(`[restore-verify] ${s}`);

function sha256(f: string) { return createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
function checkHashes(label: string): boolean {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf-8').replace(/^﻿/, '')) as { files: Array<{ name: string; sha256: string }> };
  const bad = manifest.files.filter((f) => !fs.existsSync(path.join(folder, f.name)) || sha256(path.join(folder, f.name)) !== f.sha256.toLowerCase());
  if (bad.length > 0) problems.push(`${label}: hash mismatch or missing: ${bad.map((b) => b.name).join(', ')}`);
  say(`${label}: ${manifest.files.length - bad.length}/${manifest.files.length} backup files match manifest.json`);
  return bad.length === 0;
}
const parseFingerprint = (text: string) => new Map(text.split(/\r?\n/).filter((l) => l.includes('|') && !l.startsWith('info.'))
  .map((l) => [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)] as [string, string]));
const docker = (a: string[], input?: string) => spawnSync('docker', a, { encoding: 'utf-8', input, maxBuffer: 1 << 28 });

let exit = 1;
try {
  for (const f of ['manifest.json', 'public.dump', 'source-fingerprint.txt']) {
    if (!fs.existsSync(path.join(folder, f))) throw new Error(`${f} missing in ${folder}`);
  }
  if (fs.existsSync(path.join(folder, 'FAILED.txt'))) throw new Error('this folder is a FAILED backup');
  if (!checkHashes('before')) throw new Error('backup files do not match their manifest; not restoring');

  say('starting / resetting the disposable local Supabase (ortho-disc-test)');
  freshDatabase();
  const env = localEnv();                                   // refuses a non-loopback stack
  report.localApi = env.url;

  // Copy the dump into the disposable database container.
  const inside = '/tmp/restore-public.dump';
  const cp = docker(['cp', path.join(folder, 'public.dump'), `${CONTAINER}:${inside}`]);
  if (cp.status !== 0) throw new Error(`docker cp failed: ${cp.stderr}`);

  // What the dump needs, read from the dump itself.
  const sql = docker(['exec', CONTAINER, 'pg_restore', '-f', '-', inside]);
  if (sql.status !== 0) throw new Error(`pg_restore -f - failed: ${sql.stderr}`);
  // Roles appear only in these statement forms. (COPY ... FROM stdin is not a role.)
  const roleRefs = new Set<string>();
  const addList = (list: string) => { for (const r of list.split(',')) roleRefs.add(r.trim().replace(/"/g, '')); };
  for (const line of sql.stdout.split(/\r?\n/)) {
    let m = line.match(/^ALTER .* OWNER TO ("?[A-Za-z_][\w]*"?);$/);
    if (m) { addList(m[1]); continue; }
    m = line.match(/^GRANT .* TO (.+?)( WITH GRANT OPTION)?;$/);
    if (m) { addList(m[1]); continue; }
    m = line.match(/^REVOKE .* FROM (.+);$/);
    if (m) { addList(m[1]); continue; }
  }
  for (const m of sql.stdout.matchAll(/CREATE POLICY [\s\S]*? TO ([A-Za-z_][\w, ]*?)\s*(?:USING|WITH CHECK|;)/g)) addList(m[1]);
  roleRefs.delete('PUBLIC'); roleRefs.delete('public'); roleRefs.delete('');
  const schemaRefs = new Set([...sql.stdout.matchAll(/\b(auth|extensions|storage|vault|realtime|graphql)\.[a-z_]+/g)].map((m) => m[1]));
  const roles = [...roleRefs].sort();
  const haveRoles = psql(`select string_agg(rolname, ',') from pg_roles where rolname = any (array[${roles.map((r) => `'${r}'`).join(',')}]::text[])`).out.split(',').filter(Boolean);
  const missingRoles = roles.filter((r) => !haveRoles.includes(r));
  const haveSchemas = psql(`select string_agg(nspname, ',') from pg_namespace where nspname = any (array[${[...schemaRefs].map((s) => `'${s}'`).join(',') || "''"}]::text[])`).out.split(',').filter(Boolean);
  const missingSchemas = [...schemaRefs].filter((s) => !haveSchemas.includes(s));
  const authUid = psql(`select to_regprocedure('auth.uid()') is not null`).out === 't';
  report.requirements = { roles, schemas: [...schemaRefs].sort(), missingRoles, missingSchemas, authUid };
  say(`dump needs roles [${roles.join(', ')}], schemas [${[...schemaRefs].join(', ')}]; target has auth.uid(): ${authUid}`);
  if (missingRoles.length || missingSchemas.length || (schemaRefs.has('auth') && !authUid)) {
    throw new Error(`the target lacks ${[...missingRoles.map((r) => `role ${r}`), ...missingSchemas.map((s) => `schema ${s}`)].join(', ') || 'auth.uid()'}; not restoring`);
  }

  // Restore INTO the target's existing `public` schema, skipping only the
  // dump's "CREATE SCHEMA public" entry. Re-creating the schema instead loses
  // its initial privileges (e.g. USAGE for PUBLIC), which pg_dump does not
  // emit because a real database already has them. The schema's comment and
  // grants still restore from the dump.
  const empty = psql(`select count(*) from pg_class where relnamespace = 'public'::regnamespace`).out;
  if (empty !== '0') throw new Error(`the disposable target's public schema is not empty (${empty} relations); not restoring`);
  const listFile = '/tmp/restore-public.list';
  const list = docker(['exec', CONTAINER, 'sh', '-c', `pg_restore --list ${inside} | grep -vE '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > ${listFile}; grep -cE 'SCHEMA - public ' ${listFile} || true`]);
  if (list.status !== 0) throw new Error(`could not build the restore list: ${list.stderr}`);
  report.skippedTocEntries = ['SCHEMA - public (the target keeps its own schema and initial privileges)'];
  // Clear the target's OWN default privileges in schema public first. A local
  // Supabase grants EXECUTE on new functions to anon (and more) by default;
  // pg_dump lists only grants that differ from Postgres's built-in defaults,
  // so without this the restored functions would gain grants production does
  // not have (seen in the rehearsal: anon EXECUTE on the DEFINER functions).
  // The dump re-creates production's own default privileges at the end.
  const clear = docker(['exec', '-i', CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], `
do $$ declare r record; begin
  for r in select pg_get_userbyid(defaclrole) as role, defaclobjtype as t from pg_default_acl where defaclnamespace = 'public'::regnamespace loop
    execute format('alter default privileges for role %I in schema public revoke all on %s from public, anon, authenticated, service_role, postgres',
                   r.role, case r.t when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' end);
  end loop;
end $$;
select coalesce(sum(cardinality(defaclacl)), 0) from pg_default_acl where defaclnamespace = 'public'::regnamespace;
`);
  if (clear.status !== 0) throw new Error(`could not clear the target's default privileges: ${clear.stderr}`);
  report.targetDefaultPrivilegesCleared = { remainingEntries: Number(clear.stdout.trim()) };
  if (clear.stdout.trim() !== '0') throw new Error(`the target still has default privileges in public (${clear.stdout.trim()}); not restoring`);

  // As supabase_admin, the local stack's superuser: the dump re-creates
  // Supabase's default privileges FOR ROLE supabase_admin in schema public,
  // which postgres may not do. (Seen in the rehearsal; plain postgres fails.)
  say('restoring as supabase_admin (single transaction, stop on first error)');
  const restore = docker(['exec', CONTAINER, 'pg_restore', '-U', 'supabase_admin', '-d', 'postgres', '--exit-on-error', '--single-transaction', '-L', listFile, inside]);
  report.restore = { status: restore.status, stderr: restore.stderr.trim().slice(0, 4000) };
  if (restore.status !== 0) throw new Error(`pg_restore failed: ${restore.stderr.trim().slice(0, 1500)}`);

  // Fingerprint the restored copy, read-only, with the SAME file.
  const fpSql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fingerprint.sql'), 'utf-8');
  const fp = psql(`begin transaction read only;\n${fpSql}\nrollback;\n`);
  if (fp.status !== 0) throw new Error(`fingerprint on the restored copy failed: ${fp.err}`);
  const source = parseFingerprint(fs.readFileSync(path.join(folder, 'source-fingerprint.txt'), 'utf-8'));
  const restored = parseFingerprint(fp.out);
  const keys = [...new Set([...source.keys(), ...restored.keys()])].sort();
  const diffs = keys.filter((k) => source.get(k) !== restored.get(k))
    .map((k) => ({ key: k, source: source.get(k) ?? '(absent)', restored: restored.get(k) ?? '(absent)' }));
  report.compared = keys.length;
  report.differences = diffs;
  report.rowCounts = Object.fromEntries([...source].filter(([k]) => k.startsWith('rows.')).map(([k, v]) => [k.slice(5), v.split(':')[0]]));
  say(`compared ${keys.length} fingerprint lines; differences: ${diffs.length}`);
  for (const d of diffs) say(`  DIFF ${d.key}: source ${d.source} | restored ${d.restored}`);
  if (diffs.length > 0) problems.push(`${diffs.length} fingerprint difference(s)`);
  if (source.size === 0) problems.push('the source fingerprint is empty');
} catch (e) {
  problems.push(e instanceof Error ? e.message : String(e));
} finally {
  if (!keep) {
    const left = stopStack();
    report.cleanup = { ...left, note: 'disposable local database removed (supabase stop --no-backup)' };
    say(`disposable database removed; left behind: ${left.containers} containers, ${left.volumes} volumes, ${left.networks} networks`);
  } else {
    report.cleanup = 'kept (--keep-stack)';
  }
  checkHashes('after');
  report.problems = problems;
  report.result = problems.length === 0 ? 'MATCH: the restored copy equals the source snapshot' : 'FAILED';
  const finished = new Date().toISOString();
  report.finishedUtc = finished;
  const out = path.join(folder, `restore-check-${finished.replace(/[-:.]/g, '')}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  say(`${report.result}${problems.length ? `: ${problems.join('; ')}` : ''}`);
  say(`report: ${out}`);
  exit = problems.length === 0 ? 0 : 1;
}
process.exitCode = exit;
