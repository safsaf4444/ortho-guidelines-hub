/** Static profile is separate from existing GitHub Pages settings. */
import fs from 'node:fs';import assert from 'node:assert/strict';
let passed=0;function check(name:string,ok:boolean){assert.ok(ok,name);passed++;console.log('PASS '+name);}
const profile=fs.readFileSync('vite.static-preview.config.ts','utf8'),builder=fs.readFileSync('scripts/build-static-preview.mjs','utf8'),app=fs.readFileSync('src/App.tsx','utf8');
check('default GitHub Pages prefix preserved',fs.readFileSync('vite.config.ts','utf8').includes("base: '/ortho-guidelines-hub/'"));
check('isolated root prefix explicit',profile.includes("base:'/'"));
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'])check('static profile clears '+key,profile.includes("'import.meta.env."+key+"':JSON.stringify('')"));
check('static profile disables writes',profile.includes("'import.meta.env.VITE_STATIC_PREVIEW':JSON.stringify('true')")&&app.includes("const WRITES_ENABLED: boolean = import.meta.env.VITE_STATIC_PREVIEW !== 'true'"));
check('freshness is unmounted',!app.includes('FreshnessDashboard'));
check('artifact requires clean committed source',builder.includes("git(['status','--porcelain','--untracked-files=all'])"));
check('static CSP denies remote connections',builder.includes("connect-src 'self'")&&builder.includes("form-action 'none'"));
check('preview noindex headers',builder.includes('X-Robots-Tag: noindex, nofollow, noarchive'));
check('preview does not invoke hosting CLI',!/(?:wrangler|railway)\s+(?:deploy|up|publish)/i.test(builder));
console.log(passed+' passed, 0 failed');
