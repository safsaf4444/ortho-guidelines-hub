import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve('dist-reader');
const allowed = new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL']);
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase()))), CI: 'true', NO_COLOR: '1' };
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req,res) => {
  const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const requested = path.resolve(root, name === '/' ? 'index.html' : '.' + name);
  const target = requested.startsWith(root + path.sep) && fs.existsSync(requested) ? requested : path.join(root,'index.html');
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  res.end(fs.readFileSync(target));
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel:'chromium', env, args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const context = await browser.newContext({ serviceWorkers:'allow' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil:'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.getByRole('searchbox',{name:'Search guidelines'}).waitFor();
  const count = await page.getByText('231 entries').count();
  if (!count) throw new Error('Offline reload did not render the 231-entry reader');
  console.log('1 passed, 0 failed - controlled reader reload works offline');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
