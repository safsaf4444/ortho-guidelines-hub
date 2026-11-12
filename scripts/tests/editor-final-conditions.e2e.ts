/**
 * Final review conditions in the REAL App (962fca4 review): P2-1 focus lifecycle around Publish, P3-4 stale queue
 * rows, P3-5 backdrop dismissal during flight and the duplicate receipts status region. Keyboard-only where it
 * matters. Loopback Auth/PostgREST mocks only; every non-loopback request is aborted. Synthetic rows only.
 */
import fs from 'node:fs';import net from 'node:net';import path from 'node:path';import {spawn} from 'node:child_process';import {chromium,type Page,type Locator,type BrowserContext} from 'playwright';
declare const document: any; // in-page callbacks run in the browser; scripts tsconfig has no DOM lib
const out='reports/final-review-conditions';fs.mkdirSync(out,{recursive:true});
const results:Array<{scenario:string;name:string;passed:boolean;detail?:unknown}>=[];
const check=(scenario:string,name:string,ok:boolean,detail?:unknown)=>{results.push({scenario,name,passed:ok,detail});console.log((ok?'PASS ':'FAIL ')+scenario+': '+name+(detail!==undefined&&!ok?' :: '+JSON.stringify(detail).slice(0,300):''));};
const sock=net.createServer();await new Promise<void>(r=>sock.listen(0,'127.0.0.1',r));const port=(sock.address() as net.AddressInfo).port;await new Promise<void>(r=>sock.close(()=>r()));
const origin='http://127.0.0.1:'+port,api='http://127.0.0.1:54321';
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(k.toUpperCase()))),VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_FINAL_CONDITIONS'};
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,windowsHide:true,stdio:'pipe'});
const browser=await chromium.launch({headless:true});
const user={id:'00000000-0000-4000-8000-000000000001',email:'editor@example.invalid',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'},exp=Math.floor(Date.now()/1000)+3600,token=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp,role:'authenticated'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.SYNTHETIC';
const mkRow=(n:string,topic:string,url:string)=>({id:'00000000-0000-4000-8000-0000000000'+n,candidate_id:'synthetic-'+n,schema_version:1,pipeline:'discovery',provider:'SYNTHETIC',provider_name:'Synthetic publisher',source:'Synthetic publisher',topic,summary:'Synthetic only',notes:'Synthetic only',versions:[{url,label:'Synthetic'}],primary_url:url,identity_key:url,match_key:url,change_reason:'NEW_GUIDELINE',review_status:'pending',producer:'discover',discovered_at:'2026-11-09T00:00:00Z',review_outcome:null,review_note:null,reviewed_by:null,reviewed_at:null,matched_guideline_id:null,resulting_guideline_id:null,changed_url:null});
type Call={name:string;body:Record<string,unknown>};
interface Mock{rows:ReturnType<typeof mkRow>[];receipts:Array<{id:string;staged:string;payload:string}>;calls:Call[];alerts:string[];errors:string[];blocked:string[];approve:'ok'|'refuse'|'network';delay:Record<string,number>;queueReads:number}
const pk=(d:unknown)=>{const {verification_evidence_id:_v,clinical_review_evidence_id:_c,...r}=(d??{}) as Record<string,unknown>;return JSON.stringify(r);};
async function fresh():Promise<{ctx:BrowserContext;page:Page;m:Mock}>{
 const m:Mock={rows:[mkRow('a1','Synthetic candidate Alpha','https://synthetic.example.test/alpha'),mkRow('b2','Synthetic candidate Bravo','https://synthetic.example.test/bravo')],receipts:[],calls:[],alerts:[],errors:[],blocked:[],approve:'ok',delay:{},queueReads:0};
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
 await ctx.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),{user,access_token:token,refresh_token:'SYNTHETIC',expires_at:exp,expires_in:3600,token_type:'bearer'});
 await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();if(u.origin!==api){m.blocked.push(u.hostname);return route.abort();}
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const reply=(json:unknown,status=200)=>route.fulfill({status,json,headers:cors});
  if(u.pathname.startsWith('/auth/'))return reply(u.pathname.endsWith('/logout')?{}:user);
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1)!,body=(req.postDataJSON()??{}) as Record<string,unknown>;m.calls.push({name,body});
   const wait=m.delay[name];if(wait){delete m.delay[name];await new Promise(r=>setTimeout(r,wait));}
   if(name==='list_governance_review_events')return reply({lateEvidence:[],revisionSignals:[]});
   if(name==='list_publication_receipts')return reply({receipts:m.receipts.filter(r=>r.staged===body.p_staged_id).map(r=>({id:r.id,kind:'clinical-review',outcome:null,observedAt:'2026-11-09T00:00:00Z',actor:'synthetic-editor',note:'Review '+r.id.slice(-3),eligible:r.payload===pk(body.p_data)})),availabilityPolicyConfigured:false,payloadFingerprint:'synthetic',comparisonRequired:false});
   if(name==='record_clinical_review'){const id='00000000-0000-4000-8000-'+String(m.receipts.length+101).padStart(12,'0');m.receipts.push({id,staged:String(body.p_staged_id),payload:pk(body.p_data)});return reply(id);}
   if(name==='approve_staged_guideline'){
    if(m.approve==='network')return route.abort('failed');
    if(m.approve==='refuse')return reply({code:'GV006',message:'Rejected-source comparison required; review-only until attributed reconsideration',details:null,hint:null},400);
    const row=m.rows.find(r=>r.id===body.p_candidate_id);
    if(!row||row.review_status!=='pending')return reply({code:'55000',message:'approve_staged_guideline: candidate is already accepted',details:null,hint:null},400);
    row.review_status='accepted';(row as {resulting_guideline_id:unknown}).resulting_guideline_id=(body.p_final_guideline_data as {id:string}).id;return reply((body.p_final_guideline_data as {id:string}).id);}
   return reply({message:'Unexpected RPC '+name},403);}
  if(u.pathname.endsWith('/guidelines'))return reply([]);
  if(u.pathname.endsWith('/staged_guidelines')){const id=u.searchParams.get('id');if(id){const row=m.rows.find(r=>'eq.'+r.id===id);return (req.headers()['accept']??'').includes('object')?reply(row?{review_status:row.review_status,resulting_guideline_id:row.resulting_guideline_id}:null):reply(row?[row]:[]);}m.queueReads++;return reply(m.rows.filter(r=>r.review_status==='pending'));}
  if(u.pathname.startsWith('/rest/v1/'))return reply([]);return reply({message:'Unexpected'},404);});
 const page=await ctx.newPage();page.on('pageerror',e=>m.errors.push(e.message));page.on('dialog',d=>{m.alerts.push(d.message());void d.accept();});
 await page.goto(origin+'/ortho-guidelines-hub/');await page.getByRole('button',{name:'Administration',exact:true}).click();await page.getByRole('button',{name:'Review Staged Guidelines',exact:true}).click();await page.getByRole('button',{name:/Review & publish/}).first().waitFor();
 return {ctx,page,m};
}
const dlg=(p:Page)=>p.getByRole('dialog',{name:'Review & Publish Candidate',exact:true});
const reviewButton=(p:Page,topic:string,other:string)=>p.locator('li,article,div,tr').filter({hasText:topic}).filter({hasNotText:other}).filter({has:p.getByRole('button',{name:/Review & publish/})}).last().getByRole('button',{name:/Review & publish/});
const parts=(d:Locator)=>({publish:d.getByRole('button',{name:'Publish Guideline',exact:true}),saving:d.getByRole('button',{name:'Saving…',exact:true}),status:d.getByRole('checkbox',{name:/I explicitly reviewed/}),attest:d.getByRole('checkbox',{name:/I personally performed/}),note:d.getByLabel('Review evidence note',{exact:true}),record:d.getByRole('button',{name:'Record clinical review of this payload'}),clinical:d.getByLabel('Clinical review receipt',{exact:true}),ready:d.getByText('Required evidence selected; database will revalidate at publication.',{exact:true}),changeNote:d.locator('#change-note'),publication:d.getByTestId('publication-status')});
async function prepare(d:Locator){await d.locator('select').first().selectOption({index:1});await d.locator('select').nth(1).selectOption({index:1});await d.locator('select:has(option[value="current"])').first().selectOption('current');await d.locator('#change-note').fill('Synthetic final-conditions change note');await d.page().waitForTimeout(350);}
async function review(d:Locator){const x=parts(d);await x.status.check();await x.attest.check();await x.note.fill('Synthetic final-conditions review');await x.record.click();await x.ready.waitFor({timeout:5000});}
const A='Synthetic candidate Alpha',B='Synthetic candidate Bravo';
const active=(p:Page)=>p.evaluate(()=>{const e=document.activeElement;return {tag:e?.tagName,text:(e?.textContent||'').trim().slice(0,40),inDialog:!!e?.closest('[role=dialog]'),testid:e?.getAttribute('data-testid')};});
async function tabTo(p:Page,target:Locator,max=15){for(let i=0;i<=max;i++){if(await target.evaluate((e:any)=>e===document.activeElement))return i;await p.keyboard.press('Tab');}return -1;}
async function scenario(name:string,fn:(p:Page,m:Mock)=>Promise<void>){const {ctx,page,m}=await fresh();try{await fn(page,m);}catch(e){check(name,'scenario completed',false,(e as Error).message.split('\n')[0]);}finally{check(name,'no runtime errors',m.errors.length===0,m.errors);check(name,'no non-loopback request other than page fonts',m.blocked.every(h=>/^fonts\.(googleapis|gstatic)\.com$/.test(h)),[...new Set(m.blocked)]);await ctx.close();}}
/** Keyboard-only: open Alpha with Enter, record a review, Tab to Publish and press Enter with a delayed response. */
async function keyboardPublish(p:Page,m:Mock,delay=900){const btn=reviewButton(p,A,B);await btn.focus();await p.keyboard.press('Enter');const d=dlg(p);await d.waitFor();await p.waitForTimeout(350);await prepare(d);await review(d);const x=parts(d);
 const tabs=await tabTo(p,x.publish);m.delay.approve_staged_guideline=delay;await p.keyboard.press('Enter');await p.waitForTimeout(250);return {btn,d,x,tabs};}
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/ortho-guidelines-hub/')).ok)break;}catch{/* starting */}await new Promise(r=>setTimeout(r,100));}

 // ---- P2-1: focus never leaves the open dialog around Publish. ----
 for(const [mode,label] of [['refuse','refused'],['network','unconfirmed']] as const){
  await scenario('p21-'+label,async(p,m)=>{
   m.approve=mode;const {btn,d,x,tabs}=await keyboardPublish(p,m);
   check('p21-'+label,'Publish was reached by keyboard from the receipts',tabs>=0,tabs);
   const during=await active(p);
   check('p21-'+label,'focus stays inside the dialog while publication is in flight',during.inDialog,during);
   check('p21-'+label,'in-flight state is announced in a live status region',/Publishing/.test(await x.publication.innerText())&&await x.publication.getAttribute('role')==='status');
   await p.waitForTimeout(1300);
   check('p21-'+label,'the dialog stays open with the draft after the '+label+' result',await d.count()===1&&await x.changeNote.inputValue()==='Synthetic final-conditions change note');
   const after=await active(p);
   check('p21-'+label,'after the result, focus is inside the dialog on the enabled Publish control',after.inDialog&&await x.publish.evaluate((e:any)=>e===document.activeElement)&&await x.publish.isEnabled(),after);
   const announced=await x.publication.innerText();
   check('p21-'+label,'the outcome is announced without claiming publication',/did not complete/i.test(announced)&&!/was published|publication succeeded/i.test(announced),announced);
   check('p21-'+label,'the alert names the outcome class',m.alerts.some(a=>(mode==='refuse'?/^PUBLISH REFUSED/:/^PUBLISH NOT CONFIRMED/).test(a)),m.alerts);
   await p.keyboard.press('Shift+Tab');check('p21-'+label,'Shift+Tab from Publish stays inside the dialog',(await active(p)).inDialog);
   await p.keyboard.press('Escape');await d.waitFor({state:'detached'});
   check('p21-'+label,'Escape closes the dialog and restores focus to the invoking control',await btn.evaluate((e:any)=>e===document.activeElement));
   check('p21-'+label,'exactly one approval was sent',m.calls.filter(c=>c.name==='approve_staged_guideline').length===1);
  });
 }
 await scenario('p21-double-submit',async(p,m)=>{
  const {d,x}=await keyboardPublish(p,m,900);await p.keyboard.press('Enter');await p.keyboard.press('Space');await x.saving.click({force:true,timeout:500}).catch(()=>{});
  await d.waitFor({state:'detached',timeout:5000});
  check('p21-double-submit','Enter, Space and a forced click during flight send exactly one approval',m.calls.filter(c=>c.name==='approve_staged_guideline').length===1);
 });

 // ---- P3-5: a backdrop click cannot dismiss an in-flight publication; explicit Escape still can, safely. ----
 await scenario('p35-backdrop',async(p,m)=>{
  const {d}=await keyboardPublish(p,m,1500);
  await p.mouse.click(5,5);await p.waitForTimeout(200);
  check('p35-backdrop','a backdrop click during flight leaves the dialog open',await d.count()===1);
  await p.waitForTimeout(1600);
  check('p35-backdrop','the in-flight publication completes and closes its own dialog',await d.count()===0&&!m.alerts.some(a=>/EARLIER REQUEST/.test(a)),m.alerts);
 });
 await scenario('p35-escape-in-flight',async(p,m)=>{
  const {d}=await keyboardPublish(p,m,1500);await p.keyboard.press('Escape');await d.waitFor({state:'detached',timeout:2000});
  const b=reviewButton(p,B,A);await b.click();await dlg(p).waitFor();await parts(dlg(p)).changeNote.fill('Bravo draft');await p.waitForTimeout(1700);
  check('p35-escape-in-flight','explicit Escape still dismisses; the late result is labelled and Bravo is untouched',m.alerts.some(a=>/EARLIER REQUEST/.test(a))&&await parts(dlg(p)).changeNote.inputValue()==='Bravo draft');
 });

 // ---- P3-4: a just-published candidate leaves the queue without a manual refresh; other drafts survive. ----
 await scenario('p34-stale-queue',async(p,m)=>{
  const before=await p.getByRole('button',{name:/Review & publish/}).count();const reads=m.queueReads;
  const {d}=await keyboardPublish(p,m,300);await d.waitFor({state:'detached',timeout:5000});await p.waitForTimeout(800);
  check('p34-stale-queue','the queue is re-read after a confirmed publication',m.queueReads>reads,{reads,after:m.queueReads});
  check('p34-stale-queue','the published candidate is no longer offered for publication',await p.getByRole('button',{name:/Review & publish/}).count()===before-1&&await reviewButton(p,B,A).count()===1,{before,after:await p.getByRole('button',{name:/Review & publish/}).count()});
 });

 // ---- P3-5: one live status region in the receipts panel. ----
 await scenario('p35-status-region',async(p)=>{
  await reviewButton(p,A,B).click();const d=dlg(p);await d.waitFor();await p.waitForTimeout(350);await prepare(d);await review(d);
  const fieldset=d.getByRole('group',{name:'Publication review evidence'});
  check('p35-status-region','the receipts panel has exactly one role=status region',await fieldset.getByRole('status').count()===1,await fieldset.getByRole('status').allTextContents());
  check('p35-status-region','that region carries both the recording outcome and the readiness state',/Clinical review recorded and selected/.test(await fieldset.getByRole('status').innerText())&&/Required evidence selected/.test(await fieldset.getByRole('status').innerText()));
 });
}finally{await browser.close();server.kill();}
const failed=results.filter(r=>!r.passed).length;
fs.writeFileSync(out+'/editor-final-conditions.json',JSON.stringify({passed:results.length-failed,failed,results},null,2)+'\n');
console.log((results.length-failed)+' passed, '+failed+' failed');process.exitCode=failed?1:0;
