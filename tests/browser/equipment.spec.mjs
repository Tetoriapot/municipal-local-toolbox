import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import AxeBuilder from '@axe-core/playwright';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { equipmentEmpty, validateEquipmentItem, EQUIPMENT_KEY, EQUIPMENT_LEGACY_KEY } from '../../tools-src/equipment-manager/model.ts';

const route = '/downloads/equipment-manager.html';
const entry = (number = '001', values = {}) => validateEquipmentItem({ id: 'id-' + number, assetNumber: number, name: '備品 ' + number, ...values });
async function nav(page, view) { await page.locator('[data-view="' + view + '"]').first().click(); }
async function add(page, number, name, values = {}) {
  await nav(page, 'list'); await page.locator('#add-record').click();
  await page.locator('#field-assetNumber').fill(number); await page.locator('#field-name').fill(name);
  for (const [key, value] of Object.entries(values)) {
    if (key === 'status') await page.locator('#field-' + key).selectOption(value);
    else await page.locator('#field-' + key).fill(value);
  }
  await page.locator('#submit-record').click(); await expect(page.locator('#edit-dialog')).toBeHidden();
}
async function download(page, id = 'export') {
  const pending = page.waitForEvent('download'); await page.locator('#' + id).click(); const file = await pending;
  return { bytes: await readFile(await file.path()), name: file.suggestedFilename() };
}
async function load(page, data, accept = true) {
  page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.locator('#import-file').setInputFiles({ name: '備品 台帳.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('#feedback')).toContainText(accept ? '読み込みました' : 'キャンセル');
}
async function clear(page) {
  await nav(page, 'data'); await page.locator('#clear').click();
  await expect(page.locator('#confirm-clear')).toBeDisabled();
  await page.locator('#clear-confirm').fill('すべて削除'); await page.locator('#confirm-clear').click();
  await expect(page.locator('#clear-dialog')).toBeHidden();
}

test('equipment CRUD, states, search, filters, duplicate protection and reload', async ({ page }) => {
  await page.goto(route);
  await add(page, 'A10', 'スキャナー', { category: '機器', location: '総務課', purchaseDate: '2026-04-01', status: 'in-use', notes: 'ＣＳＶ 帳票の読取り' });
  await add(page, 'A2', '机', { category: '家具', location: '倉庫', status: 'disposed' });
  await add(page, 'A3', 'プリンター', { category: '機器', location: '総務課', status: 'repair' });
  await expect(page.locator('#equipment-rows tr').first()).toContainText('A2');
  await page.locator('#category-filter').selectOption('機器');
  await page.locator('#location-filter').selectOption('総務課');
  await page.locator('#status-filter').selectOption('in-use');
  await expect(page.locator('#equipment-rows tr')).toHaveCount(1);
  await page.locator('#query').fill('csv 帳票'); await expect(page.locator('#result-count')).toContainText('該当 1件');
  await page.locator('#query').fill('見つからない'); await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#reset-filters').click(); await expect(page.locator('#query')).toBeFocused();
  await page.locator('#sort').selectOption('date-desc');
  await expect(page.locator('#equipment-rows tr').first()).toContainText('A10');
  await page.getByRole('button', { name: 'A10 スキャナーを編集', exact: true }).click();
  await page.locator('#field-status').selectOption('stored'); await page.locator('#submit-record').click();
  await page.reload(); await nav(page, 'list');
  await expect(page.locator('#equipment-rows tr').filter({ hasText: 'スキャナー' })).toContainText('保管中');
  await page.locator('#add-record').click();
  await page.locator('#field-assetNumber').fill('　'); await page.locator('#field-name').fill('試験');
  await page.locator('#submit-record').click(); await expect(page.locator('#form-error')).toContainText('管理番号を入力');
  await page.locator('#field-assetNumber').fill('ａ１０');
  await page.locator('#submit-record').click(); await expect(page.locator('#form-error')).toContainText('重複');
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Escape'); await expect(page.locator('#edit-dialog')).toBeVisible();
  await page.locator('#cancel-edit').focus(); await page.keyboard.press('Tab'); await expect(page.locator('#close-edit')).toBeFocused();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#cancel-edit').click(); await expect(page.locator('#add-record')).toBeFocused();
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'A2 机を削除', exact: true }).click();
  await expect(page.locator('#equipment-rows tr')).toHaveCount(3);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'A2 机を削除', exact: true }).click();
  await page.reload(); await nav(page, 'list'); await expect(page.locator('#equipment-rows tr')).toHaveCount(2);
});

