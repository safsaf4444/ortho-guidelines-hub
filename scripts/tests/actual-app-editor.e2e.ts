/**
 * Drives the REAL App entry (not the standalone receipt fixture) with a synthetic
 * signed-in editor. Auth and PostgREST are intercepted loopback mocks: no real
 * Supabase, Auth, source retrieval or clinical publication occurs. All other
 * non-local traffic is aborted and asserted empty.
 */
import fs from 'node:fs';import net from 'node:net';import path from 'node:path';import {spawn} from 'node:child_process';import {chromium,type Dialog,type Page} from 'playwright';import assert from 'node:assert/strict';
const out='reports/final-acceptance-blockers';fs.mkdirSync(out,{recursive:true});
let passed=0;const outcomes:string[]=[];const check=(name:string,value:boolean)=>{assert.ok(value,name);passed++;outcomes.push(name);console.log('PASS '+name);};
for(const file of ['.env','.env.local','.env.development','.env.development.local'])if(fs.existsSync(file))throw Error('Private env forbidden');
const sock=net.createServer();await new Promise<void>(r=>sock.listen(0,'127.0.0.1',r));const addr=sock.address();if(!addr||typeof addr==='string')throw Error('No port');const port=addr.port;await new Promise<void>(r=>sock.close(()=>r()));
const origin='http://127.0.0.1:'+port,api='http://127.0.0.1:54321';
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(k.toUpperCase()))),VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_ACTUAL_APP'};
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,windowsHide:true,stdio:'pipe'});
type Call={name:string;body:Record<string,unknown>};const calls:Call[]=[],blocked:string[]=[],errors:string[]=[],alerts:string[]=[];
const url='https://synthetic.example.test/actual-app',stagedId='00000000-0000-4000-8000-000000000099';
const row={id:stagedId,candidate_id:'synthetic-actual-app',schema_version:1,pipeline:'discovery',provider:'SYNTHETIC',provider_name:'Synthetic publisher',source:'Synthetic publisher',topic:'Synthetic acceptance candidate',summary:'Synthetic only',notes:'Synthetic only',versions:[{url,label:'Synthetic'}],primary_url:url,identity_key:url,match_key:url,change_reason:'NEW_GUIDELINE',review_status:'pending',producer:'discover',discovered_at:'2026-11-09T00:00:00Z',review_outcome:null,review_note:null,reviewed_by:null,reviewed_at:null,matched_guideline_id:null,resulting_guideline_id:null,changed_url:null};
const dbGuideline=(id:string,topic:string,link:string)=>({id,section:'Synthetic',type:'Synthetic',topic,sub_group:null,source:'Synthetic publisher',summary:'Synthetic only',notes:'',status:'Drafted',regional_variation:false,local_overlay_needed:false,last_checked:'2026-11-09',cross_listed_in:[],priority:null,archived:false,source_access_status:null,versions:[{url:link,label:'Synthetic'}],link_verification_status:'unchecked',link_last_verified:null,link_verification_notes:null,content_hashes:{},last_change_check:null,source_type:'national',guidance_status:'needs-review',scope_note:null,editorial_review_date:null,inclusion_reason:'Synthetic fixture only'});
let catalogue=[dbGuideline('synthetic-existing','Synthetic existing entry','https://synthetic.example.test/existing')];
let approveMode:'refuse'|'lost'|'isolation'|'ok'='refuse',receiptSeq=0,catalogueReads=0;const receipts:Array<{id:string;payload:string}>=[];
const payloadKey=(data:unknown)=>{const {verification_evidence_id:_v,clinical_review_evidence_id:_c,...rest}=data as Record<string,unknown>;return JSON.stringify(rest);};
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;let lastAlert='';
const onDialog=(d:Dialog)=>{alerts.push(d.message());lastAlert=d.message();void d.accept();};
async function settle(page:Page){await page.waitForTimeout(400);}
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/ortho-guidelines-hub/')).ok)break;}catch{/* starting */}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 const user={id:'00000000-0000-4000-8000-000000000001',email:'editor@example.invalid',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'},exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp,role:'authenticated'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.c3ludGhldGlj';
 await context.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),{user,access_token:token,refresh_token:'SYNTHETIC',expires_at:exp,expires_in:3600,token_type:'bearer'});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin!==api){blocked.push(u.hostname);return route.abort();}
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const reply=(json:unknown,status=200)=>route.fulfill({status,json,headers:cors});
  if(u.pathname.startsWith('/auth/'))return reply(u.pathname.endsWith('/logout')?{}:user);
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1)!,body=(req.postDataJSON()??{}) as Record<string,unknown>;calls.push({name,body});
   if(name==='list_governance_review_events')return reply({lateEvidence:[],revisionSignals:[]});
   if(name==='list_publication_receipts')return reply({receipts:receipts.map(r=>({id:r.id,kind:'clinical-review',outcome:null,observedAt:'2026-11-09T00:00:00Z',actor:'synthetic-editor',note:'Synthetic review '+r.id.slice(-2),eligible:r.payload===payloadKey(body.p_data)})),availabilityPolicyConfigured:false,payloadFingerprint:'synthetic',comparisonRequired:false});
   if(name==='record_clinical_review'){const id='00000000-0000-4000-8000-'+String(++receiptSeq).padStart(12,'0');receipts.push({id,payload:payloadKey(body.p_data)});return reply(id);}
   if(name==='approve_staged_guideline'){
    if(approveMode==='refuse')return reply({code:'GV003',message:'Current guidance requires attributed clinical review of this exact candidate payload',details:null,hint:null},400);
    if(approveMode==='isolation')return reply({code:'GV007',message:'Editorial governance writes require READ COMMITTED',details:null,hint:null},400);
    if(approveMode==='lost')return route.abort('connectionreset');
    const data=body.p_final_guideline_data as {id:string;topic:string};catalogue=[...catalogue,dbGuideline(data.id,data.topic,url)];row.review_status='accepted';await new Promise(r=>setTimeout(r,250));return reply(data.id);}
   return reply({message:'Unexpected synthetic RPC '+name},403);}
  if(u.pathname.endsWith('/guidelines')){catalogueReads++;return reply(catalogue);}
  if(u.pathname.endsWith('/staged_guidelines'))return reply(row.review_status==='pending'?[row]:[]);
  if(u.pathname.startsWith('/rest/v1/'))return reply([]);
  return reply({message:'Unexpected synthetic path'},404);});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',onDialog);
 await page.goto(origin+'/ortho-guidelines-hub/');await page.getByRole('button',{name:'Administration',exact:true}).waitFor();check('session controls stay out of clinician navigation',await page.getByRole('button',{name:/Sign out/i}).count()===0);await page.getByRole('button',{name:'Administration',exact:true}).click();await page.getByRole('button',{name:'Review Staged Guidelines',exact:true}).waitFor();

 // Unsupported direct maintenance stays closed in the same signed-in session.
 check('direct card editing remains unavailable',await page.getByRole('button',{name:/^Edit\b/}).count()===0);
 const add=page.getByRole('button',{name:/Add (Guideline|New)/i});check('direct create remains unavailable',await add.count()===0||await add.first().isDisabled());

 const open=async()=>{await page.getByRole('button',{name:/Review & publish/}).first().click();const d=page.getByRole('dialog',{name:'Review & Publish Candidate',exact:true});await d.waitFor();return d;};
 await page.getByRole('button',{name:'Review Staged Guidelines',exact:true}).click();check('session sign-out remains available in review administration',await page.getByRole('button',{name:/Sign out/i}).count()===1);
 let dialog=await open();const publish=dialog.getByRole('button',{name:'Publish Guideline',exact:true}),evidence=dialog.getByRole('group',{name:'Publication review evidence'});
 check('staged modal offers publication',await publish.count()===1);
 check('receipt controls are enabled',await evidence.isEnabled());
 check('no read-only disclosure for a signed-in editor',await dialog.getByText('Review actions are unavailable in read-only mode.',{exact:true}).count()===0);
 check('staged modal has no direct archive control',await dialog.getByRole('button',{name:'Remove',exact:true}).count()===0);
 await dialog.getByText('Publication is blocked until',{exact:false}).waitFor();await settle(page);
 check('App fetched receipts for the exact candidate',calls.some(c=>c.name==='list_publication_receipts'&&c.body.p_staged_id===stagedId));
 check('publication is blocked before review and note',await publish.isDisabled());

 const reviewNote=dialog.getByLabel('Review evidence note',{exact:true}),statusBox=dialog.getByRole('checkbox',{name:/I explicitly reviewed/}),attest=dialog.getByRole('checkbox',{name:/I personally performed/}),clinicalSelect=dialog.getByLabel('Clinical review receipt',{exact:true});
 await dialog.locator('select').first().selectOption({index:1});await dialog.locator('select').nth(1).selectOption({index:1});await dialog.locator('select:has(option[value="current"])').first().selectOption('current');await settle(page);
 await dialog.locator('#change-note').fill('Synthetic publication note');
 check('receipt controls are not a collapsed nested scroller',await evidence.evaluate(e=>{const box=e as unknown as {scrollHeight:number;clientHeight:number};return box.scrollHeight<=box.clientHeight+2;}));
 const record=async(text:string)=>{await statusBox.check();await attest.check();await reviewNote.fill(text);await dialog.getByRole('button',{name:'Record clinical review of this payload'}).click();await dialog.getByText('Required evidence selected; database will revalidate at publication.',{exact:true}).waitFor();};
 check('current status stays blocked without a clinical receipt',await publish.isDisabled());
 await record('Synthetic first review');const firstId=await clinicalSelect.inputValue();
 check('recording a review selects its receipt',firstId==='00000000-0000-4000-8000-000000000001');check('publish becomes available with an exact receipt',await publish.isEnabled());

 // Any payload edit invalidates the receipt before it can be submitted.
 const topic=dialog.locator(`input[value="${row.topic}"]`).first();await topic.fill('Edited synthetic topic');
 check('payload edit immediately blocks publication',await publish.isDisabled());check('payload edit clears the selected receipt',await clinicalSelect.inputValue()==='');check('payload edit clears status confirmation',!(await statusBox.isChecked()));
 await settle(page);await record('Synthetic second review');const secondId=await clinicalSelect.inputValue();check('new receipt is bound after the edit',secondId==='00000000-0000-4000-8000-000000000002');

 const approvals=()=>calls.filter(c=>c.name==='approve_staged_guideline');
 const reads=catalogueReads;const attempt=async()=>{const n=approvals().length;await publish.click();await settle(page);assert.equal(approvals().length,n+1,'attempt must reach the RPC');};
 await attempt();
 check('database refusal is disclosed with its reason',lastAlert.startsWith('PUBLISH REFUSED')&&lastAlert.includes('exact candidate payload'));check('refusal keeps the draft open',await dialog.isVisible());check('refusal leaves catalogue unread and unclaimed',catalogueReads===reads);
 approveMode='isolation';await attempt();check('GV007 is reported as a refusal, not an unknown outcome',lastAlert.startsWith('PUBLISH REFUSED')&&lastAlert.includes('READ COMMITTED'));
 approveMode='lost';await attempt();check('lost response is not reported as success or refusal',lastAlert.startsWith('PUBLISH NOT CONFIRMED'));check('lost response keeps the draft open',await dialog.isVisible());check('lost response claims no publication',catalogueReads===reads);
 const before=approvals().length;approveMode='ok';await publish.dblclick();await dialog.waitFor({state:'detached'});await settle(page);
 check('double-click sends exactly one publication',approvals().length===before+1);
 const sent=approvals().at(-1)!.body,data=sent.p_final_guideline_data as Record<string,unknown>;
 check('RPC targets the exact staged candidate',sent.p_candidate_id===stagedId);check('RPC carries the selected clinical receipt ID',data.clinical_review_evidence_id===secondId);check('stale receipt ID is never sent',approvals().every(c=>(c.body.p_final_guideline_data as Record<string,unknown>).clinical_review_evidence_id!==firstId));check('RPC carries the edited payload',data.topic==='Edited synthetic topic'&&data.guidance_status==='current');check('RPC carries the change note',sent.p_changelog_note==='Synthetic publication note');check('every attempt carried the receipt through the save chain',approvals().every(c=>(c.body.p_final_guideline_data as Record<string,unknown>).clinical_review_evidence_id===secondId));
 check('success reloads the confirmed catalogue',catalogueReads>reads);
 check('only the page font stylesheet was attempted, and it was aborted',blocked.every(host=>host==='fonts.googleapis.com'||host==='fonts.gstatic.com'));check('no browser runtime errors',errors.length===0);
 await page.screenshot({path:out+'/actual-app-after-publish.png',fullPage:false});
 const recoveryPage=await context.newPage();await recoveryPage.goto(origin+'/ortho-guidelines-hub/#access_token='+token+'&refresh_token=SYNTHETIC&type=recovery');await recoveryPage.getByRole('dialog',{name:'Set your editor password',exact:true}).waitFor().catch(async error=>{fs.writeFileSync(out+'/recovery-diagnostic.txt',await recoveryPage.locator('body').innerText());throw error;});check('recovery dialog remains available outside administration',await recoveryPage.getByRole('dialog',{name:'Set your editor password',exact:true}).isVisible());
}finally{await browser?.close();server.kill();fs.writeFileSync(out+'/actual-app-editor.json',JSON.stringify({passed,outcomes,calls:calls.map(c=>c.name),alerts,blocked,errors},null,2)+'\n');}
console.log(passed+' passed, 0 failed');
