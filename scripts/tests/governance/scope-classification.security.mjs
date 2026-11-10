/** R1/R2 conditional-acceptance regressions: rejection-memory classification uses explicit, validated scope, never labels.
 * Disposable network-none lab; synthetic rows only. Run after rehearse.mjs on the same --lab. */
import fs from 'node:fs';import {sql,actor,editor,payload,literal,approve,container} from './db-harness.mjs';
if(!process.argv.some(a=>a.startsWith('--lab=')))throw Error('Explicit new lab required');
const out='reports/conditional-followup';fs.mkdirSync(out,{recursive:true});
const run=Date.now().toString(36),u=n=>'https://synthetic.example.test/scope/'+run+'/'+n;
let passed=0,failed=0,sequence=0;const outcomes=[];
const test=(name,fn)=>{try{if(fn()===false)throw Error('Assertion false');passed++;outcomes.push({name,status:'passed'});console.log('PASS '+name);}catch(e){failed++;outcomes.push({name,status:'failed',error:e.message.split('\n')[0]});console.log('FAIL '+name+': '+e.message.split('\n')[0]);}};
const value=(role,uid,q)=>sql(actor(role,uid,q)).split('\n').at(-1);
const refused=(fn,re)=>{try{fn();return false;}catch(e){if(re.test(e.message))return true;throw e;}};
const key=url=>sql(`select public.document_identity_key('${url}')`),match=url=>sql(`select public.document_match_key('${url}')`);
const discover=(name,url,alts=[],surface=u('publisher-index'))=>JSON.parse(value('service_role',null,`select public.stage_discovery_candidate('${run}-${++sequence}','discover',${literal({classification:'NEW_GUIDELINE',discoveryId:name,discoveredUrl:url,sourceUrlKey:key(url),topic:'Synthetic',provider:'SYNTHETIC',surfaceUrl:surface,observedAt:new Date().toISOString(),urlAlternatives:alts})})`));
const syncCandidate=(name,versions)=>({candidateId:name,pipeline:'sync-providers',provider:'SYNTHETIC',topic:'Synthetic',changeReason:'NEW_GUIDELINE',versions,primaryUrl:match(versions[0].url),sourceUrlKey:key(versions[0].url),discoveredAt:new Date().toISOString()});
const sync=(name,versions)=>JSON.parse(value('service_role',null,`select public.stage_sync_candidates('${run}-${++sequence}',${literal([syncCandidate(name,versions)])})`))[0];
const reject=id=>value('authenticated',editor,`select public.reject_staged_candidate('${id}','Synthetic rejection',false)`);
const trust=(id,alias)=>sql(`select coalesce(string_agg(distinct s.trust_status,'|' order by s.trust_status),'') from public.governance_rejection_sources s join public.governance_rejections r on r.id=s.rejection_id where r.staged_id='${id}' and s.observed_alias='${alias}'`);
const outcome=(id,pid,url)=>{try{approve(id,payload(pid,url));return 'published';}catch(e){return /comparison required/.test(e.message)?'held: comparison':e.message.split('\n')[0];}};
const staged=name=>sql(`select count(*) from public.staged_guidelines where candidate_id like '%${name}%'`);

