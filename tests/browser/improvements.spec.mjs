import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { freshData } from '../../tools-src/handover-note/model.ts';
import AxeBuilder from '@axe-core/playwright';

async function loadFixture(page, tool) {
  const data = tool === 'equipment-manager'
    ? { schemaVersion:2, toolId:tool, text:'保持するメモ', items:[{id:'one',assetNumber:'0001',name:'確認用備品',extension:{kept:true}}] }
    : { ...freshData(), text:'保持するメモ' };
  if (tool === 'handover-note') data.sections.duties.push({id:'one',title:'確認用業務',completed:false,extension:{kept:true}});
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({name:'確認.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('#feedback')).toContainText('読み込みました');
  return data;
}
async function exported(page) {
  const pending = page.waitForEvent('download'); await page.locator('#export').click();
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}

test('ready filter combines with search, survives reload and resets', async ({ page }) => {
  await page.goto('/tools/');
  await page.getByLabel('業務機能を実装済みのツールだけ').check();
  await expect(page.locator('[data-result-count]')).toHaveText('2');
  await page.reload();
  await expect(page.getByLabel('業務機能を実装済みのツールだけ')).toBeChecked();
  await page.getByRole('searchbox').fill('CSV');
  await expect(page.locator('[data-result-count]')).toHaveText('1');
  await page.getByRole('button', { name:'条件をクリア', exact:true }).click();
  await expect(page.locator('[data-result-count]')).toHaveText('8');
  for (const route of ['/about/', '/terms/', '/faq/']) {
    await page.goto(route);
    await expect(page.locator('main')).not.toContainText('公開前に');
    await expect(page.locator('main')).toContainText('未定');
  }
});

for (const tool of ['equipment-manager','handover-note']) test(tool + ' deletion undo, later edits, storage conflicts and import preparation', async ({page}) => {
  await page.goto('/downloads/' + tool + '.html');
  await loadFixture(page,tool);
  const openList = async () => page.locator('#navigation [data-view="' + (tool === 'equipment-manager' ? 'list' : 'duties') + '"]').click();
  const remove = async () => {
    await openList(); page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:tool === 'equipment-manager' ? '0001 確認用備品を削除' : '削除',exact:true}).click();
  };
  await remove(); await expect(page.locator('#undo-last')).toBeVisible(); await page.locator('#undo-last').click();
  const restored = await exported(page);
  expect((tool === 'equipment-manager' ? restored.items : restored.sections.duties)[0].extension.kept).toBe(true);
  await page.reload(); await openList();
  await expect(page.getByRole('button',{name:tool === 'equipment-manager' ? '0001 確認用備品を削除' : '削除',exact:true})).toBeVisible();
  await remove(); await page.locator('#navigation [data-view="home"]').click(); await page.locator('#memo').fill('後からの変更');
  await expect(page.locator('#undo-last')).toBeHidden();
  await loadFixture(page,tool); await remove();
  await page.evaluate(tool=>localStorage.setItem('municipal-toolbox:data:v2:'+tool,'{"other":"別の画面"}'),tool);
  await page.locator('#undo-last').click();
  await expect(page.locator('.recovery-panel')).toContainText('新しい内容を保護');
  expect(await page.evaluate(tool=>localStorage.getItem('municipal-toolbox:data:v2:'+tool),tool)).toBe('{"other":"別の画面"}');
  await page.locator('#import').click(); await expect(page.locator('#prepare-import-dialog')).toBeVisible();
  const download = page.waitForEvent('download'); await page.locator('#export-before-import').click();
  expect((await download).suggestedFilename()).toContain('backup');
  await page.keyboard.press('Escape'); await expect(page.locator('#import')).toBeFocused();
});

