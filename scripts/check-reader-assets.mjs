import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import { forbiddenReaderModules } from './lib/reader-boundary.mjs';
const output=path.resolve(process.argv[2]||'dist-reader');
if(!fs.existsSync(path.join(output,'index.html')))throw Error('Missing reader index');
const files=[];function walk(d){for(const x of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,x.name);if(x.isDirectory())walk(p);else if(x.isFile())files.push(p);else throw Error('Unexpected artifact type: '+p)}}walk(output);
const manifest=JSON.parse(fs.readFileSync(path.join(output,'reader-module-manifest.json'),'utf8'));
if(manifest.forbidden?.length||forbiddenReaderModules(manifest.modules).length)throw Error('Forbidden source module');
if(!manifest.modules.some(x=>x.includes('src/reader/ReaderApp.tsx'))||manifest.modules.some(x=>x.endsWith('src/App.tsx')))throw Error('Reader entrypoint missing or legacy App present');
const banned=[/supabase\.co/i,/@supabase/i,/createClient\s*\(/i,/auth\/v1/i,/rest\/v1/i,/staged_guidelines/i,/EditorAuthControl/i,/ReviewDashboard/i,/service_role/i,/VITE_SUPABASE/i];
for(const file of files){if(!/\.(?:js|json|html|css|webmanifest)$/.test(file))continue;const content=fs.readFileSync(file,'utf8');for(const pattern of banned)if(pattern.test(content))throw Error('Forbidden compiled content '+pattern+' in '+path.basename(file))}
const result={sourceSnapshotSha256:crypto.createHash('sha256').update(fs.readFileSync('src/data/guidelines-data.ts')).digest('hex'),files:files.sort().map(file=>({path:path.relative(output,file).replaceAll('\\','/'),size:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),modules:manifest.modules.length,forbidden:[]};
fs.writeFileSync(path.join(output,'reader-asset-manifest.json'),JSON.stringify(result,null,2));console.log('Reader asset boundary PASS:',result.files.length,'files,',result.modules,'modules');
