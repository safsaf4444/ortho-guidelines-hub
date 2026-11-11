/** Self-contained local Search V2 / native drawer regression runner. */
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
const listener = net.createServer();
await new Promise(resolve => listener.listen(0,'127.0.0.1',resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = 'http://127.0.0.1:' + port;
const env = { ...process.env, VITE_SUPABASE_URL:'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC_DRAWER_TEST' };
const server = spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{env,windowsHide:true,stdio:'pipe'});
try {
  let ready=false;
  for (let attempt=0;attempt<100;attempt++) {
    try { if ((await fetch(origin+'/ortho-guidelines-hub/')).ok) {ready=true;break;} } catch { /* starting */ }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if (!ready) throw Error('Local drawer preview did not start');
  process.env.UI_URL=origin+'/ortho-guidelines-hub/';
  await import('./navigation-drawer.mjs');
} finally { server.kill(); }
