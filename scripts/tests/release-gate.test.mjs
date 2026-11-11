import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { safeEnvironment, parseOfflineScript, offlineFiles, assertionsIn, classifyResult, reviewHolds, verdict,
  inspectBundle, executeChecks, runReleaseGate, checkUntrackedWhitespace, dependencyVersions, snapshotCandidate, validateToolScripts, observeCandidate, redactOutput, runProcess } from '../lib/release-gate.mjs';
import { parseArgs } from '../release-gate.mjs';

function temp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'ortho-release-test-'));
  try { return fn(dir); } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('ortho-release-test-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
const result = (status,stdout='') => ({status,stdout,stderr:''});

test('offline command parser refuses operational scripts, traversal and shell injection', () => {
  assert.deepEqual(parseOfflineScript('tsx scripts/tests/ingestion.test.ts && node --test scripts/tests/release-gate.test.mjs'),
    ['scripts/tests/ingestion.test.ts','scripts/tests/release-gate.test.mjs']);
  for (const script of ['', 'npm run seed','tsx scripts/seed.ts','tsx scripts/tests/../seed.test.ts',
    'tsx scripts/tests/a.test.ts; npm run seed','tsx scripts/tests/local-supabase/run.test.ts',
    'tsx scripts/tests/a.test.ts | other','tsx scripts/tests/a.test.ts && tsx scripts/tests/a.test.ts']) {
    assert.throws(() => parseOfflineScript(script));
  }
});

test('new root offline suites cannot be silently omitted from package script', () => temp((dir) => {
  fs.mkdirSync(path.join(dir,'scripts/tests'),{recursive:true});
  for (const file of ['a.test.ts','new.test.mjs','backup-safety.test.ps1','seed.ts']) fs.writeFileSync(path.join(dir,'scripts/tests',file),'');
  fs.mkdirSync(path.join(dir,'scripts/tests/integration'));
  fs.writeFileSync(path.join(dir,'scripts/tests/integration','database.test.ts'),'');
  assert.deepEqual(offlineFiles(dir,'tsx scripts/tests/a.test.ts'),
    ['scripts/tests/a.test.ts','scripts/tests/backup-safety.test.ps1','scripts/tests/new.test.mjs']);
  fs.writeFileSync(path.join(dir,'scripts/tests/unknown.test.js'),'');
  assert.throws(()=>offlineFiles(dir,'tsx scripts/tests/a.test.ts'));
}));

test('child environment strips credentials, Vite overrides and Node injection', () => {
  const env = safeEnvironment({Path:'os-path',SystemRoot:'os-root',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
    DATABASE_URL:'synthetic',PGPASSWORD:'synthetic',GITHUB_TOKEN:'synthetic',NODE_OPTIONS:'--require evil',
    NODE_PATH:'elsewhere',VITE_SUPABASE_URL:'synthetic',AWS_SECRET_ACCESS_KEY:'synthetic'});
  assert.equal(env.Path,'os-path'); assert.equal(env.SystemRoot,'os-root');
  assert.equal(env.CI,'true');
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','PGPASSWORD','GITHUB_TOKEN','NODE_OPTIONS','NODE_PATH','VITE_SUPABASE_URL','AWS_SECRET_ACCESS_KEY']) assert.equal(env[key],undefined);
});

test('assertion parser supports existing scripts and Node TAP summaries', () => {
  assert.deepEqual(assertionsIn('41 passed, 2 failed\n'),{passed:41,failed:2});
  assert.deepEqual(assertionsIn('---\n7 passed, 0 failed\n'),{passed:7,failed:0});
  assert.deepEqual(assertionsIn('TAP version 13\n# pass 4\n# fail 0\n'),{passed:4,failed:0});
  assert.equal(assertionsIn('no tests ran'),null);
});

test('zero exit cannot hide failed or missing assertions', () => {
  assert.equal(classifyResult({kind:'offline'},result(0,'2 passed, 1 failed')).status,'failed');
  assert.equal(classifyResult({kind:'offline'},result(0,'everything is fine')).status,'blocked');
  assert.equal(classifyResult({kind:'offline'},result(0,'0 passed, 0 failed')).status,'blocked');
  assert.equal(classifyResult({kind:'static'},result(0)).status,'passed');
});

test('crashes, spawn errors, signals and timeouts cannot pass', () => {
  assert.equal(classifyResult({kind:'offline'},result(1,'4 passed, 0 failed')).status,'failed');
  assert.equal(classifyResult({kind:'static'},{status:null,signal:'SIGTERM'}).status,'failed');
  assert.equal(classifyResult({kind:'static'},{error:{code:'ENOENT'}}).status,'blocked');
  assert.equal(classifyResult({kind:'static'},{error:{code:'ETIMEDOUT'}}).status,'timeout');
});

test('runner continues after failure and preserves independent check logs', () => temp((dir) => {
  const plan = ['a','b','c'].map(id=>({id,kind:'offline',command:'fake',args:[]}));
  const seen=[];
  const checks=executeChecks(plan,{root:dir,directory:dir,timeoutMs:1000,execute:(check)=>{
    seen.push(check.id);
    return result(check.id==='a'?1:0,check.id==='a'?'1 passed, 1 failed':'2 passed, 0 failed');
  }});
  assert.deepEqual(seen,['a','b','c']);
  assert.deepEqual(checks.map(c=>c.status),['failed','passed','passed']);
  assert.match(fs.readFileSync(path.join(dir,'a.log'),'utf8'),/1 failed/);
  assert.equal(verdict(checks,[]),'FAIL');
}));

test('a real timed-out harmless child is reported and later checks still run', () => temp((dir) => {
  const plan=[
    {id:'stall',kind:'static',command:process.execPath,args:['-e','setInterval(()=>{},1000)']},
    {id:'later',kind:'static',command:process.execPath,args:['-e','console.log("completed")']},
  ];
  const checks=executeChecks(plan,{root:dir,directory:dir,timeoutMs:250});
  assert.equal(checks[0].status,'timeout'); assert.equal(checks[1].status,'passed');
}));

test('database, clinical, workflow, retrieval and publication changes require explicit review', () => {
  const files=['supabase/migrations/test.sql','src/data/guidelines-data.ts','.github/workflows/deploy.yml',
    'scripts/lib/ingestion.ts','scripts/stage-discovery.ts'];
  const holds=reviewHolds(files,true);
  for(const id of ['uncommitted-candidate','database-runtime-review','clinical-owner-review','workflow-review','retrieval-review','editorial-security-review']) assert.ok(holds.some(h=>h.id===id));
  assert.equal(verdict([{status:'passed'}],holds),'HOLD');
  assert.equal(verdict([],[]),'HOLD');
  assert.equal(verdict([{status:'blocked'}],[]),'HOLD');
  assert.equal(verdict([{status:'passed'}],[]),'PASS');
  assert.ok(reviewHolds(['src/lib/search/terminology.ts'],false).some(h=>h.id==='clinical-owner-review'));
  for(const file of ['FINAL-INTEGRATION-REPORT.md','FINAL-RELEASE-CHECKLIST.md','OWNER-DECISIONS.md','FINAL-HANDOFF.md','final-integration.patch','final-integration.patch.sha256']) {
    assert.ok(reviewHolds([file],false).some(h=>h.id==='generated-evidence-review'));
  }
});

test('fresh artifact inspection rejects missing output and privileged-looking credentials', () => temp((dir) => {
  assert.ok(inspectBundle(dir).problems.length);
  for (const file of ['index.html','manifest.webmanifest','sw.js']) fs.writeFileSync(path.join(dir,file),'safe');
  assert.deepEqual(inspectBundle(dir).problems,[]);
  fs.writeFileSync(path.join(dir,'main.js'),'const synthetic = "sb_secret_NOT_A_REAL_CREDENTIAL";');
  const scan=inspectBundle(dir);
  assert.ok(scan.problems.some(p=>p.includes('privileged credential')));
  assert.ok(scan.problems.every(p=>!p.includes('NOT_A_REAL_CREDENTIAL')));
}));

test('built editor UUID is a reviewable failure without disclosing its value', () => temp((dir) => {
  for (const file of ['index.html','manifest.webmanifest','sw.js']) fs.writeFileSync(path.join(dir,file),'safe');
  fs.writeFileSync(path.join(dir,'app.js'),'const synthetic = "11111111-1111-1111-1111-111111111111";');
  const issues=inspectBundle(dir).problems;
  assert.ok(issues.some(p=>p.includes('UUID-shaped')));
  assert.ok(issues.every(p=>!p.includes('11111111')));
}));

test('CLI exposes no skip, deploy, seed or approval bypass', () => {
  assert.deepEqual(parseArgs(['--base','origin/main','--timeout-ms','5000']),{baseRef:'origin/main',timeoutMs:5000});
  for (const args of [['--skip-tests'],['--deploy'],['--seed'],['--allow-failures'],['--base']]) assert.throws(()=>parseArgs(args));
});

test('missing Git history produces a persistent HOLD report rather than success', () => {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const run=runReleaseGate({root,baseRef:'refs/heads/release-gate-deliberately-absent',progress:()=>{}});
  assert.equal(run.exitCode,2); assert.equal(run.report.verdict,'HOLD');
  const json=JSON.parse(fs.readFileSync(path.join(run.directory,'report.json'),'utf8'));
  assert.equal(json.releaseAuthorised,false);
  assert.ok(json.checks.some(c=>c.status==='blocked'));
  assert.match(fs.readFileSync(path.join(run.directory,'report.md'),'utf8'),/Required next actions/);
});

test('untracked files receive whitespace checks before staging, including EOF blank lines', () => temp((dir) => {
  fs.writeFileSync(path.join(dir,'new.ts'),'code\n\n');
  assert.ok(checkUntrackedWhitespace(dir,['new.ts']).some(s=>s.includes('EOF')));
  fs.writeFileSync(path.join(dir,'new.ts'),'code  \r\n');
  assert.ok(checkUntrackedWhitespace(dir,['new.ts']).some(s=>s.includes('trailing whitespace')));
  fs.writeFileSync(path.join(dir,'new.ts'),'code\r\n');
  assert.deepEqual(checkUntrackedWhitespace(dir,['new.ts']),[]);
}));

test('installed direct tool versions must match lockfile, not just semver ranges', () => temp((dir) => {
  fs.mkdirSync(path.join(dir,'node_modules/tool'),{recursive:true});
  fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify({packages:{'node_modules/tool':{version:'1.2.3'}}}));
  fs.writeFileSync(path.join(dir,'node_modules/tool/package.json'),JSON.stringify({version:'1.2.4'}));
  assert.deepEqual(dependencyVersions(dir,{devDependencies:{tool:'^1.2.3'}}).mismatches,['tool']);
  fs.writeFileSync(path.join(dir,'node_modules/tool/package.json'),JSON.stringify({version:'1.2.3'}));
  assert.deepEqual(dependencyVersions(dir,{devDependencies:{tool:'^1.2.3'}}).mismatches,[]);
}));