for (const tool of ['equipment-manager','handover-note']) test(tool + ' draft export and dedicated import restore unfinished work without replacing confirmed data', async ({page,browser}) => {
  await page.goto('/downloads/' + tool + '.html');
  await page.locator('#navigation [data-view="' + (tool === 'equipment-manager' ? 'list' : 'duties') + '"]').click();
  await page.locator('#add-record').click();
  const title = tool === 'equipment-manager' ? '#field-name' : '#field-title';
  if (tool === 'equipment-manager') await page.locator('#field-assetNumber').fill('0002');
  await page.locator(title).fill('移行する下書き'); await page.locator('#suspend-edit').click();
  const pending = page.waitForEvent('download'); await page.getByRole('button',{name:'下書きを書き出す',exact:true}).click();
  const incoming = JSON.parse(await readFile(await (await pending).path(),'utf8')); incoming.futureMetadata={kept:true};
  const destination = await browser.newPage();
  try {
    await destination.goto('http://127.0.0.1:4321/downloads/' + tool + '.html'); await loadFixture(destination,tool);
    await destination.locator('#navigation [data-view="data"]').click();
    const upload = data => destination.locator('#import-draft-file').setInputFiles({name:'日本語 下書き.json',mimeType:'application/json',buffer:Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))});
    for (const bad of ['{broken',{...incoming,toolId:'other'},{...incoming,section:'invalid'},{...incoming,values:{...incoming.values,[tool === 'equipment-manager' ? 'name' : 'title']:true}}]) {
      await upload(bad); await expect(destination.locator('#draft-import-message')).toContainText('読み込めません');
      expect(await destination.evaluate(tool=>localStorage.getItem('municipal-toolbox:draft:v1:'+tool),tool)).toBeNull();
    }
    destination.once('dialog',d=>d.dismiss()); await upload(incoming); await expect(destination.locator('#draft-import-message')).toContainText('キャンセル');
    destination.once('dialog',d=>d.accept()); await upload(incoming); await expect(destination.locator('#draft-import-message')).toContainText('読み込みました');
    await upload(incoming); await expect(destination.locator('#draft-import-message')).toContainText('既存の下書き');
    const confirmed = await exported(destination); expect((tool === 'equipment-manager' ? confirmed.items : confirmed.sections.duties)).toHaveLength(1);
    await destination.reload(); await destination.locator('#resume-draft').click(); await expect(destination.locator(title)).toHaveValue('移行する下書き');
    await destination.locator(title).fill('移行後の変更'); await destination.locator('#suspend-edit').click();
    expect(await destination.evaluate(tool=>JSON.parse(localStorage.getItem('municipal-toolbox:draft:v1:'+tool)).futureMetadata,tool)).toEqual({kept:true});
    await destination.locator('#resume-draft').click(); await destination.locator('#submit-record').click();
    const result=await exported(destination); expect((tool === 'equipment-manager' ? result.items : result.sections.duties)).toHaveLength(2);
  } finally { await destination.close(); }
});

test('guide screenshots, keyboard controls and narrow reflow remain usable', async ({page}) => {
  for (const width of [1440,768,640,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const route of ['/guide/','/tools/?status=ready','/downloads/equipment-manager.html','/downloads/handover-note.html']) {
      await page.goto(route);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.goto('/guide/');
  const images = page.locator('figure img'); await expect(images).toHaveCount(3);
  for (const image of await images.all()) { await image.scrollIntoViewIfNeeded(); await expect(image).toHaveJSProperty('complete',true); expect(await image.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0); }
  await page.locator('summary').first().focus(); await page.keyboard.press('Enter'); await expect(page.locator('details').first()).toHaveAttribute('open','');
  await page.goto('/downloads/equipment-manager.html'); await page.locator('#import').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#export-before-import')).toBeFocused(); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#prepare-import-dialog').getByRole('button',{name:'キャンセル'})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#import')).toBeFocused();
  await page.locator('#navigation [data-view="data"]').click();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:'test-results/screenshots/improvements-mobile.png',fullPage:true});
});

