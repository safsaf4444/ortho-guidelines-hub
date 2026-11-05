import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

export function safeEnvironment(source = process.env) {
  const allowed = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL']);
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
  return { ...env, CI: 'true', NO_COLOR: '1' };
}

export function parseOfflineScript(script) {
  if (typeof script !== 'string' || !script.trim()) throw new Error('package.json has no test:offline command');
  const files = script.split(/\s*&&\s*/).map((part) => {
    const match = /^(?:tsx (scripts\/tests\/[A-Za-z0-9][A-Za-z0-9._-]*\.test\.ts)|node --test (scripts\/tests\/[A-Za-z0-9][A-Za-z0-9._-]*\.test\.mjs))$/.exec(part.trim());
    if (!match) throw new Error('Unsupported offline command; review package.json test:offline. Operational scripts and shell expressions are never run by this gate.');
    return match[1] || match[2];
  });
  if (new Set(files).size !== files.length) throw new Error('Duplicate offline test command');
  return files;
}

export function validateToolScripts(scripts = {}) {
  const expected = {
    build: 'tsc -b && vite build',
    lint: 'oxlint',
    'typecheck:scripts': 'tsc --noEmit -p tsconfig.scripts.json',
  };
  for (const [name, command] of Object.entries(expected)) {
    if (scripts[name]?.trim().replace(/\s+/g,' ') !== command) {
      throw new Error('Unsupported ' + name + ' script; review the release-gate plan so it validates the same tool contract used for release.');
    }
  }
}

export function offlineFiles(root, script) {
  const listed = parseOfflineScript(script);
  const entries = fs.readdirSync(path.join(root,'scripts/tests'),{withFileTypes:true});
  const candidates = entries.filter((entry) => /\.test\./i.test(entry.name));
  if (candidates.some((entry) => !entry.isFile() || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.test\.(ts|mjs|ps1)$/.test(entry.name))) throw new Error('Unsupported root offline test name/type; add a reviewed adapter rather than silently skipping it.');
  const extra = candidates.map((entry) => 'scripts/tests/' + entry.name);
  return [...listed, ...extra.filter((file) => !listed.includes(file)).sort()];
}

export function assertionsIn(output) {
  const summaries = [...output.matchAll(/(?:^|\n)[^\r\n]*?(\d+) passed, (\d+) failed[^\r\n]*(?=\r?\n|$)/g)];
  const tap = (name) => [...output.matchAll(new RegExp('^# ' + name + ' (\\d+)\\s*$','gm'))];
  const pass = tap('pass'), fail = tap('fail');
  const pairs = summaries.length ? summaries.map((m) => [Number(m[1]),Number(m[2])])
    : pass.length && fail.length ? [[Number(pass[0][1]),Number(fail[0][1])]] : [];
  if (!pairs.length) return null;
  const counts = {passed:pairs.reduce((n,p)=>n+p[0],0),failed:pairs.reduce((n,p)=>n+p[1],0)};
  // Preserve every TAP failure too, including mixed-format/duplicate output.
  if (summaries.length) counts.failed += fail.reduce((n,m)=>n+Number(m[1]),0);
  else {
    counts.passed = pass.reduce((n,m)=>n+Number(m[1]),0);
    counts.failed = fail.reduce((n,m)=>n+Number(m[1]),0);
  }
  if (summaries.length > 1 || pass.length > 1 || fail.length > 1 || (summaries.length && pass.length)
      || !Number.isSafeInteger(counts.passed) || !Number.isSafeInteger(counts.failed)) counts.ambiguous = true;
  for (const name of ['skipped','cancelled','todo']) {
    const value = tap(name).reduce((n,m)=>n+Number(m[1]),0);
    if (value) counts[name] = value;
  }
  if (/^not ok\b/m.test(output) && !counts.failed && !counts.todo) counts.failed = 1;
  return counts;
}

