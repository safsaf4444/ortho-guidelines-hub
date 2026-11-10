/** Combined browser acceptance: mock auth only, no DB, no writes or external traffic. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {chromium} from 'playwright';

declare const document: any;
declare const navigator: any;
declare const localStorage: any;
declare const window: any;
const root=process.cwd(),vite=path.join(root,'node_modules/vite/bin/vite.js'),base='/ortho-guidelines-hub/';
const key='sb_publishable_FINAL_UI_SYNTHETIC_KEY';
const env={...Object.fromEntries(Object.entries(process.env).filter(([name])=>
  ['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(name.toUpperCase()))),
  NODE_OPTIONS:'--require '+JSON.stringify(path.join(root,'scripts/lib/release-network.cjs'))};
for(const file of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']) {
  assert.ok(!fs.existsSync(path.join(root,file)),'Use an isolated checkout without private env files.');
}
let passed=0;
const check=(name:string,value:boolean)=>{assert.ok(value,name);passed++;console.log('PASS '+name);};
async function freePort(){const server=net.createServer();await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert(address&&typeof address!=='string');await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;}
function stop(child:ChildProcess){if(!child.pid)return;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}
async function start(args:string[],variables:Record<string,string>={}){
  const port=await freePort(),origin='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,[vite,...args,'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env:{...env,...variables},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout?.on('data',data=>{log+=data;});child.stderr?.on('data',data=>{log+=data;});
  try {for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Local Vite failed: '+log);try{if((await fetch(origin+base,{signal:AbortSignal.timeout(500)})).ok)return {child,origin};}catch{/* local startup */}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Local Vite startup timed out');}
  catch(error){stop(child);throw error;}
}
const executable=[chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
assert(executable,'No installed browser; no browser download is performed.');
const browser=await chromium.launch({executablePath:executable,headless:true});
const external:string[]=[];let databaseWrites=0;
// Direct create is intentionally disabled, so the modal requirements are exercised through the supported
// staged review path. Its two read-only list RPCs are POSTs; they are allowlisted by exact name and
// counted separately, so any other POST/PATCH/DELETE still counts as a database write.
const READ_ONLY_RPCS=new Set(['/rest/v1/rpc/list_publication_receipts','/rest/v1/rpc/list_governance_review_events']);let readOnlyRpcPosts=0;
const STAGED_ROW={id:'00000000-0000-4000-8000-000000000099',candidate_id:'synthetic-final-ui',schema_version:1,pipeline:'discovery',provider:'SYNTHETIC',provider_name:'Synthetic',source:'Synthetic',topic:'Synthetic final UI candidate',summary:'Synthetic',notes:'Synthetic',versions:[{url:'https://synthetic.example.test/final-ui',label:'Synthetic'}],primary_url:'https://synthetic.example.test/final-ui',identity_key:'https://synthetic.example.test/final-ui',match_key:'https://synthetic.example.test/final-ui',change_reason:'NEW_GUIDELINE',review_status:'pending',producer:'discover',discovered_at:'2026-11-09T00:00:00Z',review_outcome:null,review_note:null,reviewed_by:null,reviewed_at:null,matched_guideline_id:null,resulting_guideline_id:null,changed_url:null};
const mockBody=(pathname:string)=>pathname.startsWith('/auth/')?null:pathname.endsWith('/staged_guidelines')?[STAGED_ROW]
  :pathname.endsWith('/list_governance_review_events')?{lateEvidence:[],revisionSignals:[]}
  :pathname.endsWith('/list_publication_receipts')?{receipts:[],availabilityPolicyConfigured:false,payloadFingerprint:'synthetic',comparisonRequired:false}:[];
try {
  const user={id:'synthetic-ui-editor',email:'editor@example.invalid',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const expiry=Math.floor(Date.now()/1000)+3600;
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:expiry,role:'authenticated'})).toString('base64url')+'.SYNTHETIC_SIGNATURE';
  async function context(origin:string,workers:'allow'|'block'='block'){
    const context=await browser.newContext({serviceWorkers:workers,viewport:{width:1280,height:800}});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url()),method=route.request().method();
      if(url.origin===origin)return route.continue();
      if(url.origin==='http://127.0.0.1:54321'){
        if(method==='POST'&&READ_ONLY_RPCS.has(url.pathname))readOnlyRpcPosts++;
        else if(url.pathname.startsWith('/rest/v1/')&&!['GET','OPTIONS'].includes(method))databaseWrites++;
        return route.fulfill({status:method==='OPTIONS'?204:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-client-info,prefer','access-control-allow-methods':'GET,POST,OPTIONS'},body:method==='OPTIONS'?'':JSON.stringify(mockBody(url.pathname)??user)});
      }
      if(!['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))external.push(url.origin);
      return route.abort();
    });
    await context.routeWebSocket('**/*',socket=>{const url=new URL(socket.url());if(url.hostname==='127.0.0.1'&&url.port===new URL(origin).port)socket.connectToServer();else {external.push(url.origin);socket.close();}});
    return context;
  }
  const server=await start([],{VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:key});
  const editor=await context(server.origin);
  try {
    await editor.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),{access_token:token,refresh_token:'SYNTHETIC_REFRESH',expires_at:expiry,expires_in:3600,token_type:'bearer',user});
    const page=await editor.newPage();await page.goto(server.origin+base);
    // Obsolete expectation, recorded rather than hidden: direct create stays disabled pending an audited workflow.
    const direct=page.getByRole('button',{name:'Add guideline',exact:true});await direct.waitFor();
    check('direct Add guideline remains intentionally disabled',await direct.isDisabled());
    await page.getByRole('button',{name:'Review Staged Guidelines',exact:true}).click();
    const add=page.getByRole('button',{name:/Review & publish/}).first();await add.waitFor();
    await add.click();const dialog=page.getByRole('dialog',{name:'Review & Publish Candidate',exact:true});await dialog.waitFor();await page.waitForTimeout(400);
    check('mock-session editor form has a labelled modal dialog',await dialog.getAttribute('aria-modal')==='true');
    check('opening the editor form moves focus inside',await dialog.evaluate((element:any)=>element.contains(document.activeElement)));
    const controls=dialog.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
    await controls.last().focus();await page.keyboard.press('Tab');
    check('Tab wraps to the first dialog control',await controls.first().evaluate((element:any)=>element===document.activeElement));
    await page.keyboard.press('Shift+Tab');
    check('Shift+Tab wraps to the last dialog control',await controls.last().evaluate((element:any)=>element===document.activeElement));
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    check('Escape closes the editor form and restores the invoking focus',await add.evaluate((element:any)=>element===document.activeElement));
    check('dynamic viewport height matches the browser viewport',await page.evaluate(()=>Math.abs(document.querySelector('#root > div').getBoundingClientRect().height-window.innerHeight)<2));
    // Exercise the retained component only through an ignored, local test
    // entry. The public application does not import or mount this view.
    const fixture=path.join(root,'reports/final-integration');fs.mkdirSync(fixture,{recursive:true});
    fs.writeFileSync(path.join(fixture,'freshness-browser-fixture.html'),'<html><body><div id="root"></div><script type="module" src="./freshness-browser-fixture.tsx"></script></body></html>');
    fs.writeFileSync(path.join(fixture,'freshness-browser-fixture.tsx'),[
      "import React from 'react'; import {createRoot} from 'react-dom/client';",
      "import Dashboard from '../../src/components/FreshnessDashboard'; import {GUIDELINES_DATA} from '../../src/data/guidelines-data'; import '../../src/index.css';",
      "const g={...GUIDELINES_DATA[0],id:'synthetic-view',topic:'Synthetic freshness view',source:'BOA',subGroup:'2020',summary:'',versions:[{label:'Source',url:'https://documents.example.invalid/test.pdf'}],linkVerificationStatus:'unchecked'};",
      "const evidence={label:'Synthetic dated fixture',generatedAt:'2026-11-05',records:[{guidelineId:g.id,publisher:'BOA',kind:'publisher-page',quality:'inferred',sourceUrl:'https://publisher.example.invalid/evidence',accessedAt:'2026-11-05',lastUpdated:'2026-01-01'}]};",
      "createRoot(document.getElementById('root')!).render(<Dashboard guidelines={[g]} evidence={evidence} asOf='2026-11-05'/>);",
    ].join('\n'));
    await page.goto(server.origin+base+'reports/final-integration/freshness-browser-fixture.html');
    await page.getByTestId('freshness-dashboard').waitFor();
    check('isolated freshness view labels its evidence as a dated snapshot',await page.getByText(/Dated evidence snapshot/).count()===1);
    check('freshness view does not invent a catalogue export timestamp',(await page.getByTestId('catalogue-as-of').innerText()).includes('unknown'));
    const signal=page.getByTestId('signal-row').first();await signal.click();
    const details=page.getByRole('dialog');await details.waitFor();
    check('read-only evidence details receive focus',await details.evaluate((element:any)=>element.contains(document.activeElement)));
    check('the evidence side panel correctly identifies itself as nonmodal',await details.getAttribute('aria-modal')==='false');
    await page.keyboard.press('Escape');await details.waitFor({state:'detached'});
    check('closing evidence details returns focus to the selected signal',await signal.evaluate((element:any)=>element===document.activeElement));
    await page.setViewportSize({width:320,height:700});
    check('isolated freshness view fits a narrow viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  } finally {await editor.close();stop(server.child);}

  const output=path.join(root,'reports/final-integration/pwa-browser-build');
  const build=spawnSync(process.execPath,[vite,'build','--outDir',output],{cwd:root,env:{...env,VITE_SUPABASE_URL:'https://database-fixture.example.invalid',VITE_SUPABASE_ANON_KEY:key},encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
  assert.equal(build.status,0,String(build.stderr));check('fresh synthetic-config PWA bundle builds',true);
  const preview=await start(['preview','--outDir',output]);const publicContext=await context(preview.origin,'allow');
  try {
    const page=await publicContext.newPage();await page.goto(preview.origin+base);
    await page.locator('main').waitFor();await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    check('fresh PWA obtains a controlling service worker',true);
    await publicContext.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('main').waitFor();
    check('offline reload renders catalogue cards from the PWA cache',await page.locator('main section button[aria-controls]').count()>5);
    check('offline reload retains the labelled search control',await page.getByRole('searchbox',{name:'Search guidelines'}).count()===1);
    await page.goto(preview.origin+base+'#/freshness');
    check('the production public build does not expose the freshness fixture view',await page.getByTestId('freshness-dashboard').count()===0);
  } finally {await publicContext.close();stop(preview.child);}
  check('mock editor interactions issue no database writes',databaseWrites===0);
  check('the staged review path was exercised (allowlisted read-only RPC posts observed)',readOnlyRpcPosts>0);
  check('no unexpected external or Supabase connection was attempted',external.length===0);
} finally {await browser.close();}
console.log(passed+' passed, 0 failed (19 original requirements + 2 path checks); readOnlyRpcPosts='+readOnlyRpcPosts);
