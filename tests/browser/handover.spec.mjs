import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { freshData, SECTIONS, HANDOVER_KEY, LEGACY_KEY } from '../../tools-src/handover-note/model.ts';

const route = '/downloads/handover-note.html';
async function navigate(page, view) { await page.locator('[data-view="' + view + '"]').first().click(); }
async function addRecord(page, section, title, fields = {}) {
  await navigate(page, section);
  await page.getByRole('button', { name: '新規登録', exact: true }).click();
  await page.locator('#field-title').fill(title);
  for (const [key, value] of Object.entries(fields)) {
    const input = page.locator('#field-' + key);
    if (key === 'month' || key === 'priority') await input.selectOption(value);
    else await input.fill(value);
  }
  await page.getByRole('button', { name: '登録する', exact: true }).click();
  await expect(page.locator('#edit-dialog')).not.toBeVisible();
}
async function exportData(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await pending;
  return { data: JSON.parse(await readFile(await download.path(), 'utf8')), bytes: await readFile(await download.path()) };
}
async function importData(page, data, accept = true) {
  page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.locator('#import-file').setInputFiles({ name: '引継ぎ バックアップ.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('#feedback')).toContainText(accept ? '読み込みました' : 'キャンセル');
}

test('six business sections support create, edit, check, search, delete and reload', async ({ page }) => {
  await page.goto(route);
  await page.locator('#profile-department').fill('試験市 総務課');
  await page.locator('#memo').fill('旧版と同じ自由メモ');
  await addRecord(page, 'duties', '予算の確認', { procedure: 'CSV帳票の出力\n担当に提出', deadline: '毎月末', location: '\\\\server\\share\\財務' });
  await addRecord(page, 'schedule', '年度更新', { month: '4', timing: '4月1日' });
  await addRecord(page, 'contacts', '試験担当', { organization: '総務課', phone: '内線1234' });
  await addRecord(page, 'files', '担当資料', { location: 'C:\\資料\\台帳.xlsx', access: '閲覧権限の申請が必要' });
  await addRecord(page, 'notes', '未処理案件', { priority: '高', dueDate: '2026-12-01', details: '照会先の回答待ち' });
  await addRecord(page, 'checklist', '鍵の受渡し', { owner: '後任担当者' });
  await page.getByRole('checkbox', { name: '鍵の受渡しを確認済みにする' }).check();
  await navigate(page, 'home');
  await expect(page.locator('#completion-label')).toHaveText('17%（1 / 6件）');
  await navigate(page, 'schedule');
  await expect(page.locator('.month-heading')).toHaveText(['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月']);
  await navigate(page, 'search');
  await page.locator('#global-query').fill('ＣＳＶ 提出');
  await expect(page.locator('#search-count')).toHaveText('1件見つかりました。');
  await page.locator('#search-results').getByRole('button', { name: '編集', exact: true }).click();
  await page.locator('#field-title').fill('予算確認・更新');
  await page.locator('#submit-record').click();
  await expect(page.locator('#search-results h3')).toHaveText('予算確認・更新');
  await page.reload();
  await expect(page.locator('#profile-department')).toHaveValue('試験市 総務課');
  await expect(page.locator('#memo')).toHaveValue('旧版と同じ自由メモ');
  await navigate(page, 'duties');
  await expect(page.locator('#record-list')).toContainText('予算確認・更新');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#record-list').getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.locator('#record-list .record-card')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#record-list').getByRole('button', { name: '削除', exact: true }).click();
  await expect(page.locator('#record-list')).toContainText('記録がありません');
  await page.reload();
  await navigate(page, 'duties');
  await expect(page.locator('#record-list .record-card')).toHaveCount(0);
});

test('legacy migration and complete JSON round trip preserve extensions and all fields', async ({ page }) => {
  const legacy = { schemaVersion: 1, toolId: 'handover-note', text: '移行元のメモ', extra: { keep: true } };
  await page.addInitScript(({ key, legacy }) => localStorage.setItem(key, JSON.stringify(legacy)), { key: LEGACY_KEY, legacy });
  await page.goto(route);
  await expect(page.locator('#memo')).toHaveValue(legacy.text);
  const fixture = freshData();
  fixture.text = '<script>window.bad=true</script>\n日本語';
  fixture.extra = { untouched: ['a', 1] };
  fixture.profile.department = '総務課';
  fixture.profile.future = '保持';
  fixture.sections.futureSection = [{ future: '保持' }];
  for (const section of SECTIONS) fixture.sections[section.id] = [{ id: section.id, title: section.label + 'の試験', completed: false, month: '4', extra: { keep: true } }];
  await importData(page, fixture);
  await navigate(page, 'duties');
  await page.locator('#record-list').getByRole('button', { name: '編集', exact: true }).click();
  await page.locator('#field-title').fill('変更した業務');
  await page.locator('#submit-record').click();
  const before = (await exportData(page)).data;
  expect(before.sections.duties[0].extra).toEqual({ keep: true });
  expect(before.extra).toEqual(fixture.extra);
  await navigate(page, 'data');
  await page.locator('#clear').click();
  await expect(page.locator('#confirm-clear')).toBeDisabled();
  await page.locator('#clear-confirm').fill('削除');
  await expect(page.locator('#confirm-clear')).toBeDisabled();
  await page.locator('#clear-confirm').fill('すべて削除');
  await page.locator('#confirm-clear').click();
  await page.reload();
  await expect(page.locator('#memo')).toHaveValue('');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), LEGACY_KEY)).toEqual(legacy);
  await importData(page, before);
  const after = (await exportData(page)).data;
  delete before.exportedAt; delete after.exportedAt;
  expect(after).toEqual(before);
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  await importData(page, legacy, false);
  expect((await exportData(page)).data.text).toBe(fixture.text);
});