test('CSV update comparison, paging, consent, undo and stocktake filtering preserve data', async ({page})=>{
  await page.goto('/downloads/equipment-manager.html'); await loadFixture(page,'equipment-manager');
  await page.locator('#navigation [data-view="list"]').click();
  const csv='管理番号,備品名,設置場所,棚卸確認日,棚卸確認者\n0001,更新した備品,別館,2026/10/26,確認担当\n'+Array.from({length:21},(_,i)=>String(i+2).padStart(4,'0')+',追加備品'+i+',倉庫,,').join('\n');
  const prepare=async()=>{
    await page.locator('#csv-import').click(); await page.locator('#csv-mode').selectOption('upsert');
    await page.locator('#csv-file').setInputFiles({name:'更新.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    await page.locator('#csv-validate').click(); await expect(page.locator('#csv-summary')).toContainText('更新 1件');
  };
  await prepare(); await expect(page.locator('#csv-preview')).toContainText('確認用備品'); await expect(page.locator('#csv-preview')).toContainText('更新した備品');
  await expect(page.locator('#csv-accept')).toBeDisabled(); await page.locator('#csv-next').click(); await expect(page.locator('#csv-page')).toHaveText('2 / 2');
  await page.locator('#csv-cancel').click(); await expect(page.locator('#equipment-rows tr')).toHaveCount(1);
  await prepare(); await page.locator('#csv-review').check(); await page.locator('#csv-accept').click(); await expect(page.locator('#equipment-rows tr')).toHaveCount(22);
  await page.locator('#undo-last').click(); await expect(page.locator('#equipment-rows tr')).toHaveCount(1); await expect(page.locator('#equipment-rows')).toContainText('確認用備品');
  await prepare(); await page.locator('#csv-review').check(); await page.locator('#csv-accept').click(); await page.reload(); await page.locator('#navigation [data-view="list"]').click();
  await page.locator('#check-year').fill('2026'); await page.locator('#checked-filter').selectOption('pending'); await expect(page.locator('#equipment-rows tr')).toHaveCount(21);
  await page.locator('#checked-filter').selectOption('done'); await expect(page.locator('#equipment-rows tr')).toHaveCount(1); await expect(page.locator('#equipment-rows')).toContainText('確認担当');
  const result=await exported(page); expect(result.items[0].id).toBe('one'); expect(result.items[0].extension).toEqual({kept:true}); expect(result.text).toBe('保持するメモ');
  const pending=page.waitForEvent('download'); await page.locator('#csv-all').click(); expect((await readFile(await (await pending).path(),'utf8'))).toContain('追加備品20');
});

test('handover examples do not alter fields and deadline sorting works with pending filter',async({page})=>{
  await page.goto('/downloads/handover-note.html');
  const data=freshData(); data.sections.notes=[{id:'later',title:'後の期限',dueDate:'2026-12-01',completed:false},{id:'none',title:'期限未定',completed:false},{id:'earlier',title:'先の期限',dueDate:'2026-11-01',completed:false},{id:'done',title:'確認済み',dueDate:'2026-01-01',completed:true}];
  page.once('dialog',d=>d.accept()); await page.locator('#import-file').setInputFiles({name:'引継ぎ.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.locator('#navigation [data-view="notes"]').click(); await page.locator('#completion-filter').selectOption('pending'); await page.locator('#record-sort').selectOption('due');
  await expect(page.locator('#record-list h3')).toHaveText(['先の期限','後の期限','期限未定']);
  await page.locator('#add-record').click(); await page.locator('#entry-examples summary').click(); await expect(page.locator('#entry-examples')).toContainText('貸出中の備品'); await expect(page.locator('#field-title')).toHaveValue('');
  await page.locator('#cancel-edit').click(); await page.locator('#navigation [data-view="duties"]').click(); await expect(page.locator('#record-sort')).toBeDisabled();
});

test('draft import rejects invalid files, quota failure and a newer draft without changing confirmed data',async({page})=>{
  await page.goto('/downloads/equipment-manager.html'); await loadFixture(page,'equipment-manager');
  await page.locator('#navigation [data-view="data"]').click();
  const key='municipal-toolbox:draft:v1:equipment-manager';
  const draft={schemaVersion:1,toolId:'equipment-manager',section:'equipment',id:null,base:null,values:{assetNumber:'0002',name:'移行用'},updatedAt:'2026-10-26T00:00:00.000Z'};
  const upload=(buffer,name='下書き.json',mimeType='application/json')=>page.locator('#import-draft-file').setInputFiles({name,mimeType,buffer});
  for(const [buffer,name,mime] of [[Buffer.alloc(0),'空.json','application/json'],[Buffer.from(JSON.stringify(draft)),'下書き.txt','text/plain'],[Buffer.from(JSON.stringify(draft)),'下書き.json','image/png'],[Buffer.alloc(2*1024*1024+1),'巨大.json','application/json']]) {
    await upload(buffer,name,mime); await expect(page.locator('#draft-import-message')).toContainText('読み込めません');
    expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  }
  await page.evaluate(key=>{ const original=Storage.prototype.setItem; Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('full','QuotaExceededError');return original.call(this,name,value);}; },key);
  page.once('dialog',d=>d.accept()); await upload(Buffer.from(JSON.stringify(draft)));
  await expect(page.locator('#draft-import-message')).toContainText('保存制限や容量');
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
  await page.reload(); await page.locator('#navigation [data-view="data"]').click();
  const newer=JSON.stringify({...draft,values:{...draft.values,name:'他画面の下書き'}});
  await page.evaluate(({key,newer})=>{const original=File.prototype.text;File.prototype.text=async function(){const result=await original.call(this);localStorage.setItem(key,newer);return result;};},{key,newer});
  page.once('dialog',d=>d.accept()); await upload(Buffer.from(JSON.stringify(draft)));
  await expect(page.locator('#draft-import-message')).toContainText('別の画面');
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(newer);
  const confirmed=await exported(page); expect(confirmed.items).toHaveLength(1); expect(confirmed.items[0].name).toBe('確認用備品');
});

test('CSV approval refuses a preview if another screen changed the saved ledger',async({page})=>{
  await page.goto('/downloads/equipment-manager.html'); await loadFixture(page,'equipment-manager');
  await page.locator('#navigation [data-view="list"]').click(); await page.locator('#csv-import').click();
  await page.locator('#csv-mode').selectOption('upsert');
  await page.locator('#csv-file').setInputFiles({name:'更新.csv',mimeType:'text/csv',buffer:Buffer.from('管理番号,備品名\n0001,CSVの変更')});
  await page.locator('#csv-validate').click(); await page.locator('#csv-review').check();
  const key='municipal-toolbox:data:v2:equipment-manager';
  const changed=await page.evaluate(key=>{const data=JSON.parse(localStorage.getItem(key));data.items[0].name='別画面の変更';const value=JSON.stringify(data);localStorage.setItem(key,value);return value;},key);
  await page.locator('#csv-accept').click(); await expect(page.locator('#csv-error')).toContainText('台帳が変更されました');
  await expect(page.locator('#csv-accept')).toBeDisabled(); expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(changed);
});
