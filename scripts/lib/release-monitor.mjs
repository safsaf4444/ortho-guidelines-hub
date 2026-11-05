import fs from 'node:fs';
import path from 'node:path';
import { workerData } from 'node:worker_threads';

// A separate event loop observes edits even while the runner uses spawnSync.
// The execution copy additionally prevents original-tree edits changing what
// later checks read. Missing observer support fails closed.
const {root,eventFile} = workerData;
const state = new Int32Array(workerData.state);
const watchers = [];
process.on('uncaughtException',()=>Atomics.store(state,2,1));
process.on('unhandledRejection',()=>Atomics.store(state,2,1));
process.once('exit',()=>{Atomics.store(state,2,1);for(const watcher of watchers)watcher.close();});
try {
  const directories = fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory());
  const existing = new Set(directories.map(entry=>entry.name));
  const excluded = new Set(['.git','node_modules','reports','dist','dist-ssr']);
  const observe = (directory,prefix,recursive) => {
  const watcher = fs.watch(directory,{recursive},(_event,name)=>{
    if (!name) { Atomics.store(state,2,1); return; }
    const file = prefix + String(name).replaceAll('\\','/');
    // Generated outputs and the existing equivalence fixture are not source.
    if (/^(?:\.git(?:\/|$)|node_modules(?:\/|$)|reports(?:\/|$)|dist(?:\/|$)|dist-ssr(?:\/|$))/.test(file) && file !== 'reports/known-gaps.md'
        || file === 'scripts/.equivalence-baseline.ts') return;
    // Existing directories have their own watchers. Root-level directory
    // metadata notifications do not establish that a source file was edited.
    if (!prefix && existing.has(file) && fs.existsSync(path.join(root,file))) return;
    const first = !Atomics.load(state,1);
    Atomics.store(state,1,1);
    if (eventFile && first) {
      try { fs.appendFileSync(eventFile,JSON.stringify({file})+'\n'); }
      catch { Atomics.store(state,2,1); }
    }
  });
  watcher.on('error',()=>Atomics.store(state,2,1));
  watchers.push(watcher);
  };
  // Exclude generated/dependency trees at registration time, not just in the
  // callback: ignored traffic must not overflow the native event buffer.
  observe(root,'',false);
  for (const entry of directories) if (!excluded.has(entry.name)) observe(path.join(root,entry.name),entry.name+'/',true);
  const register = path.join(root,'reports/known-gaps.md');
  if (fs.existsSync(register)) {
    const watcher = fs.watch(register,()=>Atomics.store(state,1,1));
    watcher.on('error',()=>Atomics.store(state,2,1));
    watchers.push(watcher);
  } else if (fs.existsSync(path.join(root,'reports'))) observe(path.join(root,'reports'),'reports/',false);
  Atomics.store(state,0,1);
  Atomics.notify(state,0);
} catch {
  Atomics.store(state,2,1);
  Atomics.store(state,0,2);
  Atomics.notify(state,0);
}
