/** The comment entry point is deliberately acknowledgement-only after governance hardening. */
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
let passed=0,failed=0;function check(name:string,ok:boolean){console.log((ok?'PASS ':'FAIL ')+name);if(ok)passed++;else failed++;}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ortho-comment-policy-'));
const cases:Array<{name:string;body:string;issue:unknown;code:number;posts:number;repository?:string;issueStatus?:number;commentStatus?:number}>=[
 {name:'approve is not publication',body:'approve',issue:{body:'Synthetic URL: `https://publisher.example.test/A`',state:'open'},code:0,posts:1},
 {name:'reject is not a database hash reset',body:'reject',issue:{body:'Synthetic Row ID and URL',state:'open'},code:0,posts:1},
 {name:'case and whitespace',body:' \nAPPROVE\t',issue:{body:'Synthetic',state:'open'},code:0,posts:1},
 {name:'untrusted issue URL never fetched',body:'approve',issue:{body:'URL: `http://127.0.0.1/private`',state:'open'},code:0,posts:1},
 {name:'stale/missing row ID is harmless acknowledgement',body:'approve',issue:{body:'No row metadata',state:'open'},code:0,posts:1},
 {name:'closed issue',body:'approve',issue:{body:'Synthetic',state:'closed'},code:0,posts:0},
 {name:'non-exact action',body:'approve everything',issue:{body:'Synthetic',state:'open'},code:0,posts:0},
 {name:'bot acknowledgement cannot recurse',body:'Request acknowledged: approve.',issue:{body:'Synthetic',state:'open'},code:0,posts:0},
 {name:'null GitHub response',body:'approve',issue:null,code:1,posts:0},
 {name:'array GitHub response',body:'approve',issue:[],code:1,posts:0},
 {name:'missing issue body',body:'approve',issue:{state:'open'},code:1,posts:0},
 {name:'invalid state',body:'approve',issue:{body:'Synthetic',state:42},code:1,posts:0},
 {name:'invalid repository cannot redirect token',body:'approve',issue:{body:'Synthetic',state:'open'},repository:'https://attacker.example.test/x',code:1,posts:0},
 {name:'GitHub read error',body:'approve',issue:{body:'Synthetic',state:'open'},issueStatus:403,code:1,posts:0},
 {name:'comment failure is not reported as success',body:'approve',issue:{body:'Synthetic',state:'open'},commentStatus:500,code:1,posts:1},
];
try{for(const c of cases){const scenario=path.join(temporary,'scenario.json'),log=path.join(temporary,'log.jsonl');fs.writeFileSync(scenario,JSON.stringify({issue:c.issue,issueStatus:c.issueStatus,commentStatus:c.commentStatus,row:{id:'fake'},link:{status:200}}));fs.writeFileSync(log,'');const r=spawnSync(process.execPath,['--import','tsx','--import',pathToFileURL(path.resolve('scripts/tests/fixtures/approve-change-harness.mjs')).href,path.resolve('scripts/approve-change.ts')],{encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH??'',SYSTEMROOT:process.env.SYSTEMROOT??'',TEMP:os.tmpdir(),TMP:os.tmpdir(),GITHUB_TOKEN:'synthetic-github-token',GITHUB_REPOSITORY:c.repository??'synthetic/repository',ISSUE_NUMBER:'123',COMMENT_BODY:c.body,COMMENT_AUTHOR:'not-a-database-editor',SUPABASE_URL:'http://supabase.test',SUPABASE_SERVICE_ROLE_KEY:'must-never-be-used',HARNESS_SCENARIO:scenario,HARNESS_LOG:log}});const calls=fs.readFileSync(log,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as {url:string;method:string;body:string});check(c.name+' expected exit',r.status===c.code);check(c.name+' only GitHub contacted',calls.every(x=>new URL(x.url).hostname==='api.github.com'));check(c.name+' no database writes or issue closure',calls.every(x=>x.method==='GET'||(x.method==='POST'&&x.url.endsWith('/comments'))));check(c.name+' expected acknowledgement count',calls.filter(x=>x.method==='POST').length===c.posts);}}
finally{if(path.dirname(temporary)!==os.tmpdir()||!path.basename(temporary).startsWith('ortho-comment-policy-'))throw Error('Unsafe cleanup');fs.rmSync(temporary,{recursive:true,force:true});}
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
