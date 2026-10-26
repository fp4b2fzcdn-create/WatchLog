import { _electron as electron, chromium, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import electronPath from 'electron';
const dir = await mkdtemp(join(tmpdir(), 'watchlog-desktop-'));
const screenshots = resolve('../../work/qa');
await mkdir(screenshots, { recursive: true });
const env = { ...process.env, WATCHLOG_TEST_DATA: dir };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch() {
  let page;
  if (process.env.WATCHLOG_TEST_CDP) {
    const browser = await chromium.connectOverCDP(process.env.WATCHLOG_TEST_CDP);
    page = browser.contexts()[0].pages()[0];
    app = {
      close: async () => {
        if (!page.isClosed()) await page.close();
        await browser.close();
      },
    };
  } else {
    app = await electron.launch({ executablePath: electronPath, args: ['.'], env });
    page = await app.firstWindow();
  }
  page.on('pageerror', (e) => console.error('Renderer:', e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.waitForSelector('h1');
  return page;
}
try {
  let page = await launch();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.WATCHLOG_TEST_RESTART_ONLY) {
    const state = await page.evaluate(() => window.watchlog.state());
    expect(state.events).toHaveLength(2);
    expect(state.preferences.theme).toBe('dark');
    expect(state.preferences.view).toBe('list');
    console.log(
      'PASS: native packaged application preserved records and preferences across restart.',
    );
    await app.close();
    app = undefined;
    process.exit(0);
  }
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await page.screenshot({ path: join(screenshots, 'library-empty.png') });
  await page.getByRole('button', { name: 'Add your first title' }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A desktop test film');
  await page.getByRole('textbox', { name: 'Release date', exact: true }).fill('2000-09-29');
  await page.getByRole('spinbutton', { name: 'My rating', exact: true }).fill('8.5');
  await page.getByLabel('Date watched', { exact: true }).fill('2020-02-29');
  await page.getByRole('button', { name: 'Save viewing', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A desktop test film', exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Viewing history/ }).click();
  await expect(
    page.getByRole('dialog').getByText(/29 Feb 2020|Feb 29, 2020|29 Feb\. 2020/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log viewing', exact: true }).click();
  await page.getByLabel('Date watched', { exact: true }).fill('2022-03-15');
  await page.getByRole('button', { name: 'Save viewing', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  let state = await page.evaluate(() => window.watchlog.state());
  expect(state.titles).toHaveLength(1);
  expect(state.events).toHaveLength(2);
  expect(state.events[1].rewatch).toBe(true);
  await page.getByRole('button', { name: 'Compact list view' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page.getByText('2 viewing events across 1 unique titles')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: join(screenshots, 'settings-dark.png'), fullPage: true });
  const security = await page.evaluate(() => ({
    node: typeof window.require,
    process: typeof window.process,
    bridge: Object.keys(window.watchlog),
  }));
  expect(security.node).toBe('undefined');
  expect(security.process).toBe('undefined');
  expect(security.bridge).not.toContain('invoke');
  const invalid = await page.evaluate(async () => {
    try {
      await window.watchlog.external({ url: 'file:///C:/Windows/system.ini' });
      return false;
    } catch {
      return true;
    }
  });
  expect(invalid).toBe(true);
  const badDate = await page.evaluate(async () => {
    try {
      const state = await window.watchlog.state();
      await window.watchlog.episodes({
        events: [{ ...state.events[0], id: 'bad', date: '2023-02-29' }],
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(badDate).toBe(true);
  if (!process.env.WATCHLOG_TEST_CDP) {
    await app.close();
    page = await launch();
    state = await page.evaluate(() => window.watchlog.state());
    expect(state.events).toHaveLength(2);
    expect(state.preferences.theme).toBe('dark');
    expect(state.preferences.view).toBe('list');
  }
  await page
    .getByRole('button', { name: /Library/ })
    .first()
    .click();
  await page.screenshot({ path: join(screenshots, 'library-dark.png') });
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A world of stories awaits' })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'PASS: real Electron desktop — manual add, historical dates, multiple viewings, duplicate prevention, list/grid, statistics, theme, restart persistence, isolated renderer, IPC validation, missing-credential discovery.',
  );
} finally {
  await app?.close();
  await rm(dir, { recursive: true, force: true });
}
