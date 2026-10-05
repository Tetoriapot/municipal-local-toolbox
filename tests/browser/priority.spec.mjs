import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('top right controls, persistent themes, updates, Help and dark accessibility', async ({ page }) => {
  test.setTimeout(60000);
  const violations = [];
  for (const route of ['/', '/tools/', '/tools/equipment-manager/', '/changelog/', '/guide/', '/safety/', '/downloads/equipment-manager.html', '/downloads/handover-note.html', '/downloads/lending-manager.html']) {
    await page.goto(route);
    await page.evaluate(() => localStorage.setItem('municipal-toolbox:theme:v1', 'light')); await page.reload();
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    if (route.startsWith('/downloads/')) {
      await page.locator('#open-updates').click(); await expect(page.locator('#updates-dialog')).toBeVisible();
      await page.keyboard.press('Escape'); await expect(page.locator('#open-updates')).toBeFocused();
      await page.getByRole('button', { name: 'Help（使い方）' }).or(page.getByRole('link', { name: 'Help（使い方）' })).click();
    } else await expect(page.locator('.site-utilities').getByRole('link', { name: '更新情報' })).toHaveAttribute('href', /changelog/);
    violations.push(...(await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v => ({route,id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
    for (const width of [320,390,768,1440]) { await page.setViewportSize({ width, height:1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.locator('[data-theme-toggle]').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
  expect(violations).toEqual([]);
});

test('browser storage is distinct from export operation and works when metadata cannot persist', async ({ page }) => {
  await page.goto('/downloads/equipment-manager.html');
  await page.locator('#memo').fill('保存先を確認');
  await expect(page.locator('#save-status')).toContainText('このブラウザ内');
  await page.locator('.storage-strip summary').click();
  await expect(page.locator('#backup-operation')).toContainText('未記録');
  const pending = page.waitForEvent('download'); await page.locator('#export').click();
  expect(JSON.parse(await readFile(await (await pending).path(),'utf8')).text).toBe('保存先を確認');
  await expect(page.locator('#backup-operation')).toContainText('最終書出し操作');
  await page.reload(); await page.locator('.storage-strip summary').click();
  await expect(page.locator('#backup-operation')).toContainText('ファイルの保存完了は保存先で確認');
  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key.includes('export-operation')) throw new DOMException('Full','QuotaExceededError'); return set.call(this,key,value); }; });
  const retry = page.waitForEvent('download'); await page.locator('#export').click(); await retry;
  await expect(page.locator('#backup-operation')).toContainText('この画面だけ');
});

test('CSV preview maps columns, blocks invalid rows, cancels safely and appends without losing existing data', async ({ page }) => {
  await page.goto('/downloads/equipment-manager.html');
  const original = {schemaVersion:2,toolId:'equipment-manager',text:'保持するメモ',extra:{retained:true},items:[{id:'old',assetNumber:'0001',name:'既存の備品',extra:['保持']}]};
  page.once('dialog', d=>d.accept()); await page.locator('#import-file').setInputFiles({name:'既存.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});
  await page.locator('[data-theme-toggle]').click(); await page.locator('#navigation [data-view="list"]').click(); await page.locator('#csv-import').click();
  const upload = async (text) => page.locator('#csv-file').setInputFiles({name:'日本語 台帳.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
  await upload('管理番号,備品名\n0001,重複\n0002,追加'); await page.locator('#csv-validate').click();
  await expect(page.locator('#csv-error')).toContainText('重複'); await expect(page.locator('#csv-accept')).toBeDisabled();
  await upload('名称,番号,購入日,状態,備考\n"新備品,確認",0002,2024/2/29,保管中,"1行目\n2行目"');
  await page.locator('#csv-map-name').selectOption('0'); await page.locator('#csv-map-assetNumber').selectOption('1'); await page.locator('#csv-validate').click();
  await expect(page.locator('#csv-summary')).toContainText('現在 1件 → 追加後 2件'); await expect(page.locator('#csv-preview')).toContainText('0002');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  for (const width of [320,390,768,1440]) { await page.setViewportSize({width,height:1000}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
  await page.locator('#csv-cancel').click(); await expect(page.locator('#equipment-rows tr')).toHaveCount(1);
  await page.locator('#csv-import').click(); await upload('管理番号,備品名,状態\n0002,新備品,保管中'); await page.locator('#csv-validate').click(); await page.locator('#csv-accept').click();
  await expect(page.locator('#equipment-rows tr')).toHaveCount(2); await page.reload();
  const download = page.waitForEvent('download'); await page.locator('#export').click(); const data = JSON.parse(await readFile(await (await download).path(),'utf8'));
  expect(data.text).toBe(original.text); expect(data.extra).toEqual(original.extra); expect(data.items[0].extra).toEqual(['保持']); expect(data.items[1].assetNumber).toBe('0002'); expect(data.items[1].status).toBe('stored');
});

for (const tool of ['handover-note','equipment-manager']) test(tool + ' drafts survive interruption and never enter confirmed backups until submitted', async ({ page }) => {
  await page.goto('/downloads/' + tool + '.html');
  await page.locator('[data-view="' + (tool === 'handover-note' ? 'duties' : 'list') + '"]').first().click();
  await page.locator('#add-record').click();
  const title = tool === 'handover-note' ? '#field-title' : '#field-name';
  if (tool === 'equipment-manager') await page.locator('#field-assetNumber').fill('0007');
  await page.locator(title).fill('中断した入力');
  if (tool === 'handover-note') {
    await page.locator(title).fill('');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('municipal-toolbox:draft:v1:handover-note'))).values.title).toBe('');
    await page.locator(title).fill('中断した入力');
  }
  await expect(page.locator('#draft-save-status')).toContainText('下書きをこのブラウザ内に保存');
  await page.locator('#suspend-edit').click(); await page.reload();
  const pending = page.waitForEvent('download'); await page.locator('#export').click();
  const data = JSON.parse(await readFile(await (await pending).path(),'utf8'));
  expect(tool === 'handover-note' ? data.sections.duties : data.items).toEqual([]);
  await page.locator('#resume-draft').click(); await expect(page.locator(title)).toHaveValue('中断した入力');
  await page.locator('#submit-record').click();
  await expect(page.locator('#draft-panel')).toBeHidden(); await page.reload();
  await expect(page.locator('#draft-panel')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key),'municipal-toolbox:draft:v1:' + tool)).toBeNull();
});

test('draft storage failure is visible and competing tabs do not overwrite drafts', async ({ page,context }) => {
  await page.goto('/downloads/equipment-manager.html');
  const other = await context.newPage(); await other.goto(page.url());
  for (const target of [page,other]) { await target.locator('#home-add').click(); await target.locator('#field-assetNumber').fill('D1'); }
  await page.locator('#field-name').fill('保持する下書き');
  await other.locator('#field-name').fill('別画面の入力');
  await expect(other.locator('#draft-save-status')).toContainText('未保存');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('municipal-toolbox:draft:v1:equipment-manager'))).values.name).toBe('保持する下書き');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full','QuotaExceededError'); }; });
  await page.locator('#field-name').fill('容量不足時の入力');
  await expect(page.locator('#draft-save-status')).toContainText('未保存');
  await page.locator('#suspend-edit').click(); await expect(page.locator('#edit-dialog')).toBeVisible();
});

for (const tool of ['handover-note','equipment-manager']) test(tool + ' sample edits, drafts and clear never read or alter real saved data', async ({ page,context }) => {
  await page.goto('/downloads/' + tool + '.html'); await page.locator('#memo').fill('実データを保持');
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  const samplePage = await context.newPage(); await samplePage.goto(page.url() + '#sample');
  await expect(samplePage.locator('#sample-banner')).toContainText('サンプル体験中');
  const initialDownload = samplePage.waitForEvent('download'); await samplePage.locator('#export').click();
  const initial = JSON.parse(await readFile(await (await initialDownload).path(),'utf8'));
  expect(initial.sampleData).toBe(true); expect(tool === 'equipment-manager' ? initial.items.length : Object.values(initial.sections).flat().length).toBe(tool === 'equipment-manager' ? 3 : 6);
  await expect(samplePage.locator('#memo')).not.toHaveValue('実データを保持');
  await samplePage.locator('#memo').fill('サンプルの変更');
  await samplePage.locator('[data-view="' + (tool === 'handover-note' ? 'duties' : 'list') + '"]').first().click();
  await samplePage.locator('#add-record').click(); await samplePage.locator(tool === 'handover-note' ? '#field-title' : '#field-name').fill('サンプルの下書き');
  await samplePage.locator('#suspend-edit').click();
  const pending = samplePage.waitForEvent('download'); await samplePage.locator('#export').click(); expect((await pending).suggestedFilename()).toMatch(/^sample-/);
  await samplePage.locator('[data-view="data"]').click(); await samplePage.locator('#clear').click();
  await samplePage.locator('#clear-confirm').fill('すべて削除'); await samplePage.locator('#confirm-clear').click();
  const clearedDownload = samplePage.waitForEvent('download'); await samplePage.locator('#export').click();
  expect(JSON.parse(await readFile(await (await clearedDownload).path(),'utf8')).sampleData).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))).toBe(before);
  await samplePage.reload(); await expect(samplePage.locator('#memo')).not.toHaveValue('サンプルの変更'); await expect(samplePage.locator('#sample-banner')).toContainText('サンプル体験中');
  await page.reload(); await expect(page.locator('#memo')).toHaveValue('実データを保持');
});

