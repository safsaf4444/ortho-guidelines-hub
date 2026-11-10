/**
 * Conditional-acceptance follow-up, exercised in the REAL App (not a fixture):
 *   - in-flight publication results affect only the modal session that started them;
 *   - K1 keyboard focus stays inside the active review dialog when receipts are recorded;
 *   - K2 a revoked editor at publication sees a definite refusal.
 * Loopback Auth/PostgREST mocks only; every non-loopback request is aborted. Synthetic rows only.
 */
import fs from 'node:fs';import net from 'node:net';import path from 'node:path';import {spawn} from 'node:child_process';import {chromium,type Page,type Locator,type BrowserContext} from 'playwright';
declare const document: any; // in-page callbacks run in the browser; scripts tsconfig has no DOM lib
const out='reports/conditional-followup';fs.mkdirSync(out,{recursive:true});
const results:Array<{scenario:string;name:string;passed:boolean;detail?:unknown}>=[];
const check=(scenario:string,name:string,ok:boolean,detail?:unknown)=>{results.push({scenario,name,passed:ok,detail});console.log((ok?'PASS ':'FAIL ')+scenario+': '+name+(detail!==undefined&&!ok?' :: '+JSON.stringify(detail).slice(0,300):''));};
const sock=net.createServer();await new Promise<void>(r=>sock.listen(0,'127.0.0.1',r));const port=(sock.address() as net.AddressInfo).port;await new Promise<void>(r=>sock.close(()=>r()));
const origin='http://127.0.0.1:'+port,api='http://127.0.0.1:54321';
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(k.toUpperCase()))),VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_FOLLOWUP'};
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,windowsHide:true,stdio:'pipe'});
const browser=await chromium.launch({headless:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'editor@example.invalid',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'},exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp,role:'authenticated'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.SYNTHETIC';
const mkRow=(n:string,topic:string,url:string)=>({id:'00000000-0000-4000-8000-0000000000'+n,candidate_id:'synthetic-'+n,schema_version:1,pipeline:'discovery',provider:'SYNTHETIC',provider_name:'Synthetic publisher',source:'Synthetic publisher',topic,summary:'Synthetic only',notes:'Synthetic only',versions:[{url,label:'Synthetic'}],primary_url:url,identity_key:url,match_key:url,change_reason:'NEW_GUIDELINE',review_status:'pending',producer:'discover',discovered_at:'2026-11-09T00:00:00Z',review_outcome:null,review_note:null,reviewed_by:null,reviewed_at:null,matched_guideline_id:null,resulting_guideline_id:null,changed_url:null});
type Call={name:string;body:Record<string,unknown>};
interface Mock{rows:ReturnType<typeof mkRow>[];receipts:Array<{id:string;staged:string;payload:string}>;calls:Call[];alerts:string[];errors:string[];blocked:string[];approve:'ok'|'notEditor'|'refuse';delay:Record<string,number>;revoked:Set<string>;catalogueReads:number}
const pk=(d:unknown)=>{const {verification_evidence_id:_v,clinical_review_evidence_id:_c,...r}=(d??{}) as Record<string,unknown>;return JSON.stringify(r);};
async function fresh():Promise<{ctx:BrowserContext;page:Page;m:Mock}>{
 const m:Mock={rows:[mkRow('a1','Synthetic candidate Alpha','https://synthetic.example.test/alpha'),mkRow('b2','Synthetic candidate Bravo','https://synthetic.example.test/bravo')],receipts:[],calls:[],alerts:[],errors:[],blocked:[],approve:'ok',delay:{},revoked:new Set(),catalogueReads:0};
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 await ctx.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),{user,access_token:token,refresh_token:'SYNTHETIC',expires_at:exp,expires_in:3600,token_type:'bearer'});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin!==api){m.blocked.push(u.hostname);return route.abort();}
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const reply=(json:unknown,status=200)=>route.fulfill({status,json,headers:cors});
  if(u.pathname.startsWith('/auth/'))return reply(u.pathname.endsWith('/logout')?{}:user);
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1)!,body=(req.postDataJSON()??{}) as Record<string,unknown>;m.calls.push({name,body});
   const wait=m.delay[name];if(wait){delete m.delay[name];await new Promise(r=>setTimeout(r,wait));}
   if(m.revoked.has(name))return reply({code:'42501',message:'Named database editor required',details:null,hint:null},403);
   if(name==='list_governance_review_events')return reply({lateEvidence:[],revisionSignals:[]});
   if(name==='list_publication_receipts')return reply({receipts:m.receipts.filter(r=>r.staged===body.p_staged_id).map(r=>({id:r.id,kind:'clinical-review',outcome:null,observedAt:'2026-11-09T00:00:00Z',actor:'synthetic-editor',note:'Review '+r.id.slice(-3),eligible:r.payload===pk(body.p_data)})),availabilityPolicyConfigured:false,payloadFingerprint:'synthetic',comparisonRequired:false});
   if(name==='record_clinical_review'){const id='00000000-0000-4000-8000-'+String(m.receipts.length+101).padStart(12,'0');m.receipts.push({id,staged:String(body.p_staged_id),payload:pk(body.p_data)});return reply(id);}
   if(name==='approve_staged_guideline'){
    if(m.approve==='notEditor')return reply({code:'42501',message:'approve_staged_guideline: not an approved editor',details:null,hint:null},403);
    if(m.approve==='refuse')return reply({code:'GV006',message:'Rejected-source comparison required; review-only until attributed reconsideration',details:null,hint:null},400);
    const row=m.rows.find(r=>r.id===body.p_candidate_id);
    if(!row||row.review_status!=='pending')return reply({code:'55000',message:'approve_staged_guideline: candidate is already accepted',details:null,hint:null},400);
    row.review_status='accepted';(row as {resulting_guideline_id:unknown}).resulting_guideline_id=(body.p_final_guideline_data as {id:string}).id;return reply((body.p_final_guideline_data as {id:string}).id);}
   return reply({message:'Unexpected RPC '+name},403);}
  if(u.pathname.endsWith('/guidelines')){m.catalogueReads++;return reply([]);}
  if(u.pathname.endsWith('/staged_guidelines')){const id=u.searchParams.get('id');if(id){const row=m.rows.find(r=>'eq.'+r.id===id);return (req.headers()['accept']??'').includes('object')?reply(row?{review_status:row.review_status,resulting_guideline_id:row.resulting_guideline_id}:null):reply(row?[row]:[]);}return reply(m.rows.filter(r=>r.review_status==='pending'));}
  if(u.pathname.startsWith('/rest/v1/'))return reply([]);return reply({message:'Unexpected'},404);});
 const page=await ctx.newPage();page.on('pageerror',e=>m.errors.push(e.message));page.on('dialog',d=>{m.alerts.push(d.message());void d.accept();});
 await page.goto(origin+'/ortho-guidelines-hub/');await page.getByRole('button',{name:'Review Staged Guidelines',exact:true}).click();await page.getByRole('button',{name:/Review & publish/}).first().waitFor();
 return {ctx,page,m};
}
const dlg=(p:Page)=>p.getByRole('dialog',{name:'Review & Publish Candidate',exact:true});
const reviewButton=(p:Page,topic:string,other:string)=>p.locator('li,article,div,tr').filter({hasText:topic}).filter({hasNotText:other}).filter({has:p.getByRole('button',{name:/Review & publish/})}).last().getByRole('button',{name:/Review & publish/});
async function open(p:Page,topic:string,other:string){await reviewButton(p,topic,other).click();await dlg(p).waitFor();await p.waitForTimeout(350);return dlg(p);}
const parts=(d:Locator)=>({publish:d.getByRole('button',{name:'Publish Guideline',exact:true}),status:d.getByRole('checkbox',{name:/I explicitly reviewed/}),attest:d.getByRole('checkbox',{name:/I personally performed/}),note:d.getByLabel('Review evidence note',{exact:true}),record:d.getByRole('button',{name:'Record clinical review of this payload'}),clinical:d.getByLabel('Clinical review receipt',{exact:true}),ready:d.getByText('Required evidence selected; database will revalidate at publication.',{exact:true}),topic:d.locator('input[type=text]').nth(1),changeNote:d.locator('#change-note')});
async function prepare(d:Locator,note='Synthetic follow-up change note'){await d.locator('select').first().selectOption({index:1});await d.locator('select').nth(1).selectOption({index:1});await d.locator('select:has(option[value="current"])').first().selectOption('current');await d.locator('#change-note').fill(note);await d.page().waitForTimeout(350);}
async function review(d:Locator,text='Synthetic follow-up review'){const x=parts(d);await x.status.check();await x.attest.check();await x.note.fill(text);await x.record.click();await x.ready.waitFor({timeout:5000});return x.clinical.inputValue();}
const approvals=(m:Mock)=>m.calls.filter(c=>c.name==='approve_staged_guideline');
const A='Synthetic candidate Alpha',B='Synthetic candidate Bravo',DRAFT='Bravo draft typed while Alpha was in flight';
const focusInside=(d:Locator)=>d.evaluate((e:any)=>e.contains(document.activeElement));
async function scenario(name:string,fn:(p:Page,m:Mock)=>Promise<void>){const {ctx,page,m}=await fresh();try{await fn(page,m);}catch(e){check(name,'scenario completed',false,(e as Error).message.split('\n')[0]);}finally{check(name,'no runtime errors',m.errors.length===0,m.errors);check(name,'no non-loopback request other than page fonts',m.blocked.every(h=>/^fonts\.(googleapis|gstatic)\.com$/.test(h)),[...new Set(m.blocked)]);await ctx.close();}}
/** Start Alpha's publication with a delayed response, then dismiss its modal by `how`. */
async function alphaInFlight(p:Page,m:Mock,how:'Escape'|'Cancel',delay=2000){const d=await open(p,A,B);await prepare(d);await review(d);m.delay.approve_staged_guideline=delay;await parts(d).publish.click();await p.waitForTimeout(150);
 if(how==='Escape')await p.keyboard.press('Escape');else await d.getByRole('button',{name:'Cancel',exact:true}).click();await dlg(p).waitFor({state:'detached',timeout:2000});}
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/ortho-guidelines-hub/')).ok)break;}catch{/* starting */}await new Promise(r=>setTimeout(r,100));}

 // ---- In-flight race: a late result may only affect the modal session that initiated it. ----
 await scenario('race-escape-switch',async(p,m)=>{
  await alphaInFlight(p,m,'Escape');const d=await open(p,B,A);const x=parts(d);await x.changeNote.fill(DRAFT);await x.topic.fill('Bravo topic edited');
  await p.waitForTimeout(2600);
  check('race-escape-switch','late Alpha success leaves the Bravo modal open',await dlg(p).count()===1);
  check('race-escape-switch','Bravo draft is intact after the late Alpha success',await x.changeNote.inputValue()===DRAFT&&await x.topic.inputValue()==='Bravo topic edited');
  check('race-escape-switch','late Alpha result is reported as the earlier request, naming Alpha',m.alerts.some(a=>a.includes(A)&&/earlier/i.test(a)),m.alerts);
  await x.topic.fill(B);await prepare(d,'Bravo change note');const rb=await review(d,'Bravo review');await x.publish.click();await d.waitFor({state:'detached',timeout:5000});
  const sent=approvals(m).at(-1)!.body;check('race-escape-switch','Bravo still publishes against its own candidate and receipt',approvals(m).length===2&&sent.p_candidate_id===m.rows[1].id&&(sent.p_final_guideline_data as Record<string,unknown>).clinical_review_evidence_id===rb,sent.p_candidate_id);
 });
 await scenario('race-cancel-failed',async(p,m)=>{
  m.approve='refuse';await alphaInFlight(p,m,'Cancel');const d=await open(p,B,A);const x=parts(d);await x.changeNote.fill(DRAFT);
  await p.waitForTimeout(2600);
  check('race-cancel-failed','late Alpha refusal leaves the Bravo modal and draft intact',await dlg(p).count()===1&&await x.changeNote.inputValue()===DRAFT);
  const last=m.alerts.at(-1)??'';check('race-cancel-failed','late refusal is attributed to the earlier Alpha request, not the open form',last.includes(A)&&/earlier/i.test(last)&&/PUBLISH REFUSED/.test(last),last);
  check('race-cancel-failed','Bravo receipt controls start clean after the late refusal',await x.clinical.inputValue()===''&&!(await x.status.isChecked())&&await x.publish.isDisabled());
 });
 await scenario('race-reopen',async(p,m)=>{
  await alphaInFlight(p,m,'Escape');const d=await open(p,A,B);const x=parts(d);await x.changeNote.fill('Reopened Alpha draft');
  await p.waitForTimeout(2600);
  check('race-reopen','late success of the first session does not close the reopened Alpha modal',await dlg(p).count()===1&&await x.changeNote.inputValue()==='Reopened Alpha draft');
  check('race-reopen','the catalogue is reloaded after the confirmed earlier publication',m.catalogueReads>=2,m.catalogueReads);
  await prepare(d,'Reopened Alpha note');await review(d,'Reopened review');await x.publish.click();await p.waitForTimeout(900);
  const last=m.alerts.at(-1)??'';check('race-reopen','republishing the reopened session is reported as already processed, never a second copy',/^ALREADY PROCESSED/.test(last)&&approvals(m).length===2,last.split('\n')[0]);
 });
 await scenario('race-sign-out',async(p,m)=>{
  const d=await open(p,A,B);await prepare(d);await review(d);m.delay.approve_staged_guideline=1800;await parts(d).publish.click();await p.waitForTimeout(150);
  await p.getByRole('button',{name:/Sign out/i}).evaluate((e:any)=>e.click());await p.waitForTimeout(400);
  check('race-sign-out','sign-out closes the in-flight modal',await dlg(p).count()===0);const callsAfter=m.calls.length;
  await p.waitForTimeout(2200);
  check('race-sign-out','late success opens nothing after sign-out',await p.getByRole('dialog').count()===0);
  check('race-sign-out','late success is still reported truthfully as the earlier request',m.alerts.some(a=>a.includes(A)&&/earlier/i.test(a)),m.alerts);
  check('race-sign-out','no further governance RPC after sign-out',m.calls.slice(callsAfter).every(c=>!/^(approve|record|list_publication)/.test(c.name)),m.calls.slice(callsAfter).map(c=>c.name));
  check('race-sign-out','exactly one approval was sent',approvals(m).length===1);
 });
 await scenario('race-escape-same-candidate-failure',async(p,m)=>{
  m.approve='refuse';const d=await open(p,A,B);await prepare(d);await review(d);m.delay.approve_staged_guideline=1500;await parts(d).publish.click();await p.waitForTimeout(150);
  await p.waitForTimeout(1800);
  check('race-escape-same-candidate-failure','a refusal for the open session keeps its own draft open (current-session behaviour unchanged)',await dlg(p).count()===1&&await parts(d).changeNote.inputValue()==='Synthetic follow-up change note');
  const last=m.alerts.at(-1)??'';check('race-escape-same-candidate-failure','current-session refusal is not labelled as an earlier request',/^PUBLISH REFUSED/.test(last)&&!/earlier/i.test(last),last.split('\n')[0]);
 });

 // ---- K1: focus stays inside the active review dialog when receipts are recorded. ----
 await scenario('k1-focus',async(p,m)=>{
  const btn=reviewButton(p,A,B);await btn.focus();await p.keyboard.press('Enter');const d=dlg(p);await d.waitFor();await p.waitForTimeout(350);await prepare(d);const x=parts(d);
  await x.status.check();await x.attest.check();await x.note.fill('Keyboard review');await x.record.focus();m.delay.record_clinical_review=700;await p.keyboard.press('Enter');await p.waitForTimeout(200);
  check('k1-focus','focus stays inside the dialog while the review is being recorded',await focusInside(d),await p.evaluate(()=>document.activeElement?.tagName));
  const live=d.getByRole('status').filter({hasText:/Recording review/});check('k1-focus','recording is announced in a live status region',await live.count()===1);
  await x.ready.waitFor({timeout:5000});await p.waitForTimeout(150);
  check('k1-focus','after recording, focus is inside the dialog (not <body>)',await focusInside(d),await p.evaluate(()=>document.activeElement?.tagName));
  check('k1-focus','after recording, focus lands on the newly selected clinical receipt',await x.clinical.evaluate(e=>e===document.activeElement));
  check('k1-focus','success is announced in a live status region',await d.getByRole('status').filter({hasText:/Clinical review recorded and selected/}).count()===1,await d.getByRole('status').allTextContents());
  let tabs=0;while(tabs<12&&!(await x.publish.evaluate(e=>e===document.activeElement))){await p.keyboard.press('Tab');tabs++;}
  check('k1-focus','Publish is reachable with a short forward Tab sequence (<= 8)',tabs<=8,tabs);
  await p.keyboard.press('Shift+Tab');check('k1-focus','Shift+Tab from Publish stays inside the dialog',await focusInside(d));
  await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
  check('k1-focus','Escape closes the dialog and restores focus to the invoking control',await btn.evaluate(e=>e===document.activeElement));
 });
 await scenario('k1-focus-error',async(p,m)=>{
  const d=await open(p,A,B);await prepare(d);const x=parts(d);m.revoked.add('record_clinical_review');
  await x.status.check();await x.attest.check();await x.note.fill('Review that will be refused');await x.record.focus();await p.keyboard.press('Enter');await p.waitForTimeout(700);
  check('k1-focus-error','after a refused recording, focus returns to the review note inside the dialog',await x.note.evaluate(e=>e===document.activeElement),await p.evaluate(()=>document.activeElement?.tagName));
  check('k1-focus-error','the refusal is announced as an alert and the note is kept',await d.getByRole('alert').count()>0&&await x.note.inputValue()==='Review that will be refused');
 });

 // ---- K2: a revoked editor at publication sees a definite refusal. ----
 await scenario('k2-revoked',async(p,m)=>{
  const d=await open(p,A,B);await prepare(d);await review(d);m.approve='notEditor';const reads=m.catalogueReads;await parts(d).publish.click();await p.waitForTimeout(700);
  const last=m.alerts.at(-1)??'';
  check('k2-revoked','revoked publication is reported as PUBLISH REFUSED, not unconfirmed',/^PUBLISH REFUSED/.test(last)&&!/NOT CONFIRMED/.test(last),last.split('\n')[0]);
  check('k2-revoked','the refusal names the editor allowlist',/editor allowlist/.test(last));
  check('k2-revoked','the draft stays open and nothing is claimed as published',await dlg(p).count()===1&&m.catalogueReads===reads);
 });
}finally{await browser.close();server.kill();}
const failed=results.filter(r=>!r.passed).length;
fs.writeFileSync(out+'/editor-followup.json',JSON.stringify({passed:results.length-failed,failed,results},null,2)+'\n');
console.log((results.length-failed)+' passed, '+failed+' failed');process.exitCode=failed?1:0;