export function classifyResult(check, result) {
  const output = (result.stdout || '') + '\n' + (result.stderr || '');
  const counts = check.kind === 'offline' ? assertionsIn(output) : null;
  if (result.error?.code === 'ETIMEDOUT') return { status:'timeout', counts, action:'Investigate the timeout; no success is inferred. Rerun after resolving it.' };
  if (result.error) return { status:'blocked', counts, action:'Required tool could not run: ' + result.error.code + '. Install pinned dependencies/tools locally, then rerun.' };
  if (result.signal || result.status !== 0 || (counts && counts.failed > 0)) {
    return { status:'failed', counts, action:'Open the check log, fix or independently resolve the failure, then rerun. Failures are never waived as baseline noise.' };
  }
  if (check.kind === 'offline' && (!counts || counts.passed === 0 || counts.ambiguous || counts.skipped || counts.cancelled || counts.todo)) {
    return { status:'blocked', counts, action:'Assertions are missing, ambiguous or incomplete (including skips/TODO/cancellations). Resolve the missing evidence and rerun; exit 0 is insufficient.' };
  }
  return { status:'passed', counts, action:null };
}

export function reviewHolds(files, dirty) {
  const holds = [];
  const add = (id, pattern, action) => {
    const affected = files.filter((file) => pattern.test(file));
    if (affected.length) holds.push({ id, files:affected, action });
  };
  if (dirty) holds.push({ id:'uncommitted-candidate', files:[], action:'Commit the reviewed candidate separately and rerun on the exact clean commit before treating this as release evidence.' });
  add('database-runtime-review', /^(?:supabase\/|supabase[^/]*\.sql$)|^scripts\/(?:backup|deploy)\//,
    'Obtain engineering approval and separately authorised disposable-database/backup/deployment rehearsal evidence. This gate never executes SQL or operational wrappers.');
  add('clinical-owner-review', /^src\/data\/guidelines-data\.ts$|^src\/lib\/search\/terminology\.ts$|^scripts\/(?:seed|export-static|upsert-verified)\.ts$/,
    'Safa must review catalogue/source provenance and clinical-content changes. Automated checks cannot approve clinical guidance.');
  add('editorial-security-review', /^src\/(?:lib\/(?:supabase|editor|review|write|schema)|components\/(?:ReviewDashboard|EditorAuth))|^scripts\/(?:stage-|approve-|lib\/staging-ownership)/,
    'Review editorial authorisation, staging ownership and publication boundaries; attach separately authorised runtime evidence where needed.');
  add('validation-toolchain-review', /^package(?:-lock)?\.json$|^scripts\/(?:release-gate\.mjs|lib\/release-(?:gate\.mjs|monitor\.mjs|network\.cjs))$/, 'Review changes to the release validator, test commands, dependency lockfile and release build contract; the gate cannot approve its own policy changes.');
  add('offline-code-review', /^scripts\/tests\//, 'Review changed executable tests before running them. The runtime network guard is defence in depth, not an OS sandbox.');
  add('generated-evidence-review', /^reports\/release-gate\/|^(?:final-integration\.patch(?:\.sha256)?|FINAL-INTEGRATION-REPORT\.md|FINAL-RELEASE-CHECKLIST\.md|OWNER-DECISIONS\.md|FINAL-HANDOFF\.md)$/, 'Generated release evidence must not be shipped as candidate source. Remove tracked/force-added reports or exports before release.');
  add('workflow-review', /^\.github\/workflows\//, 'Review permissions, schedules, dispatch defaults and deployment triggers. This gate never activates or dispatches workflows.');
  add('browser-pwa-review', /^src\/|^public\/|^vite\.config\./,
    'Record browser/mobile/accessibility and service-worker update smoke checks for the affected UI. A successful build is insufficient runtime evidence.');
  add('retrieval-review', /^scripts\/(?:adapters\/|discover\.ts$|sync-providers\.ts$|detect-changes\.ts$|monitor-providers\.ts$|lib\/(?:ingestion|edition-match|provider-registry|coverage-gap|index-diff))/,
    'Review provider scope, source-access permission, identity collisions, failure handling and monitoring baselines. No live provider requests are made by the gate itself.');
  return holds;
}

export function verdict(checks, holds) {
  if (checks.some((c) => ['failed','timeout'].includes(c.status))) return 'FAIL';
  if (!checks.length || checks.some((c) => c.status !== 'passed') || holds.length) return 'HOLD';
  return 'PASS';
}

export function inspectBundle(directory) {
  const problems = [];
  for (const file of ['index.html','manifest.webmanifest','sw.js']) {
    if (!fs.existsSync(path.join(directory,file))) problems.push('Missing required PWA build output: ' + file);
  }
  let scanned = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const file = path.join(dir,entry.name);
      if (entry.isSymbolicLink()) { problems.push('Unexpected symlink in bundle: ' + path.relative(directory,file)); continue; }
      if (entry.isDirectory()) { walk(file); continue; }
      scanned++;
      if (!/\.(?:js|html|css|json|webmanifest|map)$/.test(entry.name)) continue;
      const text = fs.readFileSync(file,'utf8');
      if (/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]+|"role"\s*:\s*"service_role"/.test(text)) {
        problems.push('Suspected privileged credential in ' + path.relative(directory,file) + ' (value omitted)');
      }
      if (/\.(?:js|html|css)$/.test(entry.name) && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) {
        problems.push('UUID-shaped identity in ' + path.relative(directory,file) + '; review whether an editor identity leaked (value omitted)');
      }
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  if (!scanned) problems.push('No fresh build files could be inspected');
  return { scanned, problems };
}


export function checkUntrackedWhitespace(root, files) {
  const problems = [];
  for (const file of files) {
    const full = path.join(root,file);
    if (fs.lstatSync(full).isSymbolicLink()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue; // binary file; Git's textual whitespace rules do not apply
    const text = bytes.toString('utf8').replace(/\r\n/g,'\n');
    const lines = text.split('\n');
    lines.forEach((line,index) => {
      if (/[ \t]+$/.test(line)) problems.push(file + ':' + (index+1) + ': trailing whitespace');
    });
    if (/\n\n$/.test(text)) problems.push(file + ': extra blank line at EOF');
  }
  return problems;
}

export function dependencyVersions(root, pkg) {
  const lock = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const mismatches = [];
  const versions = {};
  for (const name of Object.keys({...pkg.dependencies,...pkg.devDependencies}).sort()) {
    const expected = lock.packages?.['node_modules/' + name]?.version;
    let installed = null;
    try { installed = JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version; } catch { /* missing => hold */ }
    versions[name] = {expected:expected || null,installed};
    if (!expected || installed !== expected) mismatches.push(name);
  }
  return {versions,mismatches};
}

export function runProcess(check, root, timeoutMs) {
  const guard = fileURLToPath(new URL('./release-network.cjs',import.meta.url));
  const env = {...safeEnvironment(), NODE_OPTIONS:'--require ' + JSON.stringify(guard)};
  return spawnSync(check.command,check.args,{ cwd:root, env, encoding:'utf8', shell:false,
    windowsHide:true, timeout:timeoutMs, maxBuffer:16 * 1024 * 1024 });
}

export function redactOutput(output) {
  return output
    .replace(/\b(?:sb_secret_|sbp_)[A-Za-z0-9_-]+/g,'[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi,'$1[REDACTED]')
    .replace(/((?:[A-Za-z0-9_]*(?:token|password|secret|private_key|service_role_key)|apikey|anonKey)["']?\s*[:=]\s*)["']?[^\s,"';}\]]+/gi,'$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi,'$1[REDACTED]@');
}

export function executeChecks(plan, { root, directory, timeoutMs, execute = runProcess, progress = () => {}, onCheck = () => {} }) {
  const checks = [];
  for (const item of plan) {
    const start = Date.now();
    progress('Running ' + item.id);
    let result;
    try { result = execute(item,root,timeoutMs); }
    catch (error) { result = { status:null, error:{code:error.code || 'RUNNER_ERROR'}, stderr:error.message }; }
    const classified = classifyResult(item,result);
    const log = item.id.replace(/[^a-z0-9.-]/gi,'_') + '.log';
    const output = (result.stdout || '') + '\n' + (result.stderr || '');
    fs.writeFileSync(path.join(directory,log),redactOutput(output));
    checks.push({ id:item.id, kind:item.kind, command:[item.command,...item.args], ...classified,
      exitCode:result.status ?? null, signal:result.signal || null, durationMs:Date.now()-start, log });
    onCheck(checks.at(-1));
    progress(classified.status.toUpperCase() + ' ' + item.id);
  }
  return checks;
}

function git(root, args) {
  const r = spawnSync('git',args,{cwd:root,env:safeEnvironment(),encoding:'utf8',shell:false,windowsHide:true,timeout:15000,maxBuffer:16*1024*1024});
  if (r.error || r.status !== 0) throw new Error('Git inspection failed (' + args[0] + '); verify Git history and repository access.');
  return r.stdout;
}

export function snapshotCandidate(root) {
  const head = git(root,['rev-parse','HEAD']).trim();
  const status = git(root,['status','--porcelain=v1','-z','--untracked-files=all']);
  const files = git(root,['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean).sort();
  const digest = crypto.createHash('sha256').update(head);
  for (const file of files) {
    digest.update('\0' + file + '\0');
    try {
      const full = path.join(root,file);
      digest.update(fs.lstatSync(full).isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      digest.update('<deleted>');
    }
  }
  return { head, status, sha256:digest.digest('hex'), files };
}

export function observeCandidate(root,eventFile) {
  const state = new Int32Array(new SharedArrayBuffer(12));
  const worker = new Worker(new URL('./release-monitor.mjs',import.meta.url),{workerData:{root,eventFile,state:state.buffer}});
  worker.on('error',()=>Atomics.store(state,2,1));
  Atomics.wait(state,0,0,10000);
  if (Atomics.load(state,0) !== 1 || Atomics.load(state,2)) {
    worker.terminate();
    throw new Error('Source observer could not start; source stability is unproven.');
  }
  return {
    changed:()=>Boolean(Atomics.load(state,1)),
    failed:()=>Boolean(Atomics.load(state,2)),
    stop:()=>worker.terminate(),
  };
}

export function executionSnapshot(root, candidate) {
  // Keep the bulk copy outside the observed source tree: creating hundreds of
  // ignored output files can overflow native filesystem-notification buffers.
  const destination = fs.mkdtempSync(path.join(os.tmpdir(),'ortho-release-source-'));
  try {
  for (const file of candidate.files) {
    const original = path.join(root,file);
    if (!fs.existsSync(original)) continue;
    if (fs.lstatSync(original).isSymbolicLink()) throw new Error('Symlink candidate input requires review: ' + file);
    const target = path.join(destination,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(original,target);
  }
  // Read-only Git inspection in offline tests still needs the pinned history.
  fs.writeFileSync(path.join(destination,'.git'),'gitdir: ' + git(root,['rev-parse','--absolute-git-dir']).trim() + '\n');
  fs.symlinkSync(path.join(root,'node_modules'),path.join(destination,'node_modules'),process.platform === 'win32' ? 'junction' : 'dir');
  if (snapshotCandidate(destination).sha256 !== candidate.sha256) throw new Error('Execution snapshot differs from candidate; rerun on stable source.');
  return destination;
  } catch (error) { removeExecutionSnapshot(destination); throw error; }
}

function removeExecutionSnapshot(directory) {
  if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('ortho-release-source-')) throw new Error('Refused unsafe execution-snapshot cleanup.');
  const modules = path.join(directory,'node_modules');
  if (fs.existsSync(modules) && fs.lstatSync(modules).isSymbolicLink()) fs.unlinkSync(modules);
  fs.rmSync(directory,{recursive:true,force:true});
}

export function renderReport(report) {
  const lines = [
    '# Local release gate: ' + report.verdict,
    '',
    'Candidate: ' + (report.candidate?.head || 'unavailable'),
    'Branch: ' + (report.branch || 'unavailable'),
    'Comparison base: ' + report.baseRef + ' (' + (report.baseSha || 'unavailable') + ')',
    'Candidate fingerprint: ' + (report.candidate?.sha256 || 'unavailable'),
    'Started: ' + report.startedAt,
    '',
    'PASS means these automated local checks passed; it grants no permission to publish clinical content, change a database or deploy.',
    'FAIL means an executed check failed. HOLD means evidence, tooling, a stable clean candidate or scoped human review is missing.',
    '',
    '## Checks', '',
    '| Check | Result | Exit | Assertions passed/failed | Log |',
    '| --- | --- | --- | --- | --- |',
    ...report.checks.map((c) => '| ' + c.id + ' | ' + c.status + ' | ' + (c.exitCode ?? '-') + ' | ' +
      (c.counts ? c.counts.passed + '/' + c.counts.failed : '-') + ' | ' + (c.log ? '[' + c.log + '](' + c.log + ')' : '-') + ' |'),
    '', '## Required next actions', '',
  ];
  const actions = [...report.checks.filter((c) => c.status !== 'passed').map((c) => c.id + ': ' + c.action),
    ...report.holds.map((h) => h.id + ': ' + h.action + (h.files.length ? ' Files: ' + h.files.join(', ') : ''))];
  lines.push(...(actions.length ? actions.map((a) => '- ' + a) : ['- No automated blockers or scoped review holds were detected. Safa retains release approval.']));
  lines.push('', '## Changed files', '', ...report.changedFiles.map((f) => '- ' + f),
    '', '## Limits', '',
    '- No live provider, database, backup, restore, migration, publication or deployment validation is performed.',
    '- Offline test bodies are repository code, not sandboxed code; review new or modified tests before running. Some suites use loopback mock servers.',
    '- No environment-file contents or production credentials are needed. Private env files block execution; child processes receive only basic OS variables.',
    '- Logs may contain source diagnostics. Review locally before sharing.',
    '');
  return lines.join('\n');
}

export function runReleaseGate({ root = process.cwd(), baseRef = 'origin/main', timeoutMs = 120000, progress = console.log } = {}) {
  root = path.resolve(root);
  const startedAt = new Date().toISOString();
  const parent = path.join(root,'reports/release-gate');
  fs.mkdirSync(parent,{recursive:true});
  const directory = fs.mkdtempSync(path.join(parent,startedAt.replace(/[:.]/g,'-') + '-'));
  const report = { schemaVersion:1, startedAt, root, baseRef, baseSha:null, branch:null, candidate:null,
    changedFiles:[], checks:[], holds:[], verdict:'HOLD', releaseAuthorised:false, runtime:{node:process.version,platform:process.platform,arch:process.arch} };
  let before, observer, executionObserver, executionRoot;
  const block = (id, action) => report.checks.push({id,kind:'preflight',status:'blocked',exitCode:null,action,counts:null,log:null});
  try {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new Error('timeout-ms must be an integer between 1000 and 900000');
    if (!baseRef || baseRef.startsWith('-') || /[\r\n]/.test(baseRef) || baseRef.includes(String.fromCharCode(0))) throw new Error('Invalid base ref');
    const envFiles = ['.env','.env.local','.env.production','.env.production.local'];
    if (envFiles.some((file) => fs.existsSync(path.join(root,file)))) {
      throw new Error('Private/default Vite environment files are present. Use an isolated checkout without them; this gate does not read their contents.');
    }
    observer = observeCandidate(root,path.join(directory,'source-mutations.log'));
    before = snapshotCandidate(root);
    report.candidate = {head:before.head,sha256:before.sha256};
    report.branch = git(root,['branch','--show-current']).trim() || '(detached)';
    report.baseSha = git(root,['rev-parse','--verify',baseRef + '^{commit}']).trim();
    const tracked = git(root,['diff','--no-renames','--name-only','-z',report.baseSha,'--']).split('\0').filter(Boolean);
    const untracked = git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
    report.changedFiles = [...new Set([...tracked,...untracked])].sort();
    report.holds = reviewHolds(report.changedFiles,Boolean(before.status));
    const whitespace = checkUntrackedWhitespace(root,untracked);
    report.checks.push({id:'untracked-whitespace',kind:'static',status:whitespace.length ? 'failed':'passed',exitCode:null,log:null,counts:null,action:whitespace.length ? whitespace.join('; ') : null});
    const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    validateToolScripts(pkg.scripts);
    const suites = offlineFiles(root,pkg.scripts?.['test:offline']);
    const dependencies = dependencyVersions(root,pkg);
    report.dependencies = dependencies.versions;
    report.lockfileSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'package-lock.json'))).digest('hex');
    report.checks.push({id:'dependency-lock',kind:'preflight',status:dependencies.mismatches.length ? 'blocked':'passed',exitCode:null,log:null,counts:null,action:dependencies.mismatches.length ? 'Installed direct dependency versions differ from the lockfile: ' + dependencies.mismatches.join(', ') + '. Run a separately authorised npm ci in this checkout and rerun.' : null});
    const tools = { tsc:'node_modules/typescript/bin/tsc', vite:'node_modules/vite/bin/vite.js',
      lint:'node_modules/oxlint/bin/oxlint', tsx:'node_modules/tsx/dist/cli.mjs' };
    for (const file of Object.values(tools)) if (!fs.existsSync(path.join(root,file))) throw new Error('Required dependency missing: ' + file + '. Install the lockfile-pinned dependencies separately.');
    executionRoot = executionSnapshot(root,before);
    report.execution = {root:executionRoot,sourceSha256:before.sha256};
    executionObserver = observeCandidate(executionRoot,path.join(directory,'execution-mutations.log'));
    const node = process.execPath;
    const bundle = path.join(directory,'bundle');
    const plan = [
      {id:'whitespace',kind:'static',command:'git',args:['diff','--check',report.baseSha,'--']},
      {id:'typecheck-scripts',kind:'static',command:node,args:[tools.tsc,'--noEmit','-p','tsconfig.scripts.json']},
      {id:'typecheck-project',kind:'static',command:node,args:[tools.tsc,'-b','--noEmit','--incremental','false']},
      {id:'lint',kind:'static',command:node,args:[tools.lint]},
      {id:'production-build',kind:'build',command:node,args:[tools.vite,'build','--outDir',bundle]},
    ];
    for (const file of suites) {
      const args = file.endsWith('.mjs') ? ['--test','--test-reporter=tap',file] : [tools.tsx,file];
      plan.push(file.endsWith('.ps1')
        ? {id:'offline-' + path.basename(file),kind:'offline',command:process.platform === 'win32' ? 'powershell.exe' : 'pwsh',args:['-NoProfile','-ExecutionPolicy','Bypass','-File',file]}
        : {id:'offline-' + path.basename(file),kind:'offline',command:node,args});
    }
    executeChecks(plan,{root:executionRoot,directory,timeoutMs,progress,onCheck:(check)=>report.checks.push(check)});
    if (snapshotCandidate(executionRoot).sha256 !== before.sha256 || executionObserver.changed() || executionObserver.failed()) {
      block('execution-source-changed','The copied execution source changed during validation; rerun after resolving the mutation.');
    }
    if (report.checks.find((c) => c.id === 'production-build')?.status === 'passed') {
      const result = inspectBundle(bundle);
      report.checks.push({id:'fresh-bundle-security-and-pwa',kind:'artifact',status:result.problems.length ? 'failed':'passed',
        exitCode:null,log:null,counts:null,scannedFiles:result.scanned,
        action:result.problems.length ? result.problems.join('; ') : null});
    } else block('fresh-bundle-security-and-pwa','A fresh successful build is required; existing/stale dist output is never accepted as evidence.');
  } catch (error) { block('gate-preflight',redactOutput(error.message)); }
  if (before) {
    try {
      const after = snapshotCandidate(root);
      report.sourceStability = {headChanged:before.head !== after.head,contentsChanged:before.sha256 !== after.sha256,
        gitStateChanged:before.status !== after.status,eventsObserved:observer?.changed() || false,observerFailed:observer?.failed() || false};
      if (Object.values(report.sourceStability).some(Boolean)) {
        block('candidate-changed-during-validation','Tracked/untracked candidate contents or Git state changed while checks ran. Rerun on a stable candidate; these results cannot approve a different tree.');
      }
    } catch (error) { block('candidate-verification',error.message); }
  }
  observer?.stop();
  executionObserver?.stop();
  if (executionRoot) {
    try { removeExecutionSnapshot(executionRoot); }
    catch { block('execution-cleanup','Temporary execution source could not be removed. Review the recorded execution path locally.'); }
  }
  report.verdict = verdict(report.checks,report.holds);
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2) + '\n');
  fs.writeFileSync(path.join(directory,'report.md'),renderReport(report));
  progress('Release gate ' + report.verdict + ': ' + path.join(directory,'report.md'));
  return {report,directory,exitCode:report.verdict === 'PASS' ? 0 : report.verdict === 'FAIL' ? 1 : 2};
}