test('equipment migrates legacy memo and restores all records and unknown fields after clear', async ({ page }) => {
  const old = { schemaVersion: 1, toolId: 'equipment-manager', text: '旧版のメモ', future: { keep: 7 } };
  await page.addInitScript(({ key, old }) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, JSON.stringify(old)); sessionStorage.setItem('seeded', '1'); } }, { key: EQUIPMENT_LEGACY_KEY, old });
  await page.goto(route); await expect(page.locator('#memo')).toHaveValue(old.text);
  const data = { ...equipmentEmpty(), text: old.text, extra: { keep: true }, items: [entry('0001', { name: '<img src=x onerror=alert(1)>', category: '機器', location: '倉庫', purchaseDate: '2024-02-29', status: 'repair', notes: '日本語\n２行目', extra: [1, 2] })] };
  await load(page, data); await nav(page, 'list'); await expect(page.locator('#equipment-rows img')).toHaveCount(0);
  await page.locator('#equipment-rows').getByRole('button', { name: /を編集$/ }).click();
  await page.locator('#field-location').fill('庶務室'); await page.locator('#submit-record').click();
  const output = await download(page); const saved = JSON.parse(output.bytes.toString('utf8'));
  expect(saved.extra).toEqual(data.extra); expect(saved.items[0].extra).toEqual([1, 2]); expect(saved.items[0].location).toBe('庶務室');
  await clear(page); await page.reload(); await expect(page.locator('#memo')).toHaveValue('');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), EQUIPMENT_LEGACY_KEY))).toEqual(old);
  await load(page, saved); await page.reload(); await nav(page, 'list');
  expect(JSON.parse((await download(page)).bytes.toString('utf8')).items).toEqual(saved.items);
  await load(page, equipmentEmpty(), false); await expect(page.locator('#equipment-rows tr')).toHaveCount(1);
});

test('equipment rejects abnormal files without replacing current data', async ({ page }) => {
  await page.goto(route); await add(page, 'keep', '保持する備品');
  for (const [name, mimeType, buffer, message] of [
    ['empty.json', 'application/json', Buffer.from(''), '空です'],
    ['broken.json', 'application/json', Buffer.from('{broken'), 'JSONの形式'],
    ['wrong.csv', 'text/csv', Buffer.from('{}'), '拡張子'],
    ['mime.json', 'image/png', Buffer.from('{}'), '認識できません'],
    ['foreign.json', 'application/json', Buffer.from(JSON.stringify({ ...equipmentEmpty(), toolId: 'handover-note' })), '備品管理台帳のJSON'],
    ['missing.json', 'application/json', Buffer.from(JSON.stringify({ ...equipmentEmpty(), items: null })), '備品一覧がありません'],
    ['large.json', 'application/json', Buffer.alloc(10 * 1024 * 1024 + 1, ' '), '10MB以下'],
  ]) {
    await page.locator('#import-file').setInputFiles({ name, mimeType, buffer });
    await expect(page.locator('#feedback')).toContainText(message);
    await expect(page.locator('#equipment-rows')).toContainText('保持する備品');
  }
});

test('equipment pagination exports every matching record with safe Japanese CSV including empty output', async ({ page }) => {
  await page.goto(route);
  const data = { ...equipmentEmpty(), items: Array.from({ length: 55 }, (_, i) => entry('N-' + String(i).padStart(3, '0'), { category: i < 53 ? '機器' : '家具', name: i === 0 ? '=1+1' : '備品' + i, notes: i === 0 ? 'カンマ,引用"と\n改行' : '' })) };
  await load(page, data); await nav(page, 'list');
  await expect(page.locator('#equipment-rows tr')).toHaveCount(50);
  await page.locator('#next-page').click(); await expect(page.locator('#equipment-rows tr')).toHaveCount(5);
  await page.locator('#category-filter').selectOption('機器');
  await expect(page.locator('#page-number')).toHaveText('1 / 2');
  const csv = await download(page, 'csv-current');
  expect(csv.name).toMatch(/^備品管理台帳-絞り込み-\d{8}\.csv$/);
  expect(csv.bytes.subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]));
  const text = csv.bytes.toString('utf8');
  expect((text.match(/^"N-/gm) ?? []).length).toBe(53);
  expect(text).toContain('"' + "'=1+1" + '"'); expect(text).toContain('"カンマ,引用""と\n改行"');
  expect((await download(page, 'csv-all')).bytes.toString('utf8').match(/^"N-/gm)).toHaveLength(55);
  await page.locator('#query').fill('該当しない');
  const empty = (await download(page, 'csv-current')).bytes.toString('utf8');
  expect(empty).toBe('\uFEFF"管理番号","備品名","カテゴリ","設置場所","購入日","状態","備考"\r\n');
});

test('equipment detects another tab and preserves both the newer storage and unsaved export', async ({ page, context }) => {
  await page.goto(route); await page.locator('#memo').fill('最初');
  const other = await context.newPage(); await other.goto(route);
  await page.locator('#memo').fill('保存済みの更新');
  await other.locator('#memo').fill('別画面の未保存');
  await expect(other.locator('#save-status')).toContainText('別の画面');
  expect(JSON.parse((await download(other)).bytes.toString('utf8')).text).toBe('別画面の未保存');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), EQUIPMENT_KEY)).text).toBe('保存済みの更新');
  await nav(other, 'data'); await other.locator('#clear').click();
  await other.locator('#clear-confirm').fill('すべて削除'); await other.locator('#confirm-clear').click();
  await expect(other.locator('#clear-error')).toContainText('別の画面'); await other.locator('#cancel-clear').click();
  other.once('dialog', dialog => dialog.accept()); await other.locator('#reload-data').click(); await nav(other, 'home');
  await expect(other.locator('#memo')).toHaveValue('保存済みの更新');
});

