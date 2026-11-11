/** F1/F2 acceptance-blocker regressions. Disposable network-none lab; synthetic rows only. */
import fs from 'node:fs';import {spawn} from 'node:child_process';import {sql,actor,editor,outsider,payload,literal,stage,approve,container} from './db-harness.mjs';
const out='reports/final-acceptance-blockers';fs.mkdirSync(out,{recursive:true});
const run=Date.now().toString(36),u=n=>'https://synthetic.example.test/blockers/'+run+'/'+n;
let passed=0,failed=0,sequence=0;const outcomes=[];
const test=async(name,fn)=>{try{if(await fn()===false)throw Error('Assertion false');passed++;outcomes.push({name,status:'passed'});console.log('PASS '+name);}catch(e){failed++;outcomes.push({name,status:'failed',error:e.message});console.log('FAIL '+name+': '+e.message);}};
const value=(role,uid,q)=>sql(actor(role,uid,q)).split('\n').at(-1);
const refused=(fn,re)=>{try{fn();return false;}catch(e){if(re.test(e.message))return true;throw e;}};
const key=url=>sql(`select public.document_identity_key('${url}')`),match=url=>sql(`select public.document_match_key('${url}')`);
const discoverSql=(runId,name,url,alts=[])=>`select public.stage_discovery_candidate('${runId}','discover',${literal({classification:'NEW_GUIDELINE',discoveryId:name,discoveredUrl:url,sourceUrlKey:key(url),topic:'Synthetic',provider:'SYNTHETIC',surfaceUrl:u('index'),observedAt:new Date().toISOString(),urlAlternatives:alts})})`;
const discover=(name,url,alts=[])=>JSON.parse(value('service_role',null,discoverSql(`${run}-${++sequence}`,name,url,alts)));
const syncCandidate=(name,versions)=>({candidateId:name,pipeline:'sync-providers',provider:'SYNTHETIC',topic:'Synthetic',changeReason:'NEW_GUIDELINE',versions,primaryUrl:match(versions[0].url),sourceUrlKey:key(versions[0].url),discoveredAt:new Date().toISOString()});
const syncSql=(runId,c)=>`select public.stage_sync_candidates('${runId}',${literal([c])})`;
const sync=(name,versions)=>JSON.parse(value('service_role',null,syncSql(`${run}-${++sequence}`,syncCandidate(name,versions))))[0];
const reject=id=>value('authenticated',editor,`select public.reject_staged_candidate('${id}','Synthetic rejection',false)`);
const sources=id=>JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('evidence',s.evidence_id,'alias',s.observed_alias,'relationship',s.relationship,'trust',s.trust_status)),'[]') from public.governance_rejection_sources s join public.governance_rejections r on r.id=s.rejection_id where r.staged_id='${id}'`));
const permutations=a=>a.length<2?[a]:a.flatMap((x,i)=>permutations([...a.slice(0,i),...a.slice(i+1)]).map(p=>[x,...p]));

// ---- F1: unsupported isolation is refused before any lock or write. ----
const levels=['repeatable read','serializable','read uncommitted'],isolationError=/GV007.*READ COMMITTED/s;
const atLevel=(level,role,uid,body)=>'\\set VERBOSITY verbose\n'+actor(role,uid,body).replace('begin;',`begin isolation level ${level};`);
const owner=stage('blockers-owner-'+run,u('owner'));approve(owner,payload('blockers-owner-'+run,u('owner')));
const pending=discover('isolation-pending-'+run,u('isolation-pending')),rejected=discover('isolation-rejected-'+run,u('isolation-rejected'));reject(rejected.stagedId);
const state=()=>sql(`select md5(coalesce((select jsonb_agg(to_jsonb(s) order by id)::text from public.staged_guidelines s),'')||coalesce((select jsonb_agg(to_jsonb(e) order by id)::text from public.staged_discovery_evidence e),'')||coalesce((select jsonb_agg(to_jsonb(d) order by id)::text from public.staged_discovery_decisions d),'')||coalesce((select jsonb_agg(to_jsonb(g) order by id)::text from public.guidelines g),'')||coalesce((select jsonb_agg(to_jsonb(g) order by id)::text from public.governance_evidence g),'')||coalesce((select jsonb_agg(to_jsonb(g) order by rejection_id)::text from public.governance_rejection_releases g),'')||coalesce((select jsonb_agg(to_jsonb(g) order by id)::text from public.governance_reconsideration_signals g),''))`);
const pendingData=payload('isolation-pending-'+run,u('isolation-pending')),rawInsertStaged=`insert into public.staged_guidelines(candidate_id,provider,topic,change_reason,primary_url,versions,review_status) values('direct-${run}','SYNTHETIC','Synthetic','NEW_GUIDELINE','${u('direct')}','[{"url":"${u('direct')}"}]','pending')`,rawInsertEvidence=`insert into public.staged_discovery_evidence(staged_id,discovery_run_id,producer,discovery_id,report_schema_version,discovered_url,surface_url,observed_topic,observed_at,row_match_basis) values('${pending.stagedId}','direct-${run}','discover','direct-${run}',1,'${u('isolation-pending')}','${u('index')}','Synthetic',now(),'identity')`;
const entries=[
 ['approve_staged_guideline','authenticated',editor,`select public.approve_staged_guideline('${pending.stagedId}',${literal(pendingData)},'Synthetic')`],
 ['reject_staged_candidate','authenticated',editor,`select public.reject_staged_candidate('${pending.stagedId}','Synthetic',false)`],
 ['resolve_discovery_candidate','authenticated',editor,`select public.resolve_discovery_candidate('${pending.stagedId}','defer','Synthetic')`],
 ['record_clinical_review','authenticated',editor,`select public.record_clinical_review('${pending.stagedId}',${literal(pendingData)},'Synthetic')`],
 ['release_rejected_document','authenticated',editor,`select public.release_rejected_document('${u('isolation-rejected')}','Synthetic')`],
 ['record_rejected_revision_signal','service_role',null,`select public.record_rejected_revision_signal('${run}-iso','discover','${u('isolation-rejected')}','{"synthetic":true}')`],
 ['stage_discovery_candidate','service_role',null,discoverSql(`${run}-iso`,'isolation-new-'+run,u('isolation-new'))],
 ['staged queue trigger (owner path)','postgres',null,rawInsertStaged],
 ['evidence trigger (owner path)','postgres',null,rawInsertEvidence],
];
const before=state();
for(const level of levels){
 for(const [name,role,uid,body] of entries)await test(`F1 ${level} refused at ${name}`,()=>refused(()=>sql(atLevel(level,role,uid,body)),isolationError));
 await test(`F1 ${level} sync producer reports GV007 and files nothing`,()=>{const r=JSON.parse(sql(atLevel(level,'service_role',null,syncSql(`${run}-iso-${level.replace(' ','-')}`,syncCandidate(`iso-sync-${level.replace(' ','-')}-${run}`,[{url:u('iso-sync-'+level.replace(' ','-')),label:'Synthetic'}])))).split('\n').at(-1))[0];return r.status==='failed'&&r.code==='GV007';});
}
await test('F1 refused modes leave every governed table unchanged',()=>state()===before);
await test('F1 a session default of repeatable read is also refused',()=>refused(()=>sql(`\\set VERBOSITY verbose\nset default_transaction_isolation='repeatable read';\n${actor('authenticated',editor,`select public.approve_staged_guideline('${pending.stagedId}',${literal(pendingData)},'Synthetic')`)}`),isolationError));
await test('F1 the only pipeline-lock call is inside the guarded helper',()=>sql("select string_agg(p.proname,',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%pg_advisory_xact_lock(20261107%'")==='_governance_acquire_pipeline_lock');
await test('F1 every serialised entry point uses the guarded helper',()=>sql(`select count(*) from unnest(array['approve_staged_guideline','reject_staged_candidate','resolve_discovery_candidate','stage_discovery_candidate','_stage_sync_candidate','record_clinical_review','release_rejected_document','record_rejected_revision_signal','_governance_queue_guard','_governance_evidence_lock','_governance_prepare']) f where exists(select 1 from pg_proc p where p.proname=f and p.prosrc like '%_governance_acquire_pipeline_lock()%')`)==='11');
for(const role of ['anon','authenticated','service_role'])await test('F1 helper is not callable by '+role,()=>sql(`select has_function_privilege('${role}','public._governance_acquire_pipeline_lock()','EXECUTE')`)==='f');
const session=(text,onMarker)=>new Promise(resolve=>{const c=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{windowsHide:true,timeout:20000});let stdout='',stderr='';c.stdout.on('data',d=>stdout+=d);c.stderr.on('data',d=>{stderr+=d;if(onMarker&&stderr.includes('BLOCKER_HELD')){onMarker();onMarker=null;}});c.on('close',code=>resolve({code,stdout,stderr}));c.stdin.end(text);});
const holdingProducer=async(name,source)=>{let signal;const marker=new Promise(r=>signal=r),obs={classification:'NEW_GUIDELINE',discoveryId:name,discoveredUrl:source,sourceUrlKey:key(source),topic:'Synthetic',provider:'SYNTHETIC',surfaceUrl:u('index'),observedAt:new Date().toISOString(),urlAlternatives:[{url:u('owner'),scope:'document',relation:'redirect-target'}]};const done=session(actor('service_role',null,`select public.stage_discovery_candidate('${run}-hold-${name}','discover',${literal(obs)});do $$begin raise notice 'BLOCKER_HELD';end$$;select pg_sleep(1.5)`),signal);await Promise.race([marker,done.then(r=>{if(r.code)throw Error(r.stderr);})]);return done;};
for(const level of ['repeatable read','serializable']){
 const slug=level.replace(' ','-'),source=u('race-'+slug),name=`race-${slug}-${run}`,c=discover(name,source);
 const producer=await holdingProducer(name,source);
 const data=payload(name,source),approval=await session('\\set VERBOSITY verbose\n'+actor('authenticated',editor,`select public.approve_staged_guideline('${c.stagedId}',${literal(data)},'Synthetic stale snapshot')`).replace('begin;',`begin isolation level ${level};`));
 const committed=await producer;
 await test(`F1 reported ${level} stale-snapshot publication now fails closed`,()=>approval.code!==0&&isolationError.test(approval.stderr)&&committed.code===0&&sql(`select count(*) from public.guidelines where id='${name}'`)==='0'&&sql(`select review_status from public.staged_guidelines where id='${c.stagedId}'`)==='pending');
 await test(`F1 after ${level} refusal the READ COMMITTED retry sees the committed conflict`,()=>refused(()=>approve(c.stagedId,data),/already held/));
}
{const source=u('rr-producer'),name='rr-producer-'+run,c=discover(name,source),count=()=>sql(`select count(*) from public.staged_discovery_evidence where staged_id='${c.stagedId}'`),n=count();
 await test('F1 repeatable-read producer cannot append evidence',()=>refused(()=>sql(atLevel('repeatable read','service_role',null,discoverSql(`${run}-rr-producer`,name,source,[{url:u('owner'),scope:'document',relation:'redirect-target'}]))),isolationError)&&count()===n);}

// ---- F2: rejection memory is independent of observation order. ----
const doc=url=>({url,scope:'document',relation:'redirect-target'}),nav=(url,scope)=>({url,scope,relation:'redirect-target'});
const orders=[...permutations(['index','document']),...permutations(['index','document','fallback']),...permutations(['navigation','document'])];
for(const order of orders){
 const slug=order.join('-'),a=u('a-'+slug),b=u('b-'+slug),alts=order.map(s=>s==='document'?doc(b):nav(b,s));
 const r=discover('a-'+slug+run,a,alts);reject(r.stagedId);const rows=sources(r.stagedId).filter(x=>x.alias===b);const c=discover('b-'+slug+run,b);
 await test(`F2 discover ${order.join(' then ')} holds the alias`,()=>refused(()=>approve(c.stagedId,payload('b-'+slug+run,b)),/comparison required/));
 // P2-2: each declared role is now retained as its own provenance (index and fallback no longer collapse into one
 // "navigation-only" class), so "once" means exactly one row per distinct declared role, regardless of order.
 const expected=new Set(order.map(s=>s==='document'?'comparison-only; equivalence not established':`comparison-only; producer-declared ${s} role unverified; equivalence not established`));
 await test(`F2 discover ${order.join(' then ')} keeps each classification once`,()=>new Set(rows.map(x=>x.trust)).size===expected.size&&rows.length===expected.size&&rows.every(x=>expected.has(x.trust)&&x.evidence&&x.relationship==='redirect-target'&&x.trust.endsWith('equivalence not established')));
}
for(const labels of permutations(['Fallback / index page','Synthetic document'])){
 const slug=labels[0].startsWith('F')?'fallback-first':'document-first',a=u('sync-a-'+slug),b=u('sync-b-'+slug);
 // R1: navigation is declared by explicit scope; the label alone is never classified (see scope-classification.security.mjs).
 const r=sync('sync-a-'+slug+run,[{url:a,label:'Synthetic'},...labels.map(label=>label.startsWith('F')?{url:b,label,scope:'fallback'}:{url:b,label})]);reject(r.stagedId);const rows=sources(r.stagedId).filter(x=>x.alias===b);const c=sync('sync-b-'+slug+run,[{url:b,label:'Synthetic'}]);
 await test(`F2 sync ${slug} holds the alias`,()=>refused(()=>approve(c.stagedId,payload('sync-b-'+slug+run,b)),/comparison required/));
 await test(`F2 sync ${slug} retains both classes for observed and staged versions`,()=>['observed-version','staged-version'].every(rel=>new Set(rows.filter(x=>x.relationship===rel).map(x=>x.trust)).size===2)&&rows.length===4);
}
for(const order of permutations(['index','fallback'])){
 const slug=order.join('-'),a=u('nav-a-'+slug),b=u('nav-b-'+slug),r=discover('nav-a-'+slug+run,a,order.map(s=>nav(b,s)));reject(r.stagedId);const c=discover('nav-b-'+slug+run,b);
 // P2-2 (962fca4 review): producer-declared navigation roles are unverifiable, so the shared page requires review
 // instead of being exempted (previously asserted to publish). The claims are kept, never discarded.
 await test(`F2 producer-declared shared navigation page (${slug}) requires review and keeps both claims`,()=>refused(()=>approve(c.stagedId,payload('nav-b-'+slug+run,b)),/comparison required/)&&sources(r.stagedId).filter(x=>x.alias===b).map(x=>x.trust).sort().join('|')===order.map(s=>`comparison-only; producer-declared ${s} role unverified; equivalence not established`).sort().join('|'));
}
for(const [first,second,slug] of [[nav,doc,'index-then-document'],[doc,nav,'document-then-index']]){
 const a=u('late-a-'+slug),b=u('late-b-'+slug),name='late-a-'+slug+run,mk=f=>f===doc?doc(b):nav(b,'index');
 const r=discover(name,a,[mk(first)]);reject(r.stagedId);discover(name,a,[mk(second)]);const c=discover('late-b-'+slug+run,b);
 await test(`F2 late evidence ${slug} holds the alias`,()=>refused(()=>approve(c.stagedId,payload('late-b-'+slug+run,b)),/comparison required/));
 const count=sql(`select count(*) from public.governance_rejection_sources`);sql(`select public._governance_snapshot_rejection('${r.stagedId}')`);sql(`select public._governance_snapshot_rejection('${r.stagedId}')`);
 await test(`F2 replayed snapshot (${slug}) adds no duplicate signal`,()=>sql(`select count(*) from public.governance_rejection_sources`)===count);
}
{const a=u('release-a'),b=u('release-b'),r=discover('release-a-'+run,a,[nav(b,'index'),doc(b)]);reject(r.stagedId);const c=discover('release-b-'+run,b),evidence=sql(`select md5(jsonb_agg(to_jsonb(e) order by id)::text) from public.staged_discovery_evidence e where staged_id='${r.stagedId}'`);
 await test('F2 unlisted account cannot lift a comparison hold',()=>refused(()=>value('authenticated',outsider,`select public.release_rejected_document('${a}','Synthetic')`),/Named editor/));
 await test('F2 attributed release publishes the alias as its own entry, documents unmerged',()=>{value('authenticated',editor,`select public.release_rejected_document('${a}','Synthetic attributed reconsideration')`);approve(c.stagedId,payload('release-b-'+run,b));return sql(`select count(*) from public.guidelines where id='release-b-${run}' and jsonb_array_length(versions)=1 and versions->0->>'url'='${b}'`)==='1'&&sql(`select count(*) from public.guidelines g,jsonb_array_elements(g.versions) v where v->>'url'='${a}'`)==='0';});
 await test('F2 original evidence is unchanged by classification and release',()=>sql(`select md5(jsonb_agg(to_jsonb(e) order by id)::text) from public.staged_discovery_evidence e where staged_id='${r.stagedId}'`)===evidence);}
await test('F2 no signal anywhere asserts document equivalence',()=>sql("select count(*) from public.governance_rejection_sources where trust_status not like '%equivalence not established'")==='0');
fs.writeFileSync(out+'/final-blockers-runtime.json',JSON.stringify({container,passed,failed,outcomes},null,2)+'\n');console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