test('candidate fingerprint detects same-status untracked file edits at unchanged HEAD', () => temp((root) => {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:source,encoding:'utf8'}).trim();
  fs.writeFileSync(path.join(root,'.git'),'gitdir: '+gitDir+'\n');
  const file=path.join(root,'.release-gate-probe.tmp');
  const fd=fs.openSync(file,'wx');fs.writeSync(fd,'before');fs.closeSync(fd);
  try {
    const before=snapshotCandidate(root);
    fs.writeFileSync(file,'after');
    const after=snapshotCandidate(root);
    assert.equal(before.head,after.head);
    assert.equal(before.status,after.status);
    assert.notEqual(before.sha256,after.sha256);
  } finally { fs.unlinkSync(file); }
}));

test('multiple summaries cannot discard earlier failures or certify ambiguous success', () => {
  assert.equal(classifyResult({kind:'offline'},result(0,'1 passed, 1 failed\n1 passed, 0 failed')).status,'failed');
  assert.equal(classifyResult({kind:'offline'},result(0,'1 passed, 0 failed\n1 passed, 0 failed')).status,'blocked');
  assert.equal(classifyResult({kind:'offline'},result(0,'# pass 1\n# fail 0\n# pass 2\n# fail 0')).status,'blocked');
  assert.equal(classifyResult({kind:'offline'},result(0,'# pass 1\n# fail 0\n# pass 2\n# fail 1')).status,'failed');
  assert.equal(classifyResult({kind:'offline'},result(0,'1 passed, 0 failed\n# pass 1\n# fail 1')).status,'failed');
});