test('changed originals are preserved when a suspended equipment draft is restored', async ({page}) => {
  await page.goto('/downloads/equipment-manager.html');
  const original={schemaVersion:2,toolId:'equipment-manager',text:'',items:[{id:'one',assetNumber:'0001',name:'変更前'}]};
  const load=async data=>{page.once('dialog',d=>d.accept());await page.locator('#import-file').setInputFiles({name:'復元.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.locator('#feedback')).toContainText('読み込みました');};
  await load(original);await page.locator('#navigation [data-view="list"]').click();await page.getByRole('button',{name:'0001 変更前を編集',exact:true}).click();await page.locator('#field-name').fill('途中の入力');await page.locator('#field-name').fill('変更前');
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('municipal-toolbox:draft:v1:equipment-manager'))).values.name).toBe('変更前');
  await page.locator('#field-name').fill('復元する下書き');await page.locator('#suspend-edit').click();
  await load({...original,items:[{...original.items[0],name:'別の変更'}]});
  page.once('dialog',d=>{expect(d.message()).toContain('新規登録');d.accept();});await page.locator('#resume-draft').click();await page.locator('#field-assetNumber').fill('0002');await page.locator('#submit-record').click();
  await expect(page.locator('#equipment-rows')).toContainText('別の変更');await expect(page.locator('#equipment-rows')).toContainText('復元する下書き');
});