test('equipment handles quota failures and corrupt storage without losing an export', async ({ page, browser }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.goto(route); await add(page, 'full', '容量不足時の備品');
  await expect(page.locator('#save-status')).toContainText('未保存');
  expect(JSON.parse((await download(page)).bytes.toString('utf8')).items[0].name).toBe('容量不足時の備品');
  await nav(page, 'data'); await page.locator('#clear').click();
  await page.locator('#clear-confirm').fill('すべて削除'); await page.locator('#confirm-clear').click();
  await expect(page.locator('#clear-error')).toContainText('保存領域を更新できません');
  await page.locator('#cancel-clear').click();
  expect(JSON.parse((await download(page)).bytes.toString('utf8')).items[0].name).toBe('容量不足時の備品');
  const context = await browser.newContext(); const corrupt = await context.newPage();
  await corrupt.addInitScript(key => localStorage.setItem(key, '{broken'), EQUIPMENT_KEY);
  await corrupt.goto('http://127.0.0.1:4321' + route);
  await expect(corrupt.locator('#save-status')).toContainText('保存データを読めません');
  await add(corrupt, 'safe', '保存領域を保護');
  expect(await corrupt.evaluate(key => localStorage.getItem(key), EQUIPMENT_KEY)).toBe('{broken');
  await load(corrupt, { ...equipmentEmpty(), items: [entry('restored')] });
  expect(JSON.parse(await corrupt.evaluate(key => localStorage.getItem(key), EQUIPMENT_KEY)).items[0].assetNumber).toBe('restored');
  await context.close();
});

test('equipment runs offline from renamed TXT and prints all or filtered data safely', async ({ page, context }, info) => {
  await mkdir(info.outputDir, { recursive: true });
  const file = info.outputPath('備品 管理台帳.html'); await copyFile(resolve('dist/downloads/equipment-manager.txt'), file);
  const requests = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true); await page.goto(pathToFileURL(file).href);
  await page.locator('#memo').fill('印刷用メモ');
  await add(page, '001', '日本語の備品', { notes: '<img src=x onerror=alert(1)>'.repeat(8) });
  await add(page, '002', '別の備品'); await page.reload(); await nav(page, 'list');
  await page.locator('#query').fill('001');
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#print-current').click(); await expect(page.locator('#print-area article')).toHaveCount(1);
  await page.locator('#print').click(); await expect(page.locator('#print-area article')).toHaveCount(2);
  await expect(page.locator('#print-text')).toHaveText('印刷用メモ');
  await expect(page.locator('#print-area img')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('#print-area')).toBeVisible();
  await page.screenshot({ path: info.outputPath('equipment-print.png'), fullPage: true });
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});

test('equipment screens, table and dialog are accessible and responsive', async ({ page }) => {
  await page.goto(route); await add(page, 'A'.repeat(100), '長い備品名'.repeat(40), { location: '長い設置場所'.repeat(40), notes: '長い備考'.repeat(40) });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const view of ['home', 'list', 'data', 'help']) {
      await nav(page, view);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), view + ' at ' + width).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  for (const view of ['home', 'list', 'data', 'help']) {
    await nav(page, view);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations, view).toEqual([]);
  }
  await nav(page, 'list'); await page.locator('#add-record').click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
