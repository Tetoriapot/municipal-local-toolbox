import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeBackup, MAX_FILE_BYTES } from '../../tools-src/shared/backup.mjs';

test('preview JSON preserves unknown keys, rejects oversized output and protects another tab', async ({ page, context }) => {
  const key = 'municipal-toolbox:preview:v1:lending-manager';
  const path = '/downloads/lending-manager.html';
  await page.goto(path);
  const backup = { ...makeBackup('lending-manager', '元のメモ'), custom: { kept: '保存対象' } };
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name: '備品 バックアップ.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#memo')).toHaveValue('元のメモ');
  await page.locator('#memo').fill('追記したメモ');
  await page.reload();
  const event = page.waitForEvent('download');
  await page.locator('#export').click();
  const result = JSON.parse(await readFile(await (await event).path(), 'utf8'));
  expect(result.custom).toEqual(backup.custom);
  expect(result.text).toBe('追記したメモ');

  const oversizedAfterFormatting = { ...backup, extra: Array.from({ length: 170000 }, () => 0) };
  const raw = JSON.stringify(oversizedAfterFormatting);
  expect(Buffer.byteLength(raw)).toBeLessThan(MAX_FILE_BYTES);
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(page.locator('#feedback')).toContainText('1MB');
  await expect(page.locator('#memo')).toHaveValue('追記したメモ');

  const other = await context.newPage();
  await other.goto(path);
  await page.locator('#memo').fill('新しい保存内容');
  await other.locator('#memo').fill('古い画面の編集');
  await expect(other.locator('#save-status')).toContainText('別の画面');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).text).toBe('新しい保存内容');
  other.once('dialog', dialog => dialog.accept());
  await other.locator('#clear').click();
  await expect(other.locator('#feedback')).toContainText('別の画面');
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).text).toBe('新しい保存内容');
});
