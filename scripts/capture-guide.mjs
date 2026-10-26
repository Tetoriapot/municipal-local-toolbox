import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../public/guide-images/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  await page.goto('http://127.0.0.1:4321/tools/equipment-manager/');
  await page.locator('.download-panel').screenshot({ path: fileURLToPath(new URL('download.png', output)) });
  await page.goto('http://127.0.0.1:4321/downloads/equipment-manager.html');
  await page.screenshot({ path: fileURLToPath(new URL('start.png', output)) });
  await page.locator('#import').click();
  await page.locator('#prepare-import-dialog').screenshot({ path: fileURLToPath(new URL('backup.png', output)) });
  console.log('Captured three guide images from the running app.');
} finally { await browser.close(); }
