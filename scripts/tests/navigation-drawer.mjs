import { chromium } from 'playwright';
import strict from 'node:assert/strict';
import { createAssertionReport } from './browser-assertion-report.mjs';
import { safeEnvironment } from '../lib/release-gate.mjs';
import { mkdir } from 'node:fs/promises';

const url = process.env.UI_URL || 'http://127.0.0.1:5178/ortho-guidelines-hub/';
strict.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Use a local preview only');
const report = createAssertionReport('reports/navigation-drawer/assertions.json');
let browser;
try {
browser = await chromium.launch({ env: safeEnvironment(), channel: process.env.UI_BROWSER || 'msedge', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] });
  for (const width of [320, 375, 767]) {
    report.scenario('mobile-' + width);
    const assert = report.assert;
    let context;
    try {
    context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const unexpected = [];
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.origin === new URL(url).origin) return route.continue();
      // The unchanged development HTML references Google Fonts. As in A,
      // these known requests are aborted, never fetched; static preview removes them.
      if (!['http://127.0.0.1:9', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(target.origin)) unexpected.push(target.origin);
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('main section button[aria-controls]:not(h2 > button)').first().waitFor();
    const readingSurface = await page.locator('main input').evaluate(el => ({
      height: el.getBoundingClientRect().height,
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      mainOverflow: el.closest('main').scrollWidth > el.closest('main').clientWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.ok(readingSurface.height >= 44 && readingSurface.fontSize >= 16, "readingSurface.height >= 44 && readingSurface.fontSize >= 16");
    assert.equal(readingSurface.mainOverflow, false, "readingSurface.mainOverflow");
    assert.equal(readingSurface.pageOverflow, false, "readingSurface.pageOverflow");
    const menu = page.getByRole('button', { name: 'Open sections menu', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Sections', exact: true });
    const close = dialog.getByRole('button', { name: 'Close sections menu' });
    const focused = locator => locator.evaluate(el => el === document.activeElement);
    const open = async () => {
      await menu.focus(); await page.keyboard.press('Enter');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-modal'), 'true', "await dialog.getAttribute('aria-modal')");
      assert.equal(await close.evaluate(el => el === document.activeElement), true, "await close.evaluate(el => el === document.activeElement)");
      assert.equal(await page.locator('dialog').evaluate(el => el.matches(':modal')), true, "await page.locator('dialog').evaluate(el => el.matches(':modal'))");
    };
    await open();
    const controls = dialog.getByRole('button');
    const names = await controls.allTextContents();
    assert.equal(names.length, 6, "names.length");
    for (let index = 1; index < names.length; index++) {
      await page.keyboard.press('Tab'); assert.equal(await focused(controls.nth(index)), true, "await focused(controls.nth(index))");
    }
    await page.keyboard.press('Tab'); assert.equal(await focused(close), true, "await focused(close)");
    await page.keyboard.press('Shift+Tab'); assert.equal(await focused(controls.last()), true, "await focused(controls.last())");
    await page.keyboard.press('Tab');
    await page.locator('main input').evaluate(el => el.focus());
    assert.equal(await focused(close), true, 'Native modality must reject background focus');
    // Use the browser accessibility tree: DOM-derived snapshots do not account
    // for the native modal dialog's implicit inertness.
    const cdp = await context.newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const exposed = nodes.filter(node => !node.ignored);
    assert.ok(exposed.some(node => node.role?.value === 'dialog' && node.name?.value === 'Sections'), "exposed.some(node => node.role?.value === 'dialog' && node.name?.value === 'Sections')");
    assert.ok(!exposed.some(node => node.role?.value === 'textbox'), 'Background must be absent from accessibility tree');
    await cdp.detach();
    await mkdir('reports/navigation-drawer', { recursive: true });
    await page.screenshot({ path: `reports/navigation-drawer/open-${width}.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true, "await focused(menu)");
    await open(); await close.click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true, "await focused(menu)");
    await open();
    await page.locator('main input').evaluate(el => { window.backgroundClicks = 0; el.addEventListener('click', () => window.backgroundClicks++); });
    await page.mouse.click(width - 15, 90);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.backgroundClicks), 0, 'Backdrop click must not activate background');
    assert.equal(await focused(menu), true, "await focused(menu)");
    await open(); await dialog.getByRole('button', { name: 'Full catalogue' }).click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true, "await focused(menu)");
    await open(); await dialog.getByRole('button', { name: 'All guidelines' }).click();
    await page.getByRole('button', { name: 'By provider', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'By provider', exact: true }).getAttribute('aria-pressed'), 'true', "await page.getByRole('button', { name: 'By provider', exact: true }).getAttribute('aria-pressed')");
    assert.equal(await page.locator('main section button[aria-controls]:not(h2 > button)').count(), 231, "await page.locator('main section button[aria-controls]:not(h2 > button)').count()");
    await open();
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole('complementary', { name: 'Sections' }).waitFor();
    assert.equal(await page.locator('dialog:modal').count(), 0, "await page.locator('dialog:modal').count()");
    await page.locator('main input').focus(); assert.equal(await focused(page.locator('main input')), true, "await focused(page.locator('main input'))");
    await page.setViewportSize({ width, height: 900 });
    await menu.waitFor(); assert.equal(await menu.getAttribute('aria-expanded'), 'false', "await menu.getAttribute('aria-expanded')");
    await context.setOffline(true);
    await open(); await page.keyboard.press('Shift+Tab');
    assert.equal(await focused(dialog.getByRole('button').last()), true, "await focused(dialog.getByRole('button').last())");
    await page.keyboard.press('Escape'); assert.equal(await focused(menu), true, "await focused(menu)");
    assert.deepEqual(errors, [], 'no runtime errors');
    assert.deepEqual(unexpected, [], 'no unexpected origins beyond blocked synthetic API and known font requests');
    console.log(`PASS drawer ${width}px: focus order/trap, inert background, semantics, Escape, close, backdrop, navigation, reopening, resize, offline`);
    } catch (error) { report.error(error); } finally { await context?.close(); }
  }
} catch (error) { report.error(error); } finally {
  try { await browser?.close(); } catch (error) { report.error(error); }
  report.write();
}
if (report.failed) process.exitCode = 1;
