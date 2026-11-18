import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forbiddenReaderModules,readerBoundary} from '../lib/reader-boundary.mjs';
test('rejects every database/auth/editor dependency even on Windows paths',()=>{
 const bad=['C:\\project\\node_modules\\@supabase\\supabase-js\\dist\\index.js','/src/lib/supabase.ts','/src/lib/editor-session.ts','/src/lib/staged-service.ts','/src/lib/guidelines-service.ts','/src/lib/changelog-service.ts','/src/components/ReviewDashboard.tsx','/src/components/EditorAuthControl.tsx','/src/components/PublicationReceipts.tsx','/src/components/GovernanceReviewInbox.tsx'];
 assert.equal(forbiddenReaderModules(bad).length,bad.length);
});
test('pure data, search, presentation and navigation are permitted',()=>assert.deepEqual(forbiddenReaderModules(['/src/data/guidelines-data.ts','/src/lib/search/engine.ts','/src/components/NavigationDrawer.tsx']),[]));
test('build fails before emitting success evidence',()=>assert.throws(()=>readerBoundary().generateBundle.call({getModuleIds:()=>['/src/lib/supabase.ts'],error:message=>{throw Error(message)},emitFile:()=>assert.fail('must not emit success')}),/ISOLATION BLOCKED/));
