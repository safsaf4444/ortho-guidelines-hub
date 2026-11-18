import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {forbiddenReaderModules,readerBoundary} from '../lib/reader-boundary.mjs';
test('rejects every database/auth/editor dependency even on Windows paths',()=>{
 const bad=['C:\\project\\node_modules\\@supabase\\supabase-js\\dist\\index.js','/src/lib/supabase.ts','/src/lib/editor-session.ts','/src/lib/staged-service.ts','/src/lib/guidelines-service.ts','/src/lib/changelog-service.ts','/src/components/ReviewDashboard.tsx','/src/components/EditorAuthControl.tsx','/src/components/PublicationReceipts.tsx','/src/components/GovernanceReviewInbox.tsx'];
 assert.equal(forbiddenReaderModules(bad).length,bad.length);
});
test('pure data, search, presentation and navigation are permitted',()=>assert.deepEqual(forbiddenReaderModules(['/src/data/guidelines-data.ts','/src/lib/search/engine.ts','/src/components/NavigationDrawer.tsx']),[]));
test('build fails before emitting success evidence',()=>assert.throws(()=>readerBoundary().generateBundle.call({getModuleIds:()=>['/src/lib/supabase.ts'],error:message=>{throw Error(message)},emitFile:()=>assert.fail('must not emit success')}),/ISOLATION BLOCKED/));
test('compiled asset check rejects database client code in JSON output',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ortho-reader-json-'));
 const safeRoot=path.resolve(os.tmpdir())+path.sep;
 assert.ok(path.resolve(dir).startsWith(safeRoot),'temporary fixture must remain under the OS temp directory');
 try{
  fs.writeFileSync(path.join(dir,'index.html'),'<html></html>');
  fs.writeFileSync(path.join(dir,'reader-module-manifest.json'),JSON.stringify({modules:['src/reader/ReaderApp.tsx'],forbidden:[]}));
  fs.writeFileSync(path.join(dir,'runtime-data.json'),JSON.stringify({code:'createClient('}));
  const run=spawnSync(process.execPath,['scripts/check-reader-assets.mjs',dir],{cwd:process.cwd(),encoding:'utf8'});
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/Forbidden compiled content/);
 }finally{
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
