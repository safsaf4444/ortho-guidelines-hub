/** F2 legacy backfill: contradictory pre-migration evidence must keep its document signal. */
import fs from 'node:fs';import {setup,sql,actor,editor,literal,container} from './db-harness.mjs';
if(!process.argv.some(a=>a.startsWith('--lab=')))throw Error('Explicit new lab required');setup();
const out='reports/final-acceptance-blockers';fs.mkdirSync(out,{recursive:true});const u=n=>'https://synthetic.example.test/legacy-alias/'+n;let passed=0,failed=0;const outcomes=[];
const test=(name,ok)=>{outcomes.push({name,passed:!!ok});if(ok)passed++;else failed++;console.log((ok?'PASS ':'FAIL ')+name);};
const val=(role,uid,q)=>sql(actor(role,uid,q)).split('\n').at(-1);
const cases=[['index-first',['index','document']],['document-first',['document','index']]];const ids={};
for(const [slug,order] of cases){
 const url=u('a-'+slug),alias=u('b-'+slug),key=sql(`select public.document_identity_key('${url}')`);
 const alts=order.map(scope=>({url:alias,scope,relation:'redirect-target'}));
 ids[slug]=JSON.parse(val('service_role',null,`select public.stage_discovery_candidate('legacy-${slug}','discover',${literal({classification:'NEW_GUIDELINE',discoveryId:'legacy-'+slug,discoveredUrl:url,sourceUrlKey:key,topic:'Synthetic legacy',provider:'SYNTHETIC',surfaceUrl:u('index'),observedAt:new Date().toISOString(),urlAlternatives:alts})})`)).stagedId;
 val('authenticated',editor,`select public.reject_staged_candidate('${ids[slug]}','Synthetic legacy rejection',false)`);
}
const evidence=()=>sql("select md5(jsonb_agg(to_jsonb(e) order by id)::text) from public.staged_discovery_evidence e"),before=evidence();
sql(fs.readFileSync('supabase/proposals/20261107_editorial_governance_hardening.sql','utf8'));
test('backfill leaves original evidence unchanged',evidence()===before);
for(const [slug] of cases){
 const alias=u('b-'+slug),rows=sql(`select s.trust_status from public.governance_rejection_sources s join public.governance_rejections r on r.id=s.rejection_id where r.staged_id='${ids[slug]}' and s.observed_alias='${alias}' order by 1`).split('\n');
 test(`${slug}: legacy rejection keeps both classifications`,rows.length===2&&rows[0].startsWith('comparison-only')&&rows[1].startsWith('navigation-only'));
 test(`${slug}: legacy alias requires comparison`,sql(`select public._governance_comparison_required(public.document_identity_key('${alias}'))`)==='t');
}
fs.writeFileSync(out+'/legacy-alias-runtime.json',JSON.stringify({container,passed,failed,outcomes},null,2)+'\n');console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
