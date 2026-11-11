/** Final review conditions (962fca4 review): P2-2 producer-declared roles, P2-3 scope contract, P3-1, P3-2, P3-5.
 * Disposable network-none lab prepared by rehearse.mjs; synthetic rows only. */
import fs from 'node:fs';import {sql,actor,editor,payload,literal,approve,stage,container} from './db-harness.mjs';
if(!process.argv.some(a=>a.startsWith('--lab=')))throw Error('Explicit new lab required');
const out='reports/final-review-conditions';fs.mkdirSync(out,{recursive:true});
const run=Date.now().toString(36),u=n=>'https://synthetic.example.test/conditions/'+run+'/'+n;
let passed=0,failed=0,sequence=0;const outcomes=[];
const test=(name,fn)=>{try{if(fn()===false)throw Error('Assertion false');passed++;outcomes.push({name,status:'passed'});console.log('PASS '+name);}catch(e){failed++;outcomes.push({name,status:'failed',error:e.message.split('\n')[0]});console.log('FAIL '+name+': '+e.message.split('\n')[0]);}};
const value=(role,uid,q)=>sql(actor(role,uid,q)).split('\n').at(-1);
const refused=(fn,re)=>{try{fn();return false;}catch(e){if(re.test(e.message))return true;throw e;}};
const key=url=>sql(`select public.document_identity_key('${url}')`),match=url=>sql(`select public.document_match_key('${url}')`);
const discoverSql=(name,url,alts=[],surface=u('publisher-index'))=>`select public.stage_discovery_candidate('${run}-${++sequence}','discover',${literal({classification:'NEW_GUIDELINE',discoveryId:name,discoveredUrl:url,sourceUrlKey:key(url),topic:'Synthetic',provider:'SYNTHETIC',surfaceUrl:surface,observedAt:new Date().toISOString(),urlAlternatives:alts})})`;
const discover=(...a)=>JSON.parse(value('service_role',null,discoverSql(...a)));
const sync=(name,versions)=>JSON.parse(value('service_role',null,`select public.stage_sync_candidates('${run}-${++sequence}',${literal([{candidateId:name,pipeline:'sync-providers',provider:'SYNTHETIC',topic:'Synthetic',changeReason:'NEW_GUIDELINE',versions,primaryUrl:match(versions[0].url),sourceUrlKey:key(versions[0].url),discoveredAt:new Date().toISOString()}])})`))[0];
const reject=id=>value('authenticated',editor,`select public.reject_staged_candidate('${id}','Synthetic rejection',false)`);
const trust=(id,alias)=>sql(`select coalesce(string_agg(distinct s.trust_status,'|' order by s.trust_status),'') from public.governance_rejection_sources s join public.governance_rejections r on r.id=s.rejection_id where r.staged_id='${id}' and s.observed_alias='${alias}'`);
const outcome=(id,pid,url,extra={})=>{try{approve(id,payload(pid,url,extra));return 'published';}catch(e){return /comparison required/.test(e.message)?'held: comparison':e.message.split('\n')[0];}};
const staged=name=>sql(`select count(*) from public.staged_guidelines where candidate_id like '%${name}%'`);
const syncRefused=(name,versions)=>{let r;try{r=sync(name,versions);}catch(e){return /GV005|scope/i.test(e.message)&&staged(name)==='0';}return r.status==='failed'&&r.code==='GV005'&&staged(name)==='0';};

