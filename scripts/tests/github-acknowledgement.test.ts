/** Offline adversarial test of the actual acknowledgement entry point. */
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
let passed=0,failed=0;const check=(name:string,value:boolean)=>{console.log((value?'PASS ':'FAIL ')+name);if(value)passed++;else failed++;};
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ortho-github-ack-'));
try{
 for(const body of ['approve','reject','APPROVE','approve this','']){
  const scenario=path.join(temporary,'scenario.json'),log=path.join(temporary,'requests.jsonl');fs.writeFileSync(scenario,JSON.stringify({issue:{body:'Synthetic issue with untrusted Row ID / URL',state:'open'},row:{id:'synthetic'},link:{status:200}}));fs.writeFileSync(log,'');
  const result=spawnSync(process.execPath,['--import','tsx','--import',pathToFileURL(path.resolve('scripts/tests/fixtures/approve-change-harness.mjs')).href,path.resolve('scripts/approve-change.ts')],{encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH??'',SYSTEMROOT:process.env.SYSTEMROOT??'',TEMP:os.tmpdir(),TMP:os.tmpdir(),GITHUB_TOKEN:'synthetic-token',GITHUB_REPOSITORY:'synthetic/repository',ISSUE_NUMBER:'123',COMMENT_BODY:body,COMMENT_AUTHOR:'unmapped-collaborator',SUPABASE_URL:'http://supabase.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-do-not-use',HARNESS_SCENARIO:scenario,HARNESS_LOG:log}});
  const calls=fs.readFileSync(log,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line) as {url:string;method:string;body:string});
  check('entry exits successfully: '+JSON.stringify(body),result.status===0);
  check('no Supabase or publisher request: '+JSON.stringify(body),calls.every(c=>new URL(c.url).hostname==='api.github.com'));
  check('never closes issue or writes database: '+JSON.stringify(body),calls.every(c=>c.method==='GET'||(c.method==='POST'&&c.url.endsWith('/comments'))));
  if(['approve','reject','APPROVE'].includes(body))check('explicit non-authorisation disclosure: '+body,calls.some(c=>c.body?.includes('No database, verification, clinical approval or publication change')));
 }
 const workflow=fs.readFileSync('.github/workflows/approve-change.yml','utf8');check('workflow receives no database credentials',!workflow.includes('SUPABASE_URL:')&&!workflow.includes('SUPABASE_SERVICE_ROLE_KEY:'));
}finally{if(path.dirname(temporary)!==os.tmpdir()||!path.basename(temporary).startsWith('ortho-github-ack-'))throw Error('Unsafe cleanup');fs.rmSync(temporary,{recursive:true,force:true});}
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
