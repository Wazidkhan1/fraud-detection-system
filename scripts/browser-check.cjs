const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');

(async () => {
  const server = spawn(process.execPath, ['src/server.js', '--demo'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser, logs = '';
  server.stderr.on('data', (chunk) => { logs += chunk; });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server readiness timeout. ${logs}`)), 30000);
      server.once('error', (error) => { clearTimeout(timer); reject(error); });
      server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}. ${logs}`)); });
      server.stdout.on('data', (chunk) => {
        logs += chunk;
        const match = logs.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const channel = process.env.BROWSER_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : 'chrome');
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url);
    await expect(page.locator('#total-count')).toHaveText('64');
    await expect(page.locator('#connection')).toHaveText('Live monitoring');
    await expect(page.locator('#transaction-rows tr')).toHaveCount(8);
    mkdirSync(path.resolve(__dirname, '../.data'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../.data/dashboard-desktop.png'), fullPage: true });

    await page.getByRole('button', { name: 'New transaction' }).click();
    await page.locator('[name="merchant"]').fill('Browser test <b>merchant</b>');
    await page.locator('[name="amount"]').fill('100000');
    await page.locator('[name="country"]').selectOption('US');
    await page.locator('[name="channel"]').selectOption('bank_transfer');
    await page.locator('#device-input').fill('unknown-browser-device');
    await page.getByRole('button', { name: 'Analyze transaction' }).click();
    await expect(page.locator('#details-dialog')).toBeVisible();
    await expect(page.locator('#transaction-details')).toContainText('HIGH RISK');
    await expect(page.locator('#transaction-details')).toContainText('Browser test <b>merchant</b>');
    await expect(page.locator('#transaction-details b')).toHaveCount(0);
    await page.locator('#review-note').fill('Browser QA verified this synthetic transaction.');
    await page.getByRole('button', { name: 'Confirm fraud' }).click();
    await expect(page.locator('.review-record')).toContainText('Browser QA verified');
    await page.getByRole('button', { name: 'Close transaction details' }).click();
    await page.locator('#search').fill('Browser test');
    await expect(page.locator('#transaction-rows tr')).toHaveCount(1);
    await expect(page.locator('#ledger-total')).toHaveText('1');
    await page.locator('#risk-filter').selectOption('high');
    await page.locator('#review-filter').selectOption('fraud');
    await expect(page.locator('#ledger-total')).toHaveText('1');
    await page.locator('#search').fill('');
    await page.locator('#risk-filter').selectOption('all');
    await page.locator('#review-filter').selectOption('all');

    await page.locator('[data-page="model"]').click();
    await expect(page.locator('#model-page')).toBeVisible();
    await expect(page.locator('#model-metrics')).toContainText('91.2%');
    await page.locator('[data-page="reviews"]').click();
    await expect(page.locator('#ledger-title')).toContainText('Awaiting your review');
    await page.locator('[data-page="overview"]').click();
    await page.getByRole('button', { name: 'Start simulation' }).click();
    await expect(page.locator('#total-count')).toHaveText('66');
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await expect(page.locator('#simulate-label')).toHaveText('Start simulation');
    await page.locator('[data-hours="12"]').click();
    await expect(page.locator('#chart-range')).toHaveText('Last 12 hours · IST');

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await mobile.goto(url);
    await expect(mobile.locator('#total-count')).toHaveText('66');
    const dimensions = await mobile.evaluate(() => ({ root: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    if (dimensions.root > dimensions.viewport) console.log('Layout diagnostics', await mobile.evaluate(() => ({ inner: innerWidth,
      elements: ['html','body','.shell','main','.ledger','.table-scroll','table','.table-toolbar','.search','dialog'].map((selector) => {
        const el = document.querySelector(selector); const style = getComputedStyle(el);
        return { selector, width: el.clientWidth, scroll: el.scrollWidth, box: el.getBoundingClientRect().toJSON(), overflow: style.overflowX, display: style.display };
      }) })));
    expect(dimensions.root).toBeLessThanOrEqual(dimensions.viewport);
    await mobile.screenshot({ path: path.resolve(__dirname, '../.data/dashboard-mobile.png'), fullPage: true });
    await mobile.getByRole('button', { name: 'New transaction' }).click();
    await expect(mobile.locator('#transaction-dialog')).toBeVisible();
    await mobile.screenshot({ path: path.resolve(__dirname, '../.data/drawer-mobile.png'), fullPage: true });
    await mobile.getByRole('button', { name: 'Close transaction form' }).click();
    await mobile.close();
    expect(errors, 'Browser console and runtime errors').toEqual([]);
    console.log('Browser checks passed: desktop/mobile, live SSE updates, simulation, ingestion, escaping, review, filters, and model report.');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
