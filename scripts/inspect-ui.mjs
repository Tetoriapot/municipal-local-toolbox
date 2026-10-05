import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.on('pageerror', error => console.error(error));
await page.goto('http://127.0.0.1:4321/');
await page.screenshot({ path: 'test-results/screenshots/home-desktop.png', fullPage: true });
await page.goto('http://127.0.0.1:4321/tools/');
await page.screenshot({ path: 'test-results/screenshots/catalog-desktop.png', fullPage: true });
await page.goto('http://127.0.0.1:4321/tools/handover-note/');
await page.screenshot({ path: 'test-results/screenshots/detail-desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:4321/');
await page.screenshot({ path: 'test-results/screenshots/home-mobile.png', fullPage: true });
await page.setViewportSize({ width: 1440, height: 1080 });
await page.goto('http://127.0.0.1:4321/downloads/handover-note.html');
await page.locator('#profile-department').fill('動作確認用 総務課');
for (const [section, title, fields] of [
  ['duties', '年度末の備品確認', { overview: '部署の備品台帳と保管場所を確認する。', procedure: '1. 台帳を出力する\n2. 現物と照合する\n3. 変更を台帳へ反映する', frequency: '年1回', deadline: '3月中旬', owner: '庶務担当', location: '共有フォルダー / 総務課 / 備品管理' }],
  ['schedule', '年度末の備品確認', { month: '3', timing: '3月15日まで', owner: '庶務担当' }],
  ['contacts', '庶務担当窓口', { organization: '総務課', phone: '内線 1234' }],
  ['files', '業務手順書', { location: '共有フォルダー / 総務課 / 引継ぎ資料' }],
  ['notes', '4月の担当者確認', { priority: '高', details: '年度初めに担当者を確認し、一覧を更新する。' }],
  ['checklist', '共有フォルダーの閲覧権限', { details: '後任者のPCから資料を開けることを確認する。' }],
]) {
  await page.locator('#navigation [data-view="' + section + '"]').click();
  await page.locator('#add-record').click();
  await page.locator('#field-title').fill(title);
  for (const [key, value] of Object.entries(fields)) {
    if (['month', 'priority'].includes(key)) await page.locator('#field-' + key).selectOption(value);
    else await page.locator('#field-' + key).fill(value);
  }
  await page.locator('#submit-record').click();
}
await page.locator('#navigation [data-view="home"]').click();
await page.screenshot({ path: 'test-results/screenshots/handover-home.png', fullPage: true });
await page.locator('#navigation [data-view="duties"]').click();
await page.screenshot({ path: 'test-results/screenshots/handover-records.png', fullPage: true });
await page.getByRole('button', { name: '編集', exact: true }).click();
await page.screenshot({ path: 'test-results/screenshots/handover-editor.png', fullPage: true });
await page.locator('#cancel-edit').click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'test-results/screenshots/handover-mobile.png', fullPage: true });
await page.setViewportSize({ width: 1080, height: 1080 });
await page.evaluate(() => { window.print = () => {}; });
await page.locator('#print').click();
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: 'test-results/screenshots/handover-print.png', fullPage: true });
await page.emulateMedia({ media: 'screen' });
await page.setViewportSize({ width: 1440, height: 1080 });
await page.goto('http://127.0.0.1:4321/downloads/equipment-manager.html');
await page.locator('#memo').fill('動作確認用の台帳です。実際の業務データは含みません。');
for (const [number, name, category, location, status] of [
  ['PC-001', 'ノートパソコン', '情報機器', '総務課', 'in-use'],
  ['PR-002', 'カラープリンター', '情報機器', '総務課', 'repair'],
  ['DK-003', '事務机', '家具', '別館倉庫', 'stored'],
]) {
  await page.locator('#navigation [data-view="list"]').click();
  await page.locator('#add-record').click();
  for (const [key, value] of Object.entries({ assetNumber: number, name, category, location, purchaseDate: '2025-04-01', notes: '年度末の現物確認の対象' })) await page.locator('#field-' + key).fill(value);
  await page.locator('#field-status').selectOption(status);
  await page.locator('#submit-record').click();
}
await page.locator('#navigation [data-view="home"]').click();
await page.screenshot({ path: 'test-results/screenshots/equipment-home.png', fullPage: true });
await page.locator('#navigation [data-view="list"]').click();
await page.screenshot({ path: 'test-results/screenshots/equipment-list.png', fullPage: true });
await page.locator('#equipment-rows button').first().click();
await page.screenshot({ path: 'test-results/screenshots/equipment-editor.png', fullPage: true });
await page.locator('#cancel-edit').click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'test-results/screenshots/equipment-mobile.png', fullPage: true });
await page.setViewportSize({ width: 1080, height: 1080 });
await page.evaluate(() => { window.print = () => {}; });
await page.locator('#print').click(); await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: 'test-results/screenshots/equipment-print.png', fullPage: true });
console.log('Screenshots saved; browser version: ' + browser.version());
await browser.close();
