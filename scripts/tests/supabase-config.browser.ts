/**
 * Browser isolation test without Supabase/Docker/SQL. Fresh browser contexts;
 * every external HTTP/WebSocket is intercepted, service workers are blocked.
 * Only local Vite traffic is continued; local API requests are fulfilled mocks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chromium } from 'playwright';

const root=process.cwd();
const vite=path.join(root,'node_modules/vite/bin/vite.js');
const key='sb_publishable_SYNTHETIC_PUBLIC_TEST_KEY';
const productionUrl='https://xutjahmbyrvifcltpxxu.supabase.co';
const base='/ortho-guidelines-hub/';
let passed=0;
const check=(name:string, condition:boolean)=>{assert.ok(condition,name);passed++;console.log('PASS '+name);};
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>
  ['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(name.toUpperCase())));
for(const file of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local']){
  if(fs.existsSync(path.join(root,file)))throw new Error('Run this browser harness in an isolated checkout without env files. Their contents are not read.');
}
const executable=[chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file)=>fs.existsSync(file));
if(!executable)throw new Error('No installed Chromium/Chrome/Edge available; install a browser separately. Nothing was downloaded.');
async function freePort():Promise<number>{
  const server=net.createServer();
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  const address=server.address();assert(address&&typeof address!=='string');
  await new Promise<void>((resolve)=>server.close(()=>resolve()));
  return address.port;
}
function stop(child:ChildProcess){
  if(!child.pid)return;
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  else child.kill('SIGTERM');
}
async function start(args:string[], variables:Record<string,string>={}){
  const port=await freePort();
  const child=spawn(process.execPath,[vite,...args,'--host','127.0.0.1','--port',String(port),'--strictPort'],{
    cwd:root,env:{...env,...variables},stdio:['ignore','pipe','pipe'],windowsHide:true,
  });
  let log='';child.stdout?.on('data',(s)=>{log+=String(s);});child.stderr?.on('data',(s)=>{log+=String(s);});
  const origin='http://127.0.0.1:'+port;
  try {
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error('Vite failed: '+log);
      try{if((await fetch(origin+base,{signal:AbortSignal.timeout(500)})).ok)return {child,origin};}catch{/* local server starting */}
      await new Promise((resolve)=>setTimeout(resolve,100));
    }
    throw new Error('Local Vite startup timed out');
  }catch(error){stop(child);throw error;}
}
const browser=await chromium.launch({executablePath:executable,headless:true});
try{
  async function scenario(name:string, args:string[], variables:Record<string,string>, enabled:boolean, preview=false){
    const server=await start(args,variables);
    const context=await browser.newContext({serviceWorkers:'block'});
    const forbidden:string[]=[];const sockets:string[]=[];let mockedApi=0;
    try{
      await context.route('**/*',async(route)=>{
        const url=new URL(route.request().url());
        if(url.origin===server.origin)return route.continue();
        if(url.hostname==='127.0.0.1'&&url.port==='54321'){
          mockedApi++;
          return route.fulfill({status:route.request().method()==='OPTIONS'?204:200,contentType:'application/json',
            headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:route.request().method()==='OPTIONS'?'':'[]'});
        }
        if(url.hostname.endsWith('.supabase.co'))forbidden.push(url.origin);
        return route.abort(); // fonts and all other external requests also cannot leave
      });
      await context.routeWebSocket('**/*',(socket)=>{
        const target=new URL(socket.url());
        if(target.hostname==='127.0.0.1'&&target.port===new URL(server.origin).port){socket.connectToServer();return;}
        sockets.push(target.origin);socket.close(); // do not connect to the remote server
      });
      await context.addInitScript(()=>{
        localStorage.setItem('sb-xutjahmbyrvifcltpxxu-auth-token',JSON.stringify({
          access_token:'synthetic-expired-token',refresh_token:'synthetic-refresh-token',expires_at:1,
          user:{id:'synthetic-user'},
        }));
      });
      const page=await context.newPage();
      await page.goto(server.origin+base);
      await page.locator('main').waitFor();
      if(!preview){
        const state=await page.evaluate(async(url)=>{
          const module=await import(url);
          return {enabled:module.isSupabaseEnabled,reason:module.supabaseConfiguration.reason};
        },server.origin+base+'src/lib/supabase.ts');
        check(name+': actual client enablement matches policy',state.enabled===enabled);
      }else{
        await page.getByText('Offline snapshot',{exact:true}).waitFor();
        check(name+': built app stays on static snapshot',true);
      }
      await page.waitForTimeout(500);
      check(name+': zero production Supabase attempts',forbidden.length===0);
      check(name+': zero non-app WebSocket attempts',sockets.length===0);
      check(name+': local API only when explicitly configured',enabled?mockedApi>0:mockedApi===0);
    }finally{await context.close();stop(server.child);}
  }
  await scenario('missing variables with stale stored session',[],{},false);
  await scenario('accidental production URL in development',[],{VITE_SUPABASE_URL:productionUrl,VITE_SUPABASE_ANON_KEY:key},false);
  await scenario('explicit loopback API fulfilled by mock',[],{VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:key},true);
  await scenario('test mode overrides remote opt-in',['--mode','test'],{
    VITE_SUPABASE_URL:productionUrl,VITE_SUPABASE_ANON_KEY:key,VITE_ALLOW_REMOTE_SUPABASE_IN_LOCAL:'true',
  },false);
  const output=path.join(root,'reports/local-supabase-preview-build');
  const build=spawnSync(process.execPath,[vite,'build','--outDir',output],{cwd:root,env:{
    ...env,VITE_SUPABASE_URL:productionUrl,VITE_SUPABASE_ANON_KEY:key,
  },encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/local-supabase-browser-build.log'),String(build.stdout)+String(build.stderr));
  check('production-configured synthetic-key preview bundle builds',build.status===0);
  await scenario('production-mode bundle served by local preview',['preview','--outDir',output],{},false,true);
}finally{await browser.close();}
console.log(passed+' passed, 0 failed');