// ---- P2-2: a producer-declared non-document role is recorded but cannot bypass document comparison. ----
for(const scope of ['index','fallback','navigation']){
 const a=u('p22-sync-a-'+scope),b=u('p22-sync-b-'+scope),r=sync('p22-sync-a-'+scope+run,[{url:a,label:'Synthetic'},{url:b,label:'Oswestry Disability Index (ODI) guideline',scope}]);reject(r.stagedId);
 const c=sync('p22-sync-b-'+scope+run,[{url:b,label:'Synthetic'}]);
 test(`P2-2 sync-declared ${scope} on a genuine document keeps the comparison hold`,()=>outcome(c.stagedId,'p22-sync-b-'+scope+run,b)==='held: comparison');
 test(`P2-2 sync-declared ${scope} is retained as an unverified producer claim, comparison-only`,()=>trust(r.stagedId,b)===`comparison-only; producer-declared ${scope} role unverified; equivalence not established`);
}
for(const scope of ['index','fallback','navigation']){
 const a=u('p22-disc-a-'+scope),b=u('p22-disc-b-'+scope),r=discover('p22-disc-a-'+scope+run,a,[{url:b,scope,relation:'redirect-target'}]);reject(r.stagedId);const c=discover('p22-disc-b-'+scope+run,b);
 test(`P2-2 discovery-declared ${scope} alternative keeps the comparison hold`,()=>outcome(c.stagedId,'p22-disc-b-'+scope+run,b)==='held: comparison');
}
{const requested=u('p22-surface-requested'),x=u('p22-surface-final'),a=u('p22-surface-a'),b=u('p22-surface-b');
 const r=discover('p22-surface-a'+run,a,[{url:x,scope:'surface',relation:'redirect-target',derivedFrom:requested}],requested);reject(r.stagedId);const c=discover('p22-surface-b'+run,b,[{url:x,scope:'surface',relation:'redirect-target',derivedFrom:requested}],requested);
 test('P2-2 a self-consistent surface claim (derivedFrom = producer surfaceUrl) cannot exempt: shared page still requires review',()=>outcome(c.stagedId,'p22-surface-b'+run,b)==='held: comparison');
 test('P2-2 the surface claim is retained as provenance, comparison-only, asserting no equivalence',()=>trust(r.stagedId,x)==='comparison-only; producer-declared surface role unverified; equivalence not established');}
{const a=u('p22-mixed-a'),b=u('p22-mixed-b'),r=discover('p22-mixed-a'+run,a,[{url:b,scope:'index',relation:'redirect-target'},{url:b,scope:'document',relation:'redirect-target'}]);reject(r.stagedId);
 test('P2-2 a navigation declaration never erases the document observation (both retained)',()=>trust(r.stagedId,b).split('|').length===2&&trust(r.stagedId,b).includes('comparison-only; equivalence not established'));}
test('P2-2 no producer input can yield a navigation-only (exempt) trust status',()=>sql("select count(*) from public.governance_rejection_sources where trust_status not like 'comparison-only%'")==='0');

// ---- P3-2: legacy rows carrying a scope are treated exactly like new claims (conservative). ----
{const a=u('p32-a'),b=u('p32-b'),req=u('p32-requested'),r=sync('p32-a'+run,[{url:a,label:'Synthetic'}]);
 sql(`alter table public.staged_discovery_evidence disable trigger governance_evidence_lock; insert into public.staged_discovery_evidence(staged_id,discovery_run_id,producer,discovery_id,report_schema_version,discovered_url,surface_url,observed_at,observed_versions,url_alternatives) values('${r.stagedId}','${run}-legacy','discover','${run}-legacy-obs',1,'${a}','${req}',now(),${literal([{url:b,label:'Synthetic',scope:'index'}])},${literal([{url:u('p32-x'),scope:'surface',relation:'redirect-target',derivedFrom:req}])}); alter table public.staged_discovery_evidence enable trigger governance_evidence_lock;`);
 reject(r.stagedId);
 test('P3-2 legacy scope:index row is comparison-only, not exempt',()=>trust(r.stagedId,b).startsWith('comparison-only'));
 test('P3-2 legacy self-consistent surface row is comparison-only, not exempt',()=>trust(r.stagedId,u('p32-x')).startsWith('comparison-only'));}

