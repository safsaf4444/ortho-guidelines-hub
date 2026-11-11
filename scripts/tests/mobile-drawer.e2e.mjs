/**
 * Mobile sections drawer: keyboard and background-interaction regression (browser review, CONDITIONAL PASS finding:
 * Tab escaped the open drawer to the dimmed background search field), adapted to the Search V2 markup (inert closed drawer,`n * labelled type=search field) with the integrated grouping-control and reading-size checks. Self-contained: starts its own local Vite
 * server with no Supabase configuration (built-in snapshot) and aborts every non-loopback request.
 */
import fs from 'node:fs';import net from 'node:net';import path from 'node:path';import {spawn} from 'node:child_process';import {chromium} from 'playwright';
const results=[];const check=(scenario,name,ok,detail)=>{results.push({scenario,name,passed:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+scenario+': '+name+(!ok&&detail!==undefined?' :: '+JSON.stringify(detail).slice(0,240):''));};
const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
const origin='http://127.0.0.1:'+port;
// An explicit, unreachable loopback API: Search V2 requires explicit configuration; a loopback API keeps the test hermetic
// and the production project must never be contacted. Loopback API requests are
// aborted, so the App shows its built-in snapshot; any other non-loopback request still fails the test.
const api='http://127.0.0.1:9';
const env={...Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(k.toUpperCase()))),VITE_SUPABASE_URL:api,VITE_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_DRAWER_TEST'};
const server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,windowsHide:true,stdio:'pipe'});
const browser=await chromium.launch({headless:true});
const active=page=>page.evaluate(()=>{const e=document.activeElement;return {tag:e?.tagName,label:e?.getAttribute('aria-label')||(e?.textContent||'').trim().slice(0,30),inDrawer:!!e?.closest('#sections-drawer'),isMenu:e?.getAttribute('aria-controls')==='sections-drawer',inMain:!!e?.closest('main'),isBody:e===document.body};});
async function fresh(width){const ctx=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block'});const blocked=[];
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.origin!==api&&!/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))blocked.push(u.hostname);return route.abort();});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/ortho-guidelines-hub/');await page.locator('main').waitFor();await page.waitForTimeout(300);return {ctx,page,errors,blocked};}
const menu=page=>page.locator('header button[aria-controls="sections-drawer"]');
async function scenario(name,width,fn){const {ctx,page,errors,blocked}=await fresh(width);try{await fn(page);}catch(e){check(name,'scenario completed',false,e.message.split('\n')[0]);}finally{check(name,'no runtime errors',errors.length===0,errors);check(name,'no non-loopback request',blocked.length===0,[...new Set(blocked)]);await ctx.close();}}
try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/ortho-guidelines-hub/')).ok)break;}catch{/* starting */}await new Promise(r=>setTimeout(r,100));}
 for(const width of [320,375]){
  const s='mobile-'+width;
  await scenario(s+'-keyboard',width,async page=>{
   await menu(page).focus();await page.keyboard.press('Enter');await page.waitForTimeout(350);
   check(s,'opening by keyboard reports the expanded state',await menu(page).getAttribute('aria-expanded')==='true');
   const opened=await active(page);check(s,'focus moves into the drawer on open',opened.inDrawer,opened);
   const forward=[];for(let i=0;i<30;i++){await page.keyboard.press('Tab');forward.push(await active(page));}
   check(s,'30 forward Tabs never leave the drawer or its menu button',forward.every(a=>a.inDrawer||a.isMenu),forward.filter(a=>!(a.inDrawer||a.isMenu)).slice(0,3));
   check(s,'forward Tab cycles back through the menu button',forward.some(a=>a.isMenu));
   const backward=[];for(let i=0;i<30;i++){await page.keyboard.press('Shift+Tab');backward.push(await active(page));}
   check(s,'30 backward Tabs never leave the drawer or its menu button',backward.every(a=>a.inDrawer||a.isMenu),backward.filter(a=>!(a.inDrawer||a.isMenu)).slice(0,3));
   check(s,'the background search field is never reached',![...forward,...backward].some(a=>a.label==='Search guidelines'||a.inMain));
   check(s,'background main content is inert while the drawer is open',await page.locator('main').evaluate(e=>e.inert===true));
   const search=page.getByLabel('Search guidelines');await search.evaluate(e=>e.focus());
   check(s,'programmatic focus cannot reach the inert background search field',!(await search.evaluate(e=>e===document.activeElement)));
   await page.keyboard.press('Escape');await page.waitForTimeout(350);
   check(s,'Escape closes the drawer',await menu(page).getAttribute('aria-expanded')==='false');
   check(s,'Escape returns focus to the menu button',(await active(page)).isMenu);
   check(s,'closing restores the background (not inert)',await page.locator('main').evaluate(e=>e.inert===false));
   check(s,'the closed drawer is hidden from keyboard and assistive technology',await page.locator('#sections-drawer').evaluate(e=>e.inert===true||getComputedStyle(e).visibility==='hidden'));
  });
  await scenario(s+'-browse',width,async page=>{
   const group=page.getByRole('group',{name:/Group/});
   check(s,'the grouping control is available on mobile (public UI review)',await group.isVisible());
   await page.getByRole('button',{name:'By provider'}).click();check(s,'grouping can be changed on mobile',await page.getByRole('button',{name:'By provider'}).getAttribute('aria-pressed')==='true');
   check(s,'browse inputs are at least 44px tall and 16px text (no mobile zoom)',await page.getByLabel('Search guidelines').evaluate(e=>e.getBoundingClientRect().height>=44&&parseFloat(getComputedStyle(e).fontSize)>=16));
   check(s,'no horizontal overflow with the grouping control shown',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth));
  });
  await scenario(s+'-pointer',width,async page=>{
   await menu(page).click();await page.waitForTimeout(350);
   await page.mouse.click(width-10,400);await page.waitForTimeout(350);
   check(s,'a click on the dimmed background closes the drawer instead of reaching the page',await menu(page).getAttribute('aria-expanded')==='false');
   check(s,'after a background click, focus returns to the menu button',(await active(page)).isMenu);
   await menu(page).click();await page.waitForTimeout(350);
   await page.getByRole('button',{name:'All guidelines'}).click();await page.waitForTimeout(350);
   check(s,'choosing a section closes the drawer and returns focus to the menu button',await menu(page).getAttribute('aria-expanded')==='false'&&(await active(page)).isMenu);
  });
 }
 await scenario('desktop-1024',1024,async page=>{
  check('desktop-1024','the sidebar is ordinary navigation: nothing is inert',await page.locator('main').evaluate(e=>e.inert===false));
  const search=page.getByLabel('Search guidelines');await search.focus();
  check('desktop-1024','the search field is reachable',await search.evaluate(e=>e===document.activeElement));
 });
 await scenario('resize-open-to-desktop',375,async page=>{
  await menu(page).click();await page.waitForTimeout(350);await page.setViewportSize({width:1024,height:800});await page.waitForTimeout(350);
  check('resize-open-to-desktop','widening the viewport with the drawer open removes the background inert state',await page.locator('main').evaluate(e=>e.inert===false));
 });
}finally{await browser.close();server.kill();}
const failed=results.filter(r=>!r.passed).length;fs.mkdirSync('reports/mobile-drawer',{recursive:true});fs.writeFileSync('reports/mobile-drawer/mobile-drawer.json',JSON.stringify({passed:results.length-failed,failed,results},null,2)+'\n');
console.log((results.length-failed)+' passed, '+failed+' failed');process.exitCode=failed?1:0;
