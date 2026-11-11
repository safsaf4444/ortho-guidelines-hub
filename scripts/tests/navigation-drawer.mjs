import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.UI_URL || 'http://127.0.0.1:5178/ortho-guidelines-hub/';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Use a local preview only');
const browser = await chromium.launch({ channel: process.env.UI_BROWSER || 'msedge', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'] });
try {
  for (const width of [320, 375, 767]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
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
    assert.ok(readingSurface.height >= 44 && readingSurface.fontSize >= 16);
    assert.equal(readingSurface.mainOverflow, false);
    assert.equal(readingSurface.pageOverflow, false);
    const menu = page.getByRole('button', { name: 'Open sections menu', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Sections', exact: true });
    const close = dialog.getByRole('button', { name: 'Close sections menu' });
    const focused = locator => locator.evaluate(el => el === document.activeElement);
    const open = async () => {
      await menu.focus(); await page.keyboard.press('Enter');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal(await close.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('dialog').evaluate(el => el.matches(':modal')), true);
    };
    await open();
    const controls = dialog.getByRole('button');
    const names = await controls.allTextContents();
    assert.equal(names.length, 6);
    for (let index = 1; index < names.length; index++) {
      await page.keyboard.press('Tab'); assert.equal(await focused(controls.nth(index)), true);
    }
    await page.keyboard.press('Tab'); assert.equal(await focused(close), true);
    await page.keyboard.press('Shift+Tab'); assert.equal(await focused(controls.last()), true);
    await page.keyboard.press('Tab');
    await page.locator('main input').evaluate(el => el.focus());
    assert.equal(await focused(close), true, 'Native modality must reject background focus');
    // Use the browser accessibility tree: DOM-derived snapshots do not account
    // for the native modal dialog's implicit inertness.
    const cdp = await context.newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const exposed = nodes.filter(node => !node.ignored);
    assert.ok(exposed.some(node => node.role?.value === 'dialog' && node.name?.value === 'Sections'));
    assert.ok(!exposed.some(node => node.role?.value === 'textbox'), 'Background must be absent from accessibility tree');
    await cdp.detach();
    await mkdir('reports/navigation-drawer', { recursive: true });
    await page.screenshot({ path: `reports/navigation-drawer/open-${width}.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true);
    await open(); await close.click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true);
    await open();
    await page.locator('main input').evaluate(el => { window.backgroundClicks = 0; el.addEventListener('click', () => window.backgroundClicks++); });
    await page.mouse.click(width - 15, 90);
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.backgroundClicks), 0, 'Backdrop click must not activate background');
    assert.equal(await focused(menu), true);
    await open(); await dialog.getByRole('button', { name: 'Full catalogue' }).click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(await focused(menu), true);
    await open(); await dialog.getByRole('button', { name: 'All guidelines' }).click();
    await page.getByRole('button', { name: 'By provider', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'By provider', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('main section button[aria-controls]:not(h2 > button)').count(), 231);
    await open();
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole('complementary', { name: 'Sections' }).waitFor();
    assert.equal(await page.locator('dialog:modal').count(), 0);
    await page.locator('main input').focus(); assert.equal(await focused(page.locator('main input')), true);
    await page.setViewportSize({ width, height: 900 });
    await menu.waitFor(); assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await context.setOffline(true);
    await open(); await page.keyboard.press('Shift+Tab');
    assert.equal(await focused(dialog.getByRole('button').last()), true);
    await page.keyboard.press('Escape'); assert.equal(await focused(menu), true);
    assert.deepEqual(errors, []);
    console.log(`PASS drawer ${width}px: focus order/trap, inert background, semantics, Escape, close, backdrop, navigation, reopening, resize, offline`);
    await context.close();
  }
} finally { await browser.close(); }
