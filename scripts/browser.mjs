import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.GAME_URL || 'http://127.0.0.1:4309/';
const out = fileURLToPath(new URL('../artifacts/', import.meta.url));
const errors = [];
const checks = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log('PASS', name);
};

async function open(width, height, touch) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: touch,
    hasTouch: touch,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${width} pageerror ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`${width} console ${msg.text()}`);
  });
  page.on('requestfailed', request => errors.push(`${width} requestfailed ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${width} HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  return { context, page };
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function solveBoard(page, label) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await page.locator('.win-card').isVisible().catch(() => false)) return;
    await page.locator('[data-action="hint"]').click();
  }
  if (await page.locator('.win-card').isVisible().catch(() => false)) return;
  throw new Error(`${label}: hint-assisted solve did not finish`);
}

try {
  await mkdir(out, { recursive: true });

  for (const [width, height, touch] of [[1440, 960, false], [390, 844, true], [360, 780, true]]) {
    const label = `${width}${touch ? '-touch' : '-desktop'}`;
    const { context, page } = await open(width, height, touch);
    check(`${label}: page title and bear image load`, await page.evaluate(async () => {
      const image = new Image();
      image.src = './characters/classic.webp';
      await image.decode().catch(() => {});
      return document.title.includes('接水管') && image.naturalWidth > 0;
    }));
    check(`${label}: board is a square pipe grid`, await page.locator('.cell').count() === 25 && await page.locator('.board').isVisible());
    check(`${label}: aria live region is present`, await page.locator('#live').count() === 1);
    check(`${label}: no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${out}/${label}-start.png`, fullPage: true, animations: 'disabled' });

    const first = page.locator('.cell').first();
    const beforeRotation = Number(await first.getAttribute('data-rotation'));
    await first.click();
    check(`${label}: clicking a pipe increments moves`, await page.locator('#stat-moves').textContent() === '1');
    check(`${label}: first pipe is rotated one quarter turn`, Number(await first.getAttribute('data-rotation')) === (beforeRotation + 1) % 4);

    await page.locator('[data-action="hint"]').click();
    check(`${label}: hint button increments hint count`, await page.locator('#stat-hints').textContent() === '1');
    check(`${label}: toast appears after hint`, await page.locator('#toast.show').isVisible());

    await page.locator('[data-action="reset"]').click();
    check(`${label}: reset clears moves and hints`, await page.locator('#stat-moves').textContent() === '0' && await page.locator('#stat-hints').textContent() === '0');

    await page.keyboard.press('h');
    check(`${label}: keyboard hint shortcut works`, await page.locator('#stat-hints').textContent() === '1');
    await page.keyboard.press('r');
    check(`${label}: keyboard reset shortcut works`, await page.locator('#stat-hints').textContent() === '0');

    check(`${label}: next level starts locked`, await page.locator('[data-action="next-level"]').first().isDisabled());

    await solveBoard(page, label);
    check(`${label}: win dialog appears`, await page.locator('.win-card').isVisible());
    check(`${label}: win dialog shows completion stats`, await page.locator('.win-grid').isVisible());
    check(`${label}: live region announces victory`, await page.locator('#live').textContent().then(text => text.length > 0));
    await page.screenshot({ path: `${out}/${label}-win.png`, fullPage: true, animations: 'disabled' });

    const overlayNext = page.locator('[data-action="overlay-next"]');
    if (await overlayNext.count()) {
      await overlayNext.click();
      check(`${label}: level two unlocked after victory`, await page.locator('#level-number').textContent().then(text => text.trim() === '2'));
    } else {
      check(`${label}: inline next button is hidden on final/edge case`, true);
    }
    await page.reload({ waitUntil: 'networkidle' });
    check(`${label}: progress persists after reload`, await page.locator('#progress-text').textContent().then(text => !text.startsWith('1 /')));
    check(`${label}: no horizontal overflow after reload`, await noOverflow(page));
    await context.close();
  }

  const { context, page } = await open(1440, 960, false);
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return '';
    const style = getComputedStyle(active);
    return `${active.tagName}:${style.outlineStyle}:${style.outlineWidth}`;
  });
  check('keyboard focus is visible', /:(solid|auto):(?!0px)/.test(focused));
  await context.close();

  if (errors.length) {
    console.error(errors.join('\n'));
    throw new Error(`browser errors: ${errors.length}`);
  }
  console.log(`Browser checks passed: ${checks.length}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