test('partial skips, TODOs and cancellations remain visible and cannot pass', () => {
  for (const counter of ['skipped','todo','cancelled']) {
    const check=classifyResult({kind:'offline'},result(0,'TAP version 13\n# pass 1\n# fail 0\n# '+counter+' 1'));
    assert.equal(check.status,'blocked');assert.equal(check.counts[counter],1);
  }
});

test('uppercase and underscore root suites are included; malformed names fail closed', () => temp((root) => {
  fs.mkdirSync(path.join(root,'scripts/tests'),{recursive:true});
  for (const file of ['a.test.ts','Hidden.test.mjs','some_test.test.ts']) fs.writeFileSync(path.join(root,'scripts/tests',file),'');
  const files=offlineFiles(root,'tsx scripts/tests/a.test.ts');
  assert.ok(files.includes('scripts/tests/Hidden.test.mjs'));
  assert.ok(files.includes('scripts/tests/some_test.test.ts'));
  fs.writeFileSync(path.join(root,'scripts/tests','bad name.test.ts'),'');
  assert.throws(()=>offlineFiles(root,'tsx scripts/tests/a.test.ts'));
}));

test('a restored source edit is observed while the main thread is synchronous', () => temp((root) => {
  const file=path.join(root,'source.ts');fs.writeFileSync(file,'original');
  const observer=observeCandidate(root);
  try {
    execFileSync(process.execPath,['-e',"const fs=require('fs');fs.writeFileSync(process.argv[1],'changed');fs.writeFileSync(process.argv[1],'original');",file]);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
    assert.equal(fs.readFileSync(file,'utf8'),'original');assert.equal(observer.changed(),true);assert.equal(observer.failed(),false);
  } finally { observer.stop(); }
}));