// ---- R1: genuine document titles containing pattern words keep the rejection hold. ----
const titles=['Oswestry Disability Index (ODI) guideline','Fragility Fracture Index guidance PDF','Index finger fracture management','Body Mass Index thresholds for arthroplasty','Resource centre: national hip fracture guideline','Fallback antibiotic prophylaxis protocol','BOAST: Fallback / index page'];
titles.forEach((label,i)=>{
 const a=u('r1-a-'+i),b=u('r1-b-'+i),r=sync('r1-a-'+i+run,[{url:a,label:'Synthetic'},{url:b,label}]);reject(r.stagedId);
 const c=sync('r1-b-'+i+run,[{url:b,label:'Synthetic'}]);
 test(`R1 unscoped document label ${JSON.stringify(label)} keeps the comparison hold`,()=>outcome(c.stagedId,'r1-b-'+i+run,b)==='held: comparison');
 test(`R1 unscoped label ${JSON.stringify(label)} is classified comparison-only for observed and staged versions`,()=>trust(r.stagedId,b)==='comparison-only; equivalence not established');
});
{const a=u('r1-doc-a'),b=u('r1-doc-b'),r=sync('r1-doc-a'+run,[{url:a,label:'Synthetic'},{url:b,label:'Index finger fracture management',scope:'document'}]);reject(r.stagedId);const c=sync('r1-doc-b'+run,[{url:b,label:'Synthetic'}]);
 test('R1 explicit document scope with an index-like title keeps the comparison hold',()=>outcome(c.stagedId,'r1-doc-b'+run,b)==='held: comparison');}
for(const scope of ['index','fallback','navigation']){const a=u('r1-nav-a-'+scope),b=u('r1-nav-b-'+scope),r=sync('r1-nav-a-'+scope+run,[{url:a,label:'Synthetic'},{url:b,label:'Synthetic',scope}]);reject(r.stagedId);const c=sync('r1-nav-b-'+scope+run,[{url:b,label:'Synthetic'}]);
 test(`R1 explicit ${scope} scope on a version is navigation-only, so an unrelated document is not held`,()=>outcome(c.stagedId,'r1-nav-b-'+scope+run,b)==='published'&&trust(r.stagedId,b)==='navigation-only; equivalence not established');}
for(const bad of ['Index','INDEX',' index','doc','',7,null,{kind:'index'}]){const slug=(++sequence)+'',a=u('r1-bad-'+slug);
 test(`R1 sync version scope ${JSON.stringify(bad)} is refused atomically`,()=>{let r;try{r=sync('r1-bad-'+slug+run,[{url:a,label:'Synthetic',scope:bad}]);}catch(e){return /GV005|scope/i.test(e.message)&&staged('r1-bad-'+slug+run)==='0';}return r.status==='failed'&&r.code==='GV005'&&staged('r1-bad-'+slug+run)==='0';});
 test(`R1 discovery alternative scope ${JSON.stringify(bad)} is refused atomically`,()=>refused(()=>discover('r1-badalt-'+slug+run,u('r1-badalt-'+slug),[{url:u('r1-badalt-target-'+slug),scope:bad,relation:'redirect-target'}]),/GV005|scope/i)&&staged('r1-badalt-'+slug+run)==='0');}
{// Legacy rows stored before validation: unscoped or malformed scope stays conservative.
 const a=u('r1-legacy-a'),b=u('r1-legacy-b'),c2=u('r1-legacy-c');
 const r=sync('r1-legacy-a'+run,[{url:a,label:'Synthetic'}]);
 sql(`alter table public.staged_discovery_evidence disable trigger governance_evidence_lock; insert into public.staged_discovery_evidence(staged_id,discovery_run_id,producer,discovery_id,report_schema_version,discovered_url,observed_at,observed_versions) values('${r.stagedId}','${run}-legacy','sync-providers','${run}-legacy-obs',1,'${a}',now(),${literal([{url:b,label:'Fallback / index page'},{url:c2,label:'Synthetic',scope:'Index'}])}); alter table public.staged_discovery_evidence enable trigger governance_evidence_lock;`);
 reject(r.stagedId);
 test('R1 legacy unscoped "Fallback / index page" label is held conservatively (comparison-only)',()=>trust(r.stagedId,b)==='comparison-only; equivalence not established'&&outcome(sync('r1-legacy-b'+run,[{url:b,label:'Synthetic'}]).stagedId,'r1-legacy-b'+run,b)==='held: comparison');
 test('R1 legacy malformed scope is held conservatively (comparison-only)',()=>trust(r.stagedId,c2)==='comparison-only; equivalence not established');}

