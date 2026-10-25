// scripts/tests/local-supabase/backup-rehearsal.ts: rehearses scripts/backup end to end against the
// disposable stack (Windows: runs Backup-Public.ps1 via powershell.exe). No production contact.
// The local database password is the stack's public default (postgres), passed as a
// PSCredential for this LOCAL test only; Backup-Public.ps1 refuses -Credential for a remote host.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GUIDELINES_DATA } from '../../../src/data/guidelines-data';
import { toDbRow } from '../../../src/lib/guidelines-mapper';
import { CONTAINER, localEnv, makeChecks, prepareSchema, psql, REPO } from './stack';

// Outside the repo and OneDrive: Backup-Public.ps1 refuses both.
const DEST = process.argv[2] ?? path.join(os.tmpdir(), 'ortho-backup-rehearsal');
fs.mkdirSync(DEST, { recursive: true });
const { check, eq, counts } = makeChecks();
const q = (sql: string) => { const r = psql(sql); if (r.status !== 0) throw new Error(r.err); return r.out; };
const TSX = path.join(REPO, 'node_modules/tsx/dist/cli.mjs');
const restoreVerify = (folder: string) => spawnSync(process.execPath, [TSX, path.join(REPO, 'scripts/backup/restore-verify.ts'), folder], { cwd: REPO, encoding: 'utf-8' });

console.log('\n[1] A production-shaped local source');
prepareSchema({ with24: false, with25: false });
const env = localEnv();
const service = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });
const rows = GUIDELINES_DATA.map(toDbRow);
for (let i = 0; i < rows.length; i += 50) { const r = await service.from('guidelines').insert(rows.slice(i, i + 50)); if (r.error) throw new Error(r.error.message); }
const u = await service.auth.admin.createUser({ email: 'backup-editor@local.test', password: 'backup-Password1!', email_confirm: true });
q(q(`select pg_get_functiondef('public.is_editor()'::regprocedure)`).replace(/array\[[\s\S]*?\]/, `array['${u.data.user!.id}'::uuid]`) + ';');
q(`insert into public.guideline_changelog (guideline_id, description) select id, 'Local rehearsal note ' || id from public.guidelines order by id limit 5;
   insert into public.staged_guidelines (candidate_id, provider, topic, versions, primary_url, change_reason) values ('bk-1','BOFAS','Backup rehearsal row','[]','https://example.org/bk-1.pdf','NEW_GUIDELINE');
   create table public.guidelines_backup_20260713 as select * from public.guidelines order by id limit 171;
   alter table public.guidelines_backup_20260713 enable row level security;`);
check('source shaped like production: 231 guidelines, 171-row backup table', q(`select (select count(*) from public.guidelines)||'/'||(select count(*) from public.guidelines_backup_20260713)`) === '231/171');

console.log('\n[2] Backup while a writer keeps changing the source');
// Inserts a changelog row every 50 ms for ~15 s, each committed on its own.
const writer = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1']);
writer.stdin.end(`do $$ begin for i in 1..300 loop insert into public.guideline_changelog (guideline_id, description) values ('ankle-fracture', 'concurrent write ' || i); commit; perform pg_sleep(0.05); end loop; end $$;\n`);
const writerDone = new Promise<number>((r) => writer.on('close', (c) => r(c ?? -1)));
await new Promise((r) => setTimeout(r, 1500));
const before = Number(q('select count(*) from public.guideline_changelog'));
const ps = `& { $c = New-Object System.Management.Automation.PSCredential('postgres', (ConvertTo-SecureString 'postgres' -AsPlainText -Force)); & '${path.join(REPO, 'scripts/backup/Backup-Public.ps1')}' -PoolerHost host.docker.internal -Port 54322 -DbUser postgres -SslMode disable -Destination '${DEST}' -Credential $c -AcceptUnverifiedEncryption; exit $LASTEXITCODE }`;
const bk = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf-8' });
console.log(bk.stdout.trim().split('\n').map((l) => `    ${l}`).join('\n'));
if (bk.stderr.trim()) console.log(`    stderr: ${bk.stderr.trim().slice(0, 800)}`);
eq('backup exit 0', bk.status, 0);
const folder = path.join(DEST, fs.readdirSync(DEST).filter((d) => d.startsWith('public-')).sort().pop()!);
const after = Number(q('select count(*) from public.guideline_changelog'));
const wexit = await writerDone;
const finalLive = Number(q('select count(*) from public.guideline_changelog'));
const snapCount = Number(fs.readFileSync(path.join(folder, 'source-fingerprint.txt'), 'utf-8').match(/^rows\.guideline_changelog\|(\d+):/m)?.[1] ?? NaN);
console.log(`  info  changelog rows: live before backup ${before}, snapshot ${snapCount}, live right after ${after}, live final ${finalLive} (writer exit ${wexit})`);
check('the source really changed during the backup (live count moved past the snapshot)', after > snapCount && finalLive > snapCount);
check('the snapshot count lies between the before/after live counts', snapCount >= before && snapCount <= after);
const files = fs.readdirSync(folder).sort();
eq('backup folder contents', files, ['manifest.json', 'public.dump', 'public.toc.txt', 'snapshot-id.txt', 'source-fingerprint.txt']);
const man = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf-8').replace(/^﻿/, ''));
check('manifest records unverified encryption honestly', man.destinationEncryption === 'unverified' || String(man.destinationEncryption).startsWith('verified'), String(man.destinationEncryption));
check('files are read-only', files.every((f) => (fs.statSync(path.join(folder, f)).mode & 0o200) === 0));
const toc = fs.readFileSync(path.join(folder, 'public.toc.txt'), 'utf-8');
check('dump contains no auth schema objects', !/\bauth\b.*\b(TABLE|TABLE DATA)\b/.test(toc.split('\n').filter((l) => / auth /.test(l)).join('\n')));
check('the password is not in any backup file', files.every((f) => !fs.readFileSync(path.join(folder, f)).includes('PGPASSWORD=postgres')));

