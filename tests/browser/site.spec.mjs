import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tools } from '../../src/data/tools.ts';

test('home search navigates to matching results; browser back works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('ＣＳＶ');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page).toHaveURL(/tools\/\?q=/);
  await expect(page.locator('[data-result-count]')).toHaveText('2');
  await expect(page.locator('[data-card-id]:visible')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('自治体');
});

test('categories, tags, empty state, reset and URL restoration work', async ({ page }) => {
  await page.goto('/tools/');
  await page.locator('input[name=category][value=equipment]').check();
  await page.locator('input[name=category][value=counter]').check();
  await expect(page.locator('[data-result-count]')).toHaveText('4');
  await page.locator('input[name=tag][value=CSV]').check();
  await expect(page.locator('[data-result-count]')).toHaveText('2');
  await page.reload();
  await expect(page.locator('[data-result-count]')).toHaveText('2');
  await expect(page.locator('input[name=category][value=equipment]')).toBeChecked();
  await page.getByRole('searchbox').fill('存在しないツール');
  await expect(page.locator('[data-empty]')).toBeVisible();
  await page.getByRole('button', { name: '条件をクリアして、すべて見る' }).click();
  await expect(page.locator('[data-result-count]')).toHaveText('8');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.locator('#sort').selectOption('name');
  const names = await page.locator('[data-card-id]:visible h3').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ja')));
});

test('category routes and empty-category reset survive a reload', async ({ page }) => {
  await page.goto('/categories/equipment/');
  await expect(page.locator('[data-result-count]')).toHaveText('3');
  await page.getByRole('button', { name: '条件をクリア', exact: true }).click();
  await expect(page.locator('[data-result-count]')).toHaveText('8');
  await page.reload();
  await expect(page.locator('[data-result-count]')).toHaveText('8');
  await page.goto('/categories/documents/');
  await expect(page.locator('[data-empty]')).toBeVisible();
  await expect(page.locator('[data-result-count]')).toHaveText('0');
});

test('query input is displayed as text; unknown filter values are harmless', async ({ page }) => {
  await page.goto('/tools/?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&sort=bad&category=bad');
  await expect(page.locator('[data-result-count]')).toHaveText('0');
  await expect(page.locator('[data-query-label] img')).toHaveCount(0);
  await expect(page.locator('#sort')).toHaveValue('recommended');
});

test('all details provide identical TXT/HTML downloads with correct filenames', async ({ page }) => {
  for (const tool of tools) {
    await page.goto('/tools/' + tool.id + '/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tool.name);
    if (tool.status === 'ready') {
      await expect(page.locator('.detail-section')).toContainText([tool.implementation.featureNote]);
      await expect(page.locator('.download-version')).toContainText('業務機能を実装済み');
    } else await expect(page.locator('.download-version')).toContainText('配布確認版');
    const buffers = [];
    for (const type of ['TXT', 'HTML']) {
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('link', { name: type + '版をダウンロード', exact: false }).click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe(tool.id + '.' + type.toLowerCase());
      buffers.push(await readFile(await download.path()));
    }
    expect(buffers[0].equals(buffers[1])).toBe(true);
  }
});

test('offline file renamed from TXT persists, exports, restores, cancels deletion and prints', async ({ page, context }, testInfo) => {
  const renamed = testInfo.outputPath('renamed-tool.html');
  await mkdir(testInfo.outputDir, { recursive: true });
  await copyFile(resolve('dist/downloads/lending-manager.txt'), renamed);
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.goto(pathToFileURL(renamed).href);
  const text = '引継ぎのテスト\n<script>alert(1)</script>';
  await page.locator('#memo').fill(text);
  await expect(page.locator('#save-status')).toHaveText('このブラウザ内に自動保存済み');
  await page.reload();
  await expect(page.locator('#memo')).toHaveValue(text);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを書き出す' }).click();
  const download = await downloadEvent;
  const backupPath = await download.path();
  const data = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(data.text).toBe(text);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'すべてのデータを削除' }).click();
  await expect(page.locator('#memo')).toHaveValue(text);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'すべてのデータを削除' }).click();
  await expect(page.locator('#memo')).toHaveValue('');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name: 'バックアップ.json', mimeType: 'application/json', buffer: await readFile(backupPath) });
  await expect(page.locator('#memo')).toHaveValue(text);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-text')).toHaveText(text);
  await expect(page.locator('#memo')).toBeHidden();
  expect(requests).toEqual([]);
});

test('bad import leaves current data intact and import cancellation is respected', async ({ page }) => {
  await page.goto('/downloads/lending-manager.html');
  await page.locator('#memo').fill('保持するメモ');
  for (const backup of ['{bad', JSON.stringify({ schemaVersion: 1, toolId: 'wrong', text: '上書き' })]) {
    await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await expect(page.locator('#memo')).toHaveValue('保持するメモ');
  }
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, toolId: 'lending-manager', text: '変更後' })) });
  await expect(page.locator('#memo')).toHaveValue('保持するメモ');
});

test('blocked storage reports unsaved and backup remains available', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked storage'); } }));
  await page.goto('/downloads/handover-note.html');
  await page.locator('#memo').fill('保存できないテスト');
  await expect(page.locator('#save-status')).toContainText('未保存');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを書き出す' }).click();
  const data = JSON.parse(await readFile(await (await event).path(), 'utf8'));
  expect(data.text).toBe('保存できないテスト');
});

test('corrupt local storage is protected until explicitly replaced', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('municipal-toolbox:preview:v1:handover-note', '{broken'));
  await page.goto('/downloads/handover-note.html');
  await expect(page.locator('#save-status')).toContainText('保存データを読めません');
  await page.locator('#memo').fill('new');
  expect(await page.evaluate(() => localStorage.getItem('municipal-toolbox:preview:v1:handover-note'))).toBe('{broken');
});

test('all eight standalone files load without script errors or network requests', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const tool of tools) {
    await page.goto(pathToFileURL(resolve('dist/downloads/' + tool.id + '.html')).href);
    await expect(page.locator('#memo')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(tool.name);
  }
  expect(errors).toEqual([]);
});

test('mobile navigation, keyboard operation and no horizontal overflow', async ({ page }) => {
  for (const width of [320, 390, 768, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/tools/', '/tools/handover-note/', '/guide/txt-to-html/', '/faq/']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ' ' + route).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'メニュー' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await page.goto('/faq/');
  await page.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
});

test('key pages pass WCAG A/AA automated checks without console errors or external traffic', async ({ page }) => {
  const errors = [], external = [], violations = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4321/')) external.push(request.url()); });
  for (const route of ['/', '/tools/', '/tools/handover-note/', '/guide/', '/faq/', '/downloads/handover-note.html']) {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    violations.push(...result.violations.map(v => ({ route, id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
  }
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('static content and downloads remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321/tools/');
  await expect(page.locator('[data-card-id]:visible')).toHaveCount(8);
  await page.getByRole('link', { name: '異動引継ぎノートの詳細を見る' }).click();
  await expect(page.getByRole('link', { name: 'TXT版をダウンロード', exact: false })).toBeVisible();
  await context.close();
});