// P3-6 (962fca4 review): on Windows, reading a file can raise a metadata-only "change" notification
// (access time / antivirus), which made the release-gate control run fail with an unchanged tree.
const settle=(observer)=>{for(let i=0;i<10;i++)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30);return observer.changed();};
test('a metadata-only notification (access time) is not reported as a source edit', () => temp((root) => {
  fs.mkdirSync(path.join(root,'src'));const file=path.join(root,'src/source.ts');fs.writeFileSync(file,'original');
  const fixed=new Date('2026-01-01T00:00:00Z');fs.utimesSync(file,fixed,fixed);
  const observer=observeCandidate(root);
  try {
    fs.utimesSync(file,new Date('2026-06-01T00:00:00Z'),fixed);fs.readFileSync(file);
    assert.equal(settle(observer),false,'access-time-only change counted as an edit');assert.equal(observer.failed(),false);
    fs.writeFileSync(file,'original');
    for(let i=0;i<100&&!observer.changed();i++)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
    assert.equal(observer.changed(),true,'an identical-content rewrite is still a write and must be observed');
  } finally { observer.stop(); }
}));

test('a write that restores size and content but not the timestamp is still observed', () => temp((root) => {
  fs.mkdirSync(path.join(root,'src'));const file=path.join(root,'src/source.ts');fs.writeFileSync(file,'AAAA');
  const fixed=new Date('2026-01-01T00:00:00Z');fs.utimesSync(file,fixed,fixed);
  const observer=observeCandidate(root);
  try {
    execFileSync(process.execPath,['-e',"const fs=require('fs');fs.writeFileSync(process.argv[1],'BBBB');fs.writeFileSync(process.argv[1],'AAAA');",file]);
    for(let i=0;i<100&&!observer.changed();i++)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
    assert.equal(observer.changed(),true);assert.equal(observer.failed(),false);
  } finally { observer.stop(); }
}));