console.log('\n[3] Restore into the disposable stack and compare with the snapshot');
const rv = restoreVerify(folder);
console.log(rv.stdout.trim().split('\n').map((l) => `    ${l}`).join('\n'));
eq('restore-verify: exit 0 (MATCH)', rv.status, 0);
check('…it compared and found no differences', /differences: 0/.test(rv.stdout) && /MATCH/.test(rv.stdout));
check('…and the disposable stack was removed', /left behind: 0 containers, 0 volumes, 0 networks/.test(rv.stdout));
const hashesAfter = files.filter((f) => f !== 'manifest.json').map((f) => createHash('sha256').update(fs.readFileSync(path.join(folder, f))).digest('hex'));
eq('backup files unchanged by the restore (hashes)', hashesAfter, man.files.filter((f: { name: string }) => f.name !== 'manifest.json').map((f: { sha256: string }) => f.sha256));

console.log('\n[4] Negative controls');
const copy = (suffix: string) => {
  const d = `${folder}-${suffix}`;
  fs.mkdirSync(d);
  for (const f of fs.readdirSync(folder).filter((x) => !x.startsWith('restore-check'))) { fs.copyFileSync(path.join(folder, f), path.join(d, f)); fs.chmodSync(path.join(d, f), 0o666); }
  return d;
};
const tampered = copy('tampered');
fs.appendFileSync(path.join(tampered, 'public.dump'), Buffer.from([0]));
const t1 = restoreVerify(tampered);
check('a tampered dump is refused BEFORE any restore (hash mismatch)', t1.status === 1 && /do not match their manifest; not restoring/.test(t1.stdout), t1.stdout.slice(-400));
const differ = copy('differ');
const fpFile = path.join(differ, 'source-fingerprint.txt');
fs.writeFileSync(fpFile, fs.readFileSync(fpFile, 'utf-8').replace(/^(rows\.guidelines\|)231:/m, '$1230:'));
const m2 = JSON.parse(fs.readFileSync(path.join(differ, 'manifest.json'), 'utf-8').replace(/^﻿/, ''));
for (const f of m2.files) f.sha256 = createHash('sha256').update(fs.readFileSync(path.join(differ, f.name))).digest('hex');
fs.writeFileSync(path.join(differ, 'manifest.json'), JSON.stringify(m2));
const t2 = restoreVerify(differ);
check('a fingerprint difference is reported as a DIFF and fails', t2.status === 1 && /DIFF rows\.guidelines/.test(t2.stdout), t2.stdout.slice(-600));
fs.rmSync(tampered, { recursive: true, force: true });
fs.rmSync(differ, { recursive: true, force: true });

console.log(`\n  info  rehearsal backup kept at ${folder}`);
const left = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf-8' }).stdout.split('\n').filter((n) => n.includes('ortho-disc-test') || n.startsWith('ortho-backup')).length;
eq('no stack or backup containers left', left, 0);
const { pass, fail } = counts();
console.log(`\n──────── ${pass} passed, ${fail} failed ────────`);
process.exitCode = fail > 0 ? 1 : 0;
