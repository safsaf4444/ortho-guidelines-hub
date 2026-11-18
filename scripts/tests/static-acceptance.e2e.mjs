/** Two static acceptance blockers. Local artifact only; builds a fresh preview by default.
 * node scripts/tests/static-acceptance.e2e.mjs [--artifact=DIR] [--report=DIR] [--base=/]
 * Chromium's temporary extension changes actual browser zoom, not CSS/device emulation.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { safeEnvironment } from '../lib/release-gate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const base=option('base')||'/';
if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('Unsupported local base path');
const report=path.resolve(root,option('report')||'reports/static-acceptance-'+Date.now());
if(fs.existsSync(report))throw Error('Preserve previous evidence; choose a new report directory');
fs.mkdirSync(report,{recursive:true});
const results=[],requests=[],errors=[],routes=[];
const check=(name,ok,detail)=>{results.push({name,status:ok?'PASS':'FAIL',detail});console.log(ok?'PASS':'FAIL',name);};
let server,context;
try{
 let artifact=option('artifact')?path.resolve(root,option('artifact')):path.join(report,'build');
 if(!option('artifact')){
  if(fs.readdirSync(root).some(n=>n==='.env'||n.startsWith('.env.')&&n!=='.env.example'))throw Error('Private Vite env files forbidden');
  const built=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config','vite.static-preview.config.ts','--base',base,'--outDir',artifact],{cwd:root,env:{...safeEnvironment(),NODE_OPTIONS:'--require '+JSON.stringify(path.join(root,'scripts/lib/release-network.cjs').replaceAll('\\','/'))},windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  fs.writeFileSync(path.join(report,'build.log'),(built.stdout||'')+'\n'+(built.stderr||''));if(built.status!==0)throw Error('Static build failed');
 }
 const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);const relative=name===base?'index.html':name.startsWith(base)?name.slice(base.length):'../invalid';const file=path.resolve(artifact,relative);
  const exists=file.startsWith(artifact+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile();requests.push({method:req.method,path:name,status:exists?200:404});
  res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-cache');if(!exists){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,url=origin+base;
 const extension=path.join(report,'zoom-extension');fs.mkdirSync(extension);
 fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local zoom regression',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
 fs.writeFileSync(path.join(extension,'worker.js'),'chrome.runtime.onInstalled.addListener(() => {});');
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:null,env:safeEnvironment(),args:['--window-size=1280,1000','--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();errors.push('Unexpected request '+route.request().url());return route.abort();});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'))||await context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension:'),timeout:10000});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text());});
 page.on('framenavigated',f=>{if(f===page.mainFrame())routes.push(f.url().replace(origin,'LOCAL'));});
 await page.goto(url);const search=page.getByRole('searchbox',{name:'Search guidelines'}),filter=page.getByLabel('Filter by link-check status');await search.waitFor();
 const screenshot=async name=>{const cdp=await context.newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});fs.writeFileSync(path.join(report,name+'.png'),Buffer.from(shot.data,'base64'));await cdp.detach();};
 const zoom=async factor=>worker.evaluate(async({origin,factor})=>{const tab=(await chrome.tabs.query({})).find(t=>t.url?.startsWith(origin));await chrome.tabs.setZoom(tab.id,factor);return chrome.tabs.getZoom(tab.id);},{origin,factor});
 // Native scroll offsets round fractional CSS pixels; tolerate <=1px at the edge.
 const geometry=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {focused:el===document.activeElement,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},unobscured:hit===el||el.contains(hit),fullyVisible:r.top>=-1&&r.bottom<=innerHeight+1,roundingTolerancePx:1,pageOverflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth,hit:hit?.tagName};});
 async function keyboardChecks(label){
  const notice=page.getByText('Showing the built-in snapshot, not live data.',{exact:true}).locator('..');await notice.scrollIntoViewIfNeeded();
  check('snapshot disclosure readable '+label,await notice.isVisible()&&await notice.evaluate(e=>getComputedStyle(e).visibility==='visible'&&e.getBoundingClientRect().height>0));
  if(label==='zoom-400')await screenshot('notice-'+label);
  await search.fill('');await filter.selectOption('All');await search.focus();await page.keyboard.press('Tab');await filter.scrollIntoViewIfNeeded();
  const measured=await geometry(filter);check('focused filter unobscured '+label,measured.focused&&measured.unobscured&&measured.fullyVisible,measured);check('no horizontal overflow '+label,!measured.pageOverflow&&!measured.mainOverflow);
  await screenshot('filter-'+label);
  await page.keyboard.press('ArrowDown');check('filter keyboard usable '+label,await filter.inputValue()!=='All');await filter.selectOption('All');
  await filter.focus();await page.keyboard.press('Tab');check('publisher focus '+label,await page.getByLabel('Filter by publisher group').evaluate(e=>e===document.activeElement));await page.keyboard.press('Tab');check('specialty focus '+label,await page.getByLabel('Filter by specialty',{exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Tab');const section=page.getByRole('button',{name:'By section',exact:true});await section.scrollIntoViewIfNeeded();const sectionBox=await geometry(section);check('nearby grouping focus unobscured '+label,sectionBox.focused&&sectionBox.unobscured&&sectionBox.fullyVisible,sectionBox);
  const card=page.locator('main section button[aria-controls]:not(h2 > button)').first();await card.focus();await card.scrollIntoViewIfNeeded();const cardBox=await geometry(card);check('card focus reachable '+label,cardBox.focused&&cardBox.unobscured&&cardBox.fullyVisible,cardBox);
  check('snapshot disclosure retained '+label,await page.getByText('Showing the built-in snapshot, not live data.',{exact:true}).count()===1);
 }
 for(const factor of [1,2,4]){const actual=await zoom(factor);check('native zoom '+factor,Math.abs(actual-factor)<0.00001);await keyboardChecks('zoom-'+factor*100);}
 await zoom(1);
 for(const size of [{width:320,height:256},{width:375,height:667},{width:390,height:844},{width:768,height:900},{width:1440,height:900}]){await page.setViewportSize(size);await keyboardChecks(size.width+'x'+size.height);}
 await page.setViewportSize({width:1280,height:900});await page.goto(url);await search.waitFor();await search.fill('TKR.');await filter.selectOption('verified');await page.getByRole('button',{name:'By provider',exact:true}).click();
 const countBefore=await page.locator('#guideline-result-count').innerText();await page.getByRole('button',{name:/^Full catalogue/}).click();await page.getByText(/Every entry, fixed order/).waitFor();check('catalogue click sets existing hash',page.url()===url+'#/catalogue',{url:page.url().replace(origin,'LOCAL')});await screenshot('catalogue-click');
 // Root fallback bounds the baseline red run even when no history entry was added.
 if(page.url().endsWith('#/catalogue')){await page.goBack();await search.waitFor();check('Back restores query/filter',await search.inputValue()==='TKR.'&&await filter.inputValue()==='verified'&&await page.locator('#guideline-result-count').innerText()===countBefore);check('Back retains grouping state',await page.getByRole('button',{name:'By provider',exact:true}).getAttribute('aria-pressed')==='true');await page.goForward();await page.getByText(/Every entry, fixed order/).waitFor();check('Forward restores catalogue',page.url().endsWith('#/catalogue'));}else check('Back/Forward catalogue history',false,'Catalogue click did not create a route');
 await page.reload();if(page.url().endsWith('#/catalogue'))await page.getByText(/Every entry, fixed order/).waitFor();else await search.waitFor();check('catalogue refresh persists',await page.getByText(/Every entry, fixed order/).isVisible());await screenshot('catalogue-refresh');
 await page.goto(url+'#/catalogue');await page.getByText(/Every entry, fixed order/).waitFor();check('catalogue direct deep link',true);
 await page.getByRole('button',{name:/^All guidelines/}).click();await search.waitFor();check('Home clears catalogue hash',page.url()===url+'#/');check('reload retains existing fresh search defaults',await search.inputValue()===''&&await filter.inputValue()==='All');
 await page.getByRole('button',{name:'About & methodology',exact:true}).click();await page.waitForURL('**/#/about');await page.getByRole('button',{name:/^Full catalogue/}).click();await page.getByText(/Every entry, fixed order/).waitFor();check('About to catalogue sets hash',page.url()===url+'#/catalogue');
 if(page.url().endsWith('#/catalogue')){await page.goBack();check('Back restores About',page.url().endsWith('#/about'));await page.goForward();await page.getByText(/Every entry, fixed order/).waitFor();check('Forward from About restores catalogue',page.url().endsWith('#/catalogue'));}
 await page.goto(url+'#/catalogue');await page.getByText(/Every entry, fixed order/).waitFor();
 const registration=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return r.scope;});check('PWA base scope',registration===url,{registration:registration.replace(origin,'LOCAL'),base});
 await page.reload();await page.getByText(/Every entry, fixed order/).waitFor();await context.setOffline(true);await page.reload();await page.getByText(/Every entry, fixed order/).waitFor();check('offline deep link survives reload',page.url().endsWith('#/catalogue'));await context.setOffline(false);
 check('all assets local and present',requests.every(r=>r.status===200&&r.method==='GET'),requests.filter(r=>r.status!==200));check('no runtime/network errors',errors.length===0,errors);
}catch(error){results.push({name:'runner completion',status:/Executable doesn't exist/.test(error.message)?'BLOCKED':'FAIL',detail:error.stack});}
finally{
 if(context){try{await context.tracing.stop({path:path.join(report,'trace.zip')});}finally{await context.close();}}
 if(server)await new Promise(r=>server.close(r));
 fs.writeFileSync(path.join(report,'results.json'),JSON.stringify({base,results,requests,routes,errors},null,2));
 const failed=results.filter(r=>r.status==='FAIL').length,blocked=results.filter(r=>r.status==='BLOCKED').length;console.log(results.filter(r=>r.status==='PASS').length+' passed, '+failed+' failed, '+blocked+' blocked');process.exitCode=failed?1:blocked?2:0;
}
