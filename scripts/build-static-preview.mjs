/** Reproducible local static preview builder. Never uploads or contacts a database. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {safeEnvironment} from './lib/release-gate.mjs';
const root=process.cwd(),output=path.join(root,'reports/final-release-candidate/static-preview');
function git(args){const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(p.status)throw Error(p.stderr);return p.stdout.trim();}
if(git(['status','--porcelain','--untracked-files=all']))throw Error('Preview requires an exact clean committed candidate.');
const commit=git(['rev-parse','HEAD']);
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.static-preview','.env.static-preview.local'])if(fs.existsSync(name))throw Error('Environment files are forbidden for this build: '+name);
if(fs.existsSync(output))throw Error('Output already exists; preserve the existing artifact and choose a new workspace.');
const env={...safeEnvironment(),NODE_OPTIONS:'--require '+JSON.stringify(path.join(root,'scripts/lib/release-network.cjs'))};
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.static-preview.config.ts','--outDir',output],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(path.join(path.dirname(output),'static-build.log'),(build.stdout??'')+'\n'+(build.stderr??''));if(build.status)throw Error('Static build failed; inspect static-build.log');
fs.writeFileSync(path.join(output,'_headers'),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'
  X-Robots-Tag: noindex, nofollow, noarchive
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);
const files=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else files.push(full);}}walk(output);
for(const file of files){if(!/\.(?:js|html|css|json|webmanifest)$/.test(file))continue;const text=fs.readFileSync(file,'utf8');if(/https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\b|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9]+|sb_publishable_[A-Za-z0-9]+/i.test(text))throw Error('Unexpected database endpoint/token in '+file);}
const index=fs.readFileSync(path.join(output,'index.html'),'utf8');for(const match of index.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g))if(!fs.existsSync(path.join(output,match[1])))throw Error('Missing asset '+match[1]);
if(index.includes('/ortho-guidelines-hub/assets/')||index.includes('fonts.googleapis.com'))throw Error('Incorrect root paths or external fonts.');
const manifest={sourceCommit:commit,base:'/',mode:'static-only',fileCount:files.length,files:files.map(file=>({path:path.relative(output,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path)),validation:{endpointAndTokenScan:'passed',rootAssetPaths:'passed',database:'intentionally absent',deployment:'not executed',browser:'pending separate report'}};
fs.writeFileSync(path.join(path.dirname(output),'STATIC-PREVIEW-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({commit,output,fileCount:files.length}));