test('invalid files never replace existing records and explain the error', async ({ page }) => {
  await page.goto(route);
  await addRecord(page, 'duties', '保持対象');
  const valid = JSON.stringify(freshData());
  const cases = [
    { name: '空.json', type: 'application/json', value: '' },
    { name: '破損.json', type: 'application/json', value: '{bad' },
    { name: '違う.txt', type: 'application/json', value: valid },
    { name: '違う形式.json', type: 'image/png', value: valid },
    { name: '別ツール.json', type: 'application/json', value: '{"schemaVersion":2,"toolId":"other"}' },
    { name: '欠損.json', type: 'application/json', value: '{"schemaVersion":2,"toolId":"handover-note","text":""}' },
    { name: '巨大.json', type: 'application/json', value: 'a'.repeat(10 * 1024 * 1024 + 1) },
  ];
  for (const file of cases) {
    await page.locator('#import-file').setInputFiles({ name: file.name, mimeType: file.type, buffer: Buffer.from(file.value) });
    await expect(page.locator('#feedback')).toContainText('現在のデータは変更していません');
    await expect(page.locator('#record-list h3')).toContainText('保持対象');
  }
});

test('another tab cannot overwrite or delete newer saved data', async ({ page, context }) => {
  await page.goto(route);
  await page.locator('#memo').fill('最初');
  const other = await context.newPage();
  await other.goto(page.url());
  await page.locator('#memo').fill('元画面の更新');
  await expect(other.locator('#storage-warning')).toBeVisible();
  await other.locator('#memo').fill('別画面の編集');
  await expect(other.locator('#save-status')).toContainText('未保存');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).text, HANDOVER_KEY);
  expect(stored).toBe('元画面の更新');
  expect((await exportData(other)).data.text).toBe('別画面の編集');
  await navigate(other, 'data');
  await other.locator('#clear').click();
  await other.locator('#clear-confirm').fill('すべて削除');
  await other.locator('#confirm-clear').click();
  await expect(other.locator('#clear-error')).toContainText('別の画面');
  await other.locator('#cancel-clear').click();
  other.once('dialog', dialog => dialog.accept());
  await other.locator('#reload-data').click();
  await navigate(other, 'home');
  await expect(other.locator('#memo')).toHaveValue('元画面の更新');
  await other.close();
});

test('dialog validates required input, traps focus, and confirms discarding changes', async ({ page }) => {
  await page.goto(route);
  await navigate(page, 'duties');
  await page.locator('#add-record').click();
  await expect(page.locator('#field-title')).toBeFocused();
  await page.locator('#field-title').fill('　');
  await page.locator('#submit-record').click();
  await expect(page.locator('#form-error')).toContainText('入力してください');
  await page.locator('#field-title').fill('未登録');
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.locator('#edit-dialog')).toBeVisible();
  await page.locator('#cancel-edit').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('#edit-dialog').contains(document.activeElement))).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#cancel-edit').click();
  await expect(page.locator('#add-record')).toBeFocused();
  await expect(page.locator('#record-list .record-card')).toHaveCount(0);
});

test('downloaded TXT renamed to HTML works offline with records and safe printed content', async ({ page, context }, info) => {
  await mkdir(info.outputDir, { recursive: true });
  const file = info.outputPath('異動 引継ぎ.html');
  await copyFile(resolve('dist/downloads/handover-note.txt'), file);
  await context.setOffline(true);
  const requests = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(file).href);
  await addRecord(page, 'duties', '印刷する担当業務', { procedure: '<img src=x onerror=alert(1)>'.repeat(20) });
  await addRecord(page, 'notes', '別分類の申し送り', { details: '印刷対象の内容' });
  await page.reload();
  await navigate(page, 'duties');
  await page.locator('#record-query').fill('一致しない');
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#print-current').click();
  await expect(page.locator('#print-area .record-card')).toHaveCount(0);
  await page.locator('#print').click();
  await expect(page.locator('#print-area .record-card')).toHaveCount(2);
  await expect(page.locator('#print-area img')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-area')).toBeVisible();
  await page.screenshot({ path: info.outputPath('handover-print.png'), fullPage: true });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('storage quota failure retains editable data and exports the unsaved records', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.goto(route);
  await addRecord(page, 'duties', '保存容量の試験');
  await expect(page.locator('#save-status')).toContainText('未保存');
  expect((await exportData(page)).data.sections.duties[0].title).toBe('保存容量の試験');
});

test('record screens and dialogs are accessible and fit desktop, tablet and phone widths', async ({ page }) => {
  await page.goto(route);
  await addRecord(page, 'files', '資料の保存場所', { location: 'C:\\' + '日本語の長い保存場所'.repeat(20) });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const view of ['home', 'files', 'schedule', 'search', 'data', 'help']) {
      await navigate(page, view);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), view + ' at ' + width).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const view of ['home', 'files', 'schedule', 'search', 'data', 'help']) {
    await navigate(page, view);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })), view).toEqual([]);
  }
  await navigate(page, 'duties');
  await page.locator('#add-record').click();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
