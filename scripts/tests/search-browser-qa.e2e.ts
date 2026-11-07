/** Actual rendered ranking regressions; synthetic/no-config build, external traffic blocked. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {spawn,spawnSync,type ChildProcess} from 'node:child_process';import {chromium} from 'playwright';
import {GUIDELINES_DATA} from '../../src/data/guidelines-data';
import {applySearchToCatalogue} from '../../src/lib/search/app-adapter';
declare const document:any;
declare const window:any;
declare const requestAnimationFrame:(callback:(time:number)=>void)=>number;
const root=process.cwd(),phase=process.argv[2]??'final',report=path.join(root,'reports/final-release-candidate');
fs.mkdirSync(report,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ortho-search-qa-'));
const env={...Object.fromEntries(Object.entries(process.env).filter(([name])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(name.toUpperCase()))),NODE_OPTIONS:'--require '+JSON.stringify(path.join(root,'scripts/lib/release-network.cjs'))};
for(const file of ['.env','.env.local','.env.production','.env.production.local'])if(fs.existsSync(file))throw Error('Private build configuration is forbidden');
const vite=path.join(root,'node_modules/vite/bin/vite.js');
const build=spawnSync(process.execPath,[vite,'build','--outDir',temporary],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:120000});
fs.writeFileSync(path.join(report,phase+'-browser-build.log'),(build.stdout??'')+'\n'+(build.stderr??''));
if(build.status!==0)throw Error('Safe local browser build failed');
const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));const address=listener.address();if(!address||typeof address==='string')throw Error('No port');const port=address.port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
const origin='http://127.0.0.1:'+port,base='/ortho-guidelines-hub/';
const server=spawn(process.execPath,[vite,'preview','--outDir',temporary,'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,env,windowsHide:true,stdio:'pipe'});
function stop(child:ChildProcess){if(child.pid){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else child.kill();}}
function cleanup(){
 if(path.dirname(path.resolve(temporary))!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('ortho-search-qa-'))throw Error('Unsafe test cleanup');
 fs.rmSync(temporary,{recursive:true,force:true});
}
const browser=await chromium.launch();
let passed=0,failed=0;const external:string[]=[],observations:Array<{query:string;count:string;first:string;notice:string}>=[];
function check(name:string,value:boolean){console.log((value?'PASS ':'FAIL ')+name);if(value)passed++;else failed++;}
try{
 for(let attempt=0;attempt<100;attempt++){try{if((await fetch(origin+base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:800}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();if(!['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))external.push(url.origin);return route.abort();});
 await context.routeWebSocket('**/*',socket=>{external.push(new URL(socket.url()).origin);socket.close();});
 const page=await context.newPage();await page.goto(origin+base);const input=page.getByRole('searchbox',{name:'Search guidelines'});await input.waitFor();
 const fixture=JSON.parse(fs.readFileSync('scripts/tests/fixtures/search-browser-qa.json','utf8')) as {queries:string[]};
 const expected=JSON.parse(fs.readFileSync('scripts/tests/fixtures/search-browser-expectations.json','utf8')) as Array<{query:string;count:number;first?:string}>;
 for(const query of fixture.queries){
  await input.fill(query);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const first=await page.evaluate(()=>([...document.querySelectorAll('main section button[aria-controls]')].filter(button=>!button.closest('h2'))[0]?.textContent??'').trim());
  const count=await page.locator('#guideline-result-count').innerText(),notice=await page.locator('#guideline-result-count').innerText();
  observations.push({query,count,first,notice});
  const target=expected.find(x=>x.query===query);
  check('Claude QA count/empty state '+JSON.stringify(query),Boolean(target)&&parseInt(count,10)===target?.count&&(target?.count!==0||first===''));
  if(target?.first)check('Claude QA supported top record '+JSON.stringify(query),first===target.first);
 }
 const painful=observations.find(row=>row.query==='painful hip replacement')!;
 check('A rendered: qualifier query has results with an explicit partial-match notice',!/^0 of/.test(painful.count)&&/partial|not matched/i.test(painful.notice)&&!!painful.first);
 for(const query of ['THR','TKR']){const row=observations.find(row=>row.query===query)!,top=applySearchToCatalogue(GUIDELINES_DATA,query).ordered[0];check('B rendered: '+query+' preserves the actual engine top result instead of reordering by section',row.first===top?.topic&&/replacement|arthroplasty/i.test(row.first));}
 check('unrelated CES search preserves its established standards-first display',observations.find(row=>row.query==='CES')?.first==='BASS standards of care for cauda equina syndrome');
 await input.fill('THR');await page.getByRole('button',{name:'By provider',exact:true}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const providerFirst=await page.evaluate(()=>([...document.querySelectorAll('main section button[aria-controls]')].filter(button=>!button.closest('h2'))[0]?.textContent??'').trim());
 check('B rendered: provider grouping preserves the exact expected record',providerFirst==='Primary joint replacement - hip, knee and shoulder');
 for(const query of ['THR.','(thr)',' /THR/ ','TKR.','tkr,','THA!','TKA/']){
  await input.fill(query);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const title=await page.evaluate(()=>([...document.querySelectorAll('main section button[aria-controls]')].filter(button=>!button.closest('h2'))[0]?.textContent??'').trim());
  check('punctuated provider top '+query,title==='Primary joint replacement - hip, knee and shoulder');
 }
 await page.getByRole('button',{name:'By section',exact:true}).click();
 for(const query of ['THR.','TKR.','painful, hip replacement','hip replacement painful','hip painful replacement','knee replacement painful']){
  await input.fill(query);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const title=await page.evaluate(()=>([...document.querySelectorAll('main section button[aria-controls]')].filter(button=>!button.closest('h2'))[0]?.textContent??'').trim());
  check('normalized section top '+query,title==='Primary joint replacement - hip, knee and shoulder');
  if(query.includes('painful'))check('visible qualifier disclosure '+query,/Partial matches:.*painful.*not matched/s.test(await page.locator('#guideline-result-count').innerText()));
 }
 await page.getByRole('button',{name:/Clear filters/}).click();
 check('clear resets search and results',(await input.inputValue())===''&&(await page.locator('#guideline-result-count').innerText()).includes('231 guidelines'));
 check('result announcement remains accessible',await page.locator('#guideline-result-count').getAttribute('aria-live')==='polite'&&await input.getAttribute('aria-describedby')==='guideline-result-count');
 await page.evaluate(()=>{window.location.hash='#/about';});await page.getByRole('heading',{name:/About|methodology/i}).first().waitFor();
 await page.evaluate(()=>{window.location.hash='#/';});await input.waitFor();
 check('direct root hash restores catalogue',await input.isVisible());
 check('negative browser QA query stays empty',observations.find(row=>row.query==='zzzznonsenseword')?.first==='');
 check('no database or unexpected external request is attempted',external.length===0);
 fs.writeFileSync(path.join(report,phase+'-browser-qa.json'),JSON.stringify({phase,source:fixture,observations,providerFirst,external,passed,failed},null,2)+'\n');
 await context.close();
}finally{
 await browser.close();stop(server);
 cleanup();
}
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