test('theme, CSV import and draft resumption work from a local offline HTML file',async({page,context})=>{
  await context.setOffline(true);await page.goto(pathToFileURL(resolve('public/downloads/equipment-manager.html')).href);
  await page.locator('[data-theme-toggle]').click();await page.locator('#navigation [data-view="list"]').click();await page.locator('#csv-import').click();
  await page.locator('#csv-file').setInputFiles({name:'端末内.csv',mimeType:'text/csv',buffer:Buffer.from('管理番号,備品名\n0009,オフライン備品')});await page.locator('#csv-validate').click();await page.locator('#csv-accept').click();await expect(page.locator('#equipment-rows')).toContainText('0009');
  await page.locator('#add-record').click();await page.locator('#field-name').fill('オフライン下書き');await page.locator('#suspend-edit').click();await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.locator('#resume-draft').click();await expect(page.locator('#field-name')).toHaveValue('オフライン下書き');
});

test('JSON comparison shows tool, file, date and counts before any replacement', async ({ page }) => {
  await page.goto('/downloads/equipment-manager.html'); await page.locator('#memo').fill('保持');
  const file = { schemaVersion:2,toolId:'equipment-manager',text:'取り込むメモ',items:[],exportedAt:'2026-10-05T01:02:03Z' };
  page.once('dialog', dialog => { expect(dialog.message()).toContain('対象ツール：備品管理台帳'); expect(dialog.message()).toContain('ファイル：日本語 台帳.json'); expect(dialog.message()).toContain('2026'); expect(dialog.message()).toContain('メモ文字数：2 → 6'); dialog.dismiss(); });
  await page.locator('#import-file').setInputFiles({ name:'日本語 台帳.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#memo')).toHaveValue('保持');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name:'日本語 台帳.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#memo')).toHaveValue('取り込むメモ');
});