test('sensitive rename scope includes the original path with --no-renames', () => temp((root) => {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:source,encoding:'utf8'}).trim();
  fs.writeFileSync(path.join(root,'.git'),'gitdir: '+gitDir+'\n');
  const env={...process.env,GIT_INDEX_FILE:path.join(root,'temporary-index')};
  const git=(args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8'}).trim();
  git(['read-tree','HEAD']);const blob=git(['rev-parse','HEAD:src/data/guidelines-data.ts']);
  git(['update-index','--force-remove','--','src/data/guidelines-data.ts']);
  git(['update-index','--add','--cacheinfo','100644,'+blob+',catalogue-moved.ts']);
  const files=git(['diff','--cached','--no-renames','--name-only','HEAD']).split('\n');
  assert.ok(files.includes('src/data/guidelines-data.ts'));
  assert.ok(reviewHolds(files,false).some(h=>h.id==='clinical-owner-review'));
}));

test('diagnostics redact synthetic credential values without hiding assertion summaries', () => {
  const text='token=SYNTHETIC_SECRET_VALUE_NOT_REAL\nSUPABASE_SERVICE_ROLE_KEY="sb_secret_SYNTHETIC"\nAuthorization: Bearer syntheticToken\nhttps://user:syntheticPassword@example.invalid\n1 passed, 0 failed';
  const safe=redactOutput(text);
  for (const value of ['SYNTHETIC_SECRET_VALUE_NOT_REAL','sb_secret_SYNTHETIC','syntheticToken','syntheticPassword']) assert.ok(!safe.includes(value));
  assert.match(safe,/1 passed, 0 failed/);
});

test('offline Node runtime refuses external connections before DNS or sockets', () => temp((root) => {
  const check=runProcess({command:process.execPath,args:['-e',"require('net').connect({host:'synthetic-target.invalid',port:443})"]},root,5000);
  assert.notEqual(check.status,0);assert.match(check.stderr,/refused an external connection/);
}));

test('ignored output traffic does not conceal source or editorial-register edits', () => temp((root) => {
  for(const directory of ['src','reports','node_modules'])fs.mkdirSync(path.join(root,directory));
  const register=path.join(root,'reports/known-gaps.md');fs.writeFileSync(register,'before');
  const observer=observeCandidate(root);
  try {
    for(let i=0;i<100;i++){fs.writeFileSync(path.join(root,'reports',i+'.log'),'output');fs.writeFileSync(path.join(root,'node_modules',i+'.tmp'),'cache');}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);
    assert.equal(observer.changed(),false);assert.equal(observer.failed(),false);
    fs.writeFileSync(register,'after');
    for(let i=0;i<100&&!observer.changed();i++)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
    assert.equal(observer.changed(),true);
  } finally {observer.stop();}
}));

test('tracked generated evidence creates a review hold',()=>{
  assert.ok(reviewHolds(['reports/release-gate/old/report.json'],false).some(h=>h.id==='generated-evidence-review'));
});

test('changed release build or lint contracts cannot silently bypass the gate plan', () => {
  const scripts={build:'tsc -b && vite build',lint:'oxlint','typecheck:scripts':'tsc --noEmit -p tsconfig.scripts.json'};
  assert.doesNotThrow(()=>validateToolScripts(scripts));
  assert.throws(()=>validateToolScripts({...scripts,build:'npm run seed'}));
  assert.throws(()=>validateToolScripts({...scripts,lint:'oxlint --deny-warnings'}));
});
