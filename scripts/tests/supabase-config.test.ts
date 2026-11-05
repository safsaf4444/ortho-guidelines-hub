/** Pure offline configuration matrix; no Supabase clients or network. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveBrowserDatabase, isLoopbackHostname, isPublicBrowserKey, DEPLOYED_APP_ORIGIN } from '../../src/lib/supabase-config';

let passed=0;
const check=(name:string, condition:boolean)=>{assert.ok(condition,name);passed++;console.log('PASS '+name);};
const key='sb_publishable_SYNTHETIC_PUBLIC_TEST_KEY';
const productionUrl='https://xutjahmbyrvifcltpxxu.supabase.co';
const dev={productionBuild:false,mode:'development',origin:'http://localhost:5173'};
const preview={productionBuild:true,mode:'production',origin:'http://127.0.0.1:4173'};
const deployed={productionBuild:true,mode:'production',origin:DEPLOYED_APP_ORIGIN};
const env={url:productionUrl,anonKey:key};
const token=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.syntheticSignature';
for(const context of [dev,preview,deployed]){
 for(const missing of [{},{url:productionUrl},{anonKey:key},{url:' ',anonKey:key},{url:productionUrl,anonKey:' '}]){
  check('missing input is disabled in '+context.origin, !resolveBrowserDatabase(missing,context).enabled);
 }
}
for(const url of ['not a URL','http://','javascript:alert(1)','ftp://localhost/postgres',
 'https://user:pass@example.invalid','https://example.invalid/rest/v1','https://example.invalid/?token=x','https://example.invalid/#fragment',
 'http://example.invalid','http://127.0.0.999:54321']){
 check('malformed/unsafe URL refused',!resolveBrowserDatabase({url,anonKey:key},deployed).enabled);
}
for(const bad of ['', 'your-anon-key-here','sb_secret_SYNTHETIC_PRIVATE_KEY','service_role',token('service_role'),'a.not-base64.c',token('authenticated')]){
 check('private/malformed key rejected before client creation',!isPublicBrowserKey(bad));
}
for(const good of [key,token('anon')]) check('public modern/legacy key accepted syntactically',isPublicBrowserKey(good));
for(const url of ['http://localhost:54321','http://127.0.0.1:54321','http://[::1]:54321','http://127.0.0.2:54321']){
 check('explicit loopback is permitted in development',resolveBrowserDatabase({url,anonKey:key},dev).enabled);
 check('explicit loopback is permitted in production-bundle preview',resolveBrowserDatabase({url,anonKey:key},preview).enabled);
 check('deployed app refuses accidental loopback configuration',!resolveBrowserDatabase({url,anonKey:key},deployed).enabled);
}
for(const host of ['localhost.example.com','notlocalhost','127.0.0.1.attacker.invalid','::ffff:127.0.0.1']){
 check('lookalike is not loopback: '+host,!isLoopbackHostname(host));
}
for(const context of [dev,preview,{...preview,origin:'http://192.168.1.5:4173'},{...preview,origin:'https://unrecognised-preview.invalid'}]){
 check('production-valued local/LAN/preview URL disabled by default',!resolveBrowserDatabase(env,context).enabled);
 check('explicit remote local opt-in is required',resolveBrowserDatabase({...env,allowRemoteInLocal:'true'},context).enabled);
}
for(const flag of ['TRUE','1',true,'yes']){
 check('opt-in must be exact string true',!resolveBrowserDatabase({...env,allowRemoteInLocal:flag},dev).enabled);
}
for(const context of [dev,preview,deployed]){
 check('test mode refuses remote even with opt-in',!resolveBrowserDatabase({...env,allowRemoteInLocal:'true'},{...context,mode:'test'}).enabled);
}
check('missing browser origin refuses network client',!resolveBrowserDatabase({url:'http://127.0.0.1:54321',anonKey:key},{productionBuild:false,mode:'test'}).enabled);
check('opaque browser origin refuses network client',!resolveBrowserDatabase(env,{...deployed,origin:'null'}).enabled);
const production=resolveBrowserDatabase(env,deployed);
check('unchanged explicit workflow values can enable deployed app',production.enabled && production.url===productionUrl && production.anonKey===key && production.reason==='explicit-production');
check('deployed-host lookalike does not activate production',!resolveBrowserDatabase(env,{...deployed,origin:'https://safsaf4444.github.io.attacker.invalid'}).enabled);
check('development build on deployed origin still requires opt-in',!resolveBrowserDatabase(env,{...deployed,productionBuild:false}).enabled);
const client=fs.readFileSync('src/lib/supabase.ts','utf8');
check('frontend has no production URL/key defaults',!client.includes('DEFAULT_URL')&&!client.includes('DEFAULT_ANON_KEY')&&!client.includes('.supabase.co'));
check('client creation is guarded by resolved decision',/supabaseConfiguration\.enabled\s*\?\s*createClient/.test(client));
check('production session options preserved',/persistSession:\s*true/.test(client)&&/autoRefreshToken:\s*true/.test(client)&&/detectSessionInUrl:\s*false/.test(client));
check('existing database browser harness is explicitly in test mode',fs.readFileSync('scripts/tests/local-supabase/e2e.ts','utf8').includes("'--mode', 'test'"));
console.log(passed+' passed, 0 failed');