// ---- P2-3: one validated contract; surface needs the discovery producer's recorded surface_url. ----
test('P2-3 sync version scope surface is refused atomically (sync records no surface_url)',()=>syncRefused('p23-sync-surface'+run,[{url:u('p23-sync-surface'),label:'Synthetic',scope:'surface'}]));
test('P2-3 a staged queue version with scope surface is refused',()=>refused(()=>stage('p23-staged-surface'+run,u('p23-staged-surface'),{versions:[{url:u('p23-staged-surface'),label:'Synthetic',scope:'surface'}]}),/GV005|surface/i));
test('P2-3 discovery surface alternative with a recorded surface_url is accepted (recorded, review-only)',()=>{const r=discover('p23-disc-surface'+run,u('p23-disc-surface'),[{url:u('p23-disc-surface-x'),scope:'surface',relation:'redirect-target',derivedFrom:u('publisher-index')}]);return Boolean(r.stagedId);});
for(const scope of ['document','index','fallback','navigation'])test(`P2-3 sync version scope ${scope} is accepted by the shared contract`,()=>sync('p23-sync-ok-'+scope+run,[{url:u('p23-sync-ok-'+scope),label:'Synthetic',scope}]).status==='staged');
test('P2-3 the database contract lists exactly the five shared scope values',()=>sql(`select string_agg(s,',' order by s) from unnest(array['document','surface','index','fallback','navigation','Index','doc','']) s where public._governance_scope_valid(jsonb_build_object('scope',s))`)==='document,fallback,index,navigation,surface');

// ---- P3-1: an omitted scope is document-level in the staging contradiction check too. ----
{const owner=u('p31-owner'),o=discover('p31-owner'+run,owner);approve(o.stagedId,payload('p31-owner'+run,owner));
 for(const [slug,alt] of [['unscoped',{url:owner,relation:'redirect-target'}],['document',{url:owner,scope:'document',relation:'redirect-target'}]])
  test(`P3-1 a NEW_GUIDELINE whose ${slug} alternative is catalogued is refused at staging`,()=>refused(()=>discover('p31-'+slug+run,u('p31-'+slug),[alt]),/contradicts NEW_GUIDELINE/)&&staged('p31-'+slug+run)==='0');}

// ---- P3-5: the receipt hint considers every URL the editor would publish or that the row observed. ----
{const a=u('p35-a'),x=u('p35-alias'),r=discover('p35-a'+run,a,[{url:x,scope:'document',relation:'redirect-target'}]);reject(r.stagedId);
 const c=discover('p35-c'+run,u('p35-c'));const hint=data=>JSON.parse(value('authenticated',editor,`select public.list_publication_receipts('${c.stagedId}',${literal(data)})`)).comparisonRequired;
 test('P3-5 receipt hint is false when no published or observed URL is held',()=>hint(payload('p35-c'+run,u('p35-c')))===false);
 test('P3-5 receipt hint reports a held secondary (alias) URL, not only the primary',()=>hint(payload('p35-c'+run,u('p35-c'),{versions:[{url:u('p35-c'),label:'Synthetic'},{url:x,label:'Synthetic alias'}]}))===true);
 test('P3-5 the hint agrees with the enforcing approval check',()=>outcome(c.stagedId,'p35-c'+run,u('p35-c'),{versions:[{url:u('p35-c'),label:'Synthetic'},{url:x,label:'Synthetic alias'}]})==='held: comparison');}
test('P3-5 forbid_mutation pins search_path',()=>/search_path=/.test(sql("select coalesce(array_to_string(proconfig,','),'') from pg_proc where oid='public.forbid_mutation()'::regprocedure")));
test('P3-5 append-only ledgers still refuse mutation after the search_path pin',()=>refused(()=>sql('update public.governance_rejection_sources set trust_status=trust_status'),/append-only|not permitted|42501|forbid|immutable/i));
fs.writeFileSync(out+'/final-conditions-runtime.json',JSON.stringify({container,run,passed,failed,outcomes},null,2)+'\n');console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
