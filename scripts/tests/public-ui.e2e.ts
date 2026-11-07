/**
 * scripts/tests/public-ui.e2e.ts
 * ──────────────────────────────
 * Browser regression test for the PUBLIC site's accessibility and layout
 * fixes: real Chromium (the repo's existing Playwright dev dependency), real
 * production build, compiled-in snapshot data.
 *
 * Safety, by construction:
 *   - the app is built into a temporary directory with VITE_SUPABASE_URL set to
 *     a dead LOOPBACK address, so the browser never even attempts a request to
 *     a *.supabase.co host;
 *   - every non-loopback request is aborted and recorded, and the run FAILS if
 *     there was any; service workers are blocked;
 *   - nothing is written anywhere except the temporary build directory.
 *
 * Not part of `npm run test:offline` (it needs a browser and a build, ~1 min).
 * Run:   npm run test:ui        (or: npx tsx scripts/tests/public-ui.e2e.ts)
 * Needs: npx playwright install chromium   (once per machine)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { chromium, type Page } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';

// Browser-side globals, used only inside page.evaluate callbacks. Declared here
// rather than adding the DOM lib to every script (as e2e.ts does).
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const getComputedStyle: any;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-public-ui-'));
const PORT = 5287;
const APP = `http://127.0.0.1:${PORT}/ortho-guidelines-hub/`;
const VITE = path.join(REPO, 'node_modules/vite/bin/vite.js');
function removeBuildOutput() {
  if (path.dirname(path.resolve(OUT)) !== path.resolve(os.tmpdir()) || !path.basename(OUT).startsWith('ortho-public-ui-')) throw new Error('Unsafe browser-output cleanup');
  fs.rmSync(OUT, {recursive:true,force:true});
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log(`[build] vite build → ${OUT}`);
const build = spawnSync(process.execPath, [VITE, 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: REPO,
  env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'public-ui-e2e-not-a-key' },
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  process.exit(1);
}

const preview = spawn(process.execPath, [VITE, 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: REPO, stdio: 'pipe' });
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite preview did not start')), 30000);
  preview.stdout!.on('data', (d: Buffer) => { if (d.toString().includes(String(PORT))) { clearTimeout(t); resolve(); } });
  preview.on('exit', (code) => reject(new Error(`vite preview exited ${code}`)));
});

const external: string[] = [];
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const browser = await chromium.launch();

async function open(width: number, height = 800, hash = ''): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', hasTouch: width <= 768 });
  await ctx.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === '127.0.0.1' || host === 'localhost') return route.continue();
    // index.html's web-font stylesheet is the site's one expected third-party
    // request; it is still aborted (the test is offline), just not a failure.
    if (!FONT_HOSTS.has(host)) external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await ctx.newPage();
  await page.goto(APP + hash);
  await page.waitForFunction(() => document.querySelectorAll('main button[aria-expanded]').length > 5, null, { timeout: 30000 });
  return page;
}

async function unnamedControls(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree') as { nodes: any[] };
  const roles = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox']);
  return nodes.filter(n => !n.ignored && roles.has(n.role?.value) && !(n.name?.value ?? '').trim()).map(n => n.role.value);
}

const expandedCount = (page: Page) => page.locator('main button[aria-expanded="true"]').count();

try {
  // ── Desktop ────────────────────────────────────────────────────────────────
  console.log('\n[1] Search, filtering, result count, empty state (1280px)');
  {
    const page = await open(1280);
    const search = page.getByRole('searchbox', { name: 'Search guidelines' });
    check('search box is a labelled searchbox', await search.count() === 1);
    check('link-status filter is named', await page.getByRole('combobox', { name: 'Filter by link-check status' }).count() === 1);
    check('no unnamed controls (desktop)', (await unnamedControls(page)).length === 0, (await unnamedControls(page)).join());

    await search.fill('fracture');
    const status = page.locator('#guideline-result-count');
    await page.waitForTimeout(150);
    const countText = (await status.textContent()) ?? '';
    check('result count is a live region', (await status.getAttribute('role')) === 'status');
    check('result count reports the filtered total', /^\d+ of \d+ guidelines match$/.test(countText), countText);
    check('matching cards are shown', await page.locator('main section').count() > 0);

    await search.fill('   ');
    await page.waitForTimeout(150);
    check('a whitespace-only query does not empty the list', await page.getByText(/^No guidelines match/).count() === 0
      && await page.locator('main section').count() > 0);

    await search.fill('zzqxv-no-such-topic');
    await page.waitForTimeout(150);
    check('empty state names the query', await page.getByText('No guidelines match “zzqxv-no-such-topic”.').count() === 1);
    const clear = page.getByRole('button', { name: 'Clear search and filters' });
    check('empty state offers a way out', await clear.count() === 1);
    await clear.click();
    check('clearing restores the list', await page.locator('main section').count() > 0 && (await search.inputValue()) === '');
    check('clearing returns focus to the search box', await page.evaluate(() => document.activeElement?.id) === 'guideline-search');

    // Focus indicator on the search box: ring-slate-500, measured after the
    // 150ms box-shadow transition.
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const shadow: string = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
    check('search box shows a visible focus ring', shadow.includes('rgb(100, 116, 139)'), shadow);

    console.log('\n[2] Keyboard: skip link, section headers, cards');
    {
      // A fresh page: Chrome keeps the sequential-focus starting point after
      // blur(), so "the first Tab stop" is only meaningful from a clean load.
      const fresh = await open(1280);
      await fresh.keyboard.press('Tab');
      check('first Tab stop is the skip link', (await fresh.evaluate(() => document.activeElement?.textContent?.trim())) === 'Skip to guidelines');
      await fresh.keyboard.press('Enter');
      check('skip link moves focus to the main region', await fresh.evaluate(() => document.activeElement?.id) === 'main-content');
      check('skip link leaves the URL hash alone (the app routes on it)', !(fresh.url().includes('#main-content')));
      await fresh.context().close();
    }

    const header = page.locator('main section > h2 > button').first();
    check('section headers are heading-wrapped buttons', await header.count() === 1);
    await header.focus();
    check('section header starts expanded', (await header.getAttribute('aria-expanded')) === 'true');
    await page.keyboard.press('Enter');
    check('Enter collapses a section', (await header.getAttribute('aria-expanded')) === 'false');
    await page.keyboard.press('Space');
    check('Space re-expands it', (await header.getAttribute('aria-expanded')) === 'true');

    const card = page.locator('main section button[aria-controls][aria-expanded="false"]').first();
    const before = await expandedCount(page);
    await card.focus();
    await page.keyboard.press('Enter');
    check('Enter expands a card', (await expandedCount(page)) === before + 1);
    const bodyId = await page.locator('main section button[aria-controls][aria-expanded="true"]').nth(1).getAttribute('aria-controls');
    check('card button controls its expanded body', !!bodyId && await page.locator(`[id="${bodyId}"]`).count() === 1);
    check('nothing interactive is nested inside another control', await page.evaluate(() =>
      [...document.querySelectorAll('button, [role="button"]')].filter((el: any) => el.querySelector('a[href], button, input, select')).length) === 0);
    check('sidebar marks the current view', await page.locator('#sections-drawer [aria-current="page"]').count() === 1);
    check('exactly one h1', await page.locator('h1').count() === 1);
    const explanation = page.locator('summary[aria-label$="guidance status explanation"]').first();
    await explanation.focus(); await page.keyboard.press('Enter');
    check('a guidance-status explanation opens with the keyboard', await explanation.evaluate((element: any) => element.parentElement.open));
    await page.keyboard.press('Space');
    check('a guidance-status explanation closes with the keyboard', !(await explanation.evaluate((element: any) => element.parentElement.open)));

    console.log('\n[3] External links and the absence of editorial controls (signed out)');
    const links = await page.evaluate(() => [...document.querySelectorAll('a[target="_blank"]')].map((a: any) => ({ rel: a.rel, text: a.textContent })));
    check('there are new-tab links on the page', links.length > 0);
    check('every new-tab link has rel="noopener noreferrer"', links.every(l => /noopener/.test(l.rel) && /noreferrer/.test(l.rel)));
    check('every new-tab link announces that it opens a new tab', links.every(l => l.text.includes('(opens in a new tab)')));
    const editorial = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b: any) => /^(Edit guideline|Add guideline|Add|Mark link checked today|Delete|Merge)/.test(b.textContent.trim())).length
      + document.querySelectorAll('select[aria-label="Set link check status"]').length);
    check('no editorial controls are offered to a signed-out visitor', editorial === 0, String(editorial));
    await page.context().close();
  }

  console.log('\n[4] Guidance status on the collapsed card');
  {
    const nonCurrent = GUIDELINES_DATA.find(g => g.guidanceStatus !== 'current');
    if (!nonCurrent) {
      check('catalogue has a non-current entry to test with (skipped: none)', true);
    } else {
      const page = await open(1280);
      await page.getByRole('searchbox', { name: 'Search guidelines' }).fill(nonCurrent.topic);
      await page.waitForTimeout(150);
      const row = page.locator('main section button[aria-controls]', { hasText: nonCurrent.topic }).first().locator('xpath=..');
      const text = (await row.textContent()) ?? '';
      check(`collapsed card shows a non-current status (${nonCurrent.id}: ${nonCurrent.guidanceStatus})`, /Guidance status: /.test(text), text.slice(0, 120));
      await page.context().close();
    }
  }

  // ── Mobile ─────────────────────────────────────────────────────────────────
  console.log('\n[5] Mobile drawer keyboard behaviour (375px)');
  {
    const page = await open(375, 812);
    check('no unnamed controls (mobile)', (await unnamedControls(page)).length === 0, (await unnamedControls(page)).join());
    await page.evaluate(() => document.activeElement?.blur());
    let drawerStops = 0;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => !!document.activeElement?.closest('#sections-drawer'))) drawerStops++;
    }
    check('the closed drawer contributes no Tab stops', drawerStops === 0, `${drawerStops} stops`);
    const menu = page.getByRole('button', { name: 'Open sections menu' });
    await menu.click();
    await page.waitForTimeout(350);
    check('opening the drawer moves focus into it', await page.evaluate(() => !!document.activeElement?.closest('#sections-drawer')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    check('Escape closes the drawer', await page.getByRole('button', { name: 'Open sections menu' }).getAttribute('aria-expanded') === 'false');
    check('Escape returns focus to the menu button', await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')) === 'sections-drawer');
    await menu.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: /^Full catalogue/ }).click();
    await page.waitForTimeout(350);
    check('choosing a view closes the drawer and keeps focus on the page (not <body>)',
      await page.evaluate(() => document.activeElement && document.activeElement !== document.body));
    await page.context().close();
  }

  console.log('\n[6] No horizontal overflow');
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440]) {
    const page = await open(width);
    await page.locator('main section button[aria-controls][aria-expanded="false"]').first().click();
    if (width === 320) {
      const explanation = page.locator('summary[aria-label$="guidance status explanation"]').first();
      await explanation.tap();
      check('a status explanation opens on a touch viewport', await explanation.evaluate((element: any) => element.parentElement.open));
      check('its explanatory text is visible without hovering', await explanation.locator('..').locator('p').isVisible());
    }
    await page.waitForTimeout(150);
    const o = await page.evaluate(() => {
      const d = document.documentElement; const m = document.querySelector('main');
      return { doc: d.scrollWidth - d.clientWidth, main: m.scrollWidth - m.clientWidth };
    });
    check(`no horizontal overflow at ${width}px (card expanded)`, o.doc <= 0 && o.main <= 0, JSON.stringify(o));
    await page.context().close();
  }

  check('no request was attempted to *.supabase.co or any unexpected host (web fonts excepted)', external.length === 0, external.slice(0, 3).join(' '));
} finally {
  await browser.close();
  preview.kill();
  removeBuildOutput();
}

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