// ---- R2: a shared publisher index page is provenance, not identity; uncertain claims stay review-only. ----
const surface=u('publisher-index'),requested=u('publisher-index-requested');
const bound={url:surface,scope:'surface',relation:'redirect-target',derivedFrom:requested};
{const a=u('r2-a'),b=u('r2-b'),r=discover('r2-a'+run,a,[bound],requested);reject(r.stagedId);const c=discover('r2-b'+run,b,[bound],requested);
 test('R2 unrelated document sharing only a recorded publisher-index redirect is not held',()=>outcome(c.stagedId,'r2-b'+run,b)==='published');
 test('R2 shared surface provenance is retained, never discarded, and asserts no equivalence',()=>trust(r.stagedId,surface)==='navigation-only; surface provenance; equivalence not established');}
for(const [slug,alt,surfaceUrl] of [['unbound',{url:surface,scope:'surface',relation:'redirect-target'},requested],['mismatched',{url:surface,scope:'surface',relation:'redirect-target',derivedFrom:u('some-other-page')},requested],['document-derived',{url:surface,scope:'surface',relation:'redirect-target',derivedFrom:u('r2u-a-document-derived')},requested]]){
 const a=u('r2u-a-'+slug),b=u('r2u-b-'+slug),r=discover('r2u-a-'+slug+run,a,[alt],surfaceUrl);reject(r.stagedId);const c=discover('r2u-b-'+slug+run,b,[{url:surface,scope:'document',relation:'redirect-target'}],surfaceUrl);
 test(`R2 ${slug} surface claim is not provenance-verified, so it stays review-only`,()=>outcome(c.stagedId,'r2u-b-'+slug+run,b)==='held: comparison'&&trust(r.stagedId,surface)==='comparison-only; equivalence not established');}
for(const order of [['surface','document'],['document','surface']]){const slug=order.join('-'),a=u('r2o-a-'+slug),x=u('r2o-x-'+slug);
 const alts=order.map(s=>s==='surface'?{url:x,scope:'surface',relation:'redirect-target',derivedFrom:requested}:{url:x,scope:'document',relation:'redirect-target'});
 const r=discover('r2o-a-'+slug+run,a,alts,requested);reject(r.stagedId);const c=discover('r2o-b-'+slug+run,x);
 test(`R2 ${order.join(' then ')}: any document-level observation still holds (order-independent)`,()=>outcome(c.stagedId,'r2o-b-'+slug+run,x)==='held: comparison'&&trust(r.stagedId,x).split('|').length===2);}
{// No automatic duplicate exemptions: candidate-side surface URLs are still checked against the catalogue and rejections.
 const owner=u('r2-owner'),c0=discover('r2-owner'+run,owner);approve(c0.stagedId,payload('r2-owner'+run,owner));
 const b=u('r2-dup-b'),c=discover('r2-dup-b'+run,b,[{url:owner,scope:'surface',relation:'redirect-target',derivedFrom:requested}],requested);
 test('R2 a surface URL already held by a catalogue entry still blocks publication (no duplicate exemption)',()=>/already held/.test(outcome(c.stagedId,'r2-dup-b'+run,b)));
 const a=u('r2-rej-a'),r=discover('r2-rej-a'+run,a,[],requested);reject(r.stagedId);const d=discover('r2-rej-b'+run,u('r2-rej-b'),[{url:a,scope:'surface',relation:'redirect-target',derivedFrom:requested}],requested);
 test('R2 a surface URL that is itself a rejected document still blocks publication',()=>/unreleased rejection|comparison required/.test(outcome(d.stagedId,'r2-rej-b'+run,u('r2-rej-b'))));}
test('R1/R2 no rejection signal asserts equivalence',()=>sql("select count(*) from public.governance_rejection_sources where trust_status not like '%equivalence not established'")==='0');
fs.writeFileSync(out+'/scope-classification-runtime.json',JSON.stringify({container,run,passed,failed,outcomes},null,2)+'\n');console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
