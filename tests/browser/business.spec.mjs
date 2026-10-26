import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {tools} from '../../src/data/tools.ts';
import AxeBuilder from '@axe-core/playwright';
const business=tools.filter(tool=>tool.status==='ready'&&!['handover-note','equipment-manager'].includes(tool.id));
const nav=(page,id)=>page.locator('#navigation [data-view="'+id+'"]').click();
async function upload(page,data){page.once('dialog',d=>d.accept());await page.locator('#import-file').setInputFiles({name:'日本語 バックアップ.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.locator('#feedback')).toContainText('読み込みました');}
async function output(page){const pending=page.waitForEvent('download');await page.locator('#export').click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));}
for(const tool of business){
  test(tool.id+' protects corrupt storage and concurrent changes, resumes drafts and undoes deletion',async({page,context})=>{
    const key='municipal-toolbox:data:v2:'+tool.id;
    await page.goto('/downloads/'+tool.id+'.html');
    await page.evaluate(key=>localStorage.setItem(key,'{broken'),key);await page.reload();
    await page.locator('#memo').fill('破損時の未保存メモ');
    expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('{broken');
    await expect(page.locator('#storage-warning')).toBeVisible();expect((await output(page)).text).toBe('破損時の未保存メモ');
    const sample=JSON.parse(await readFile('tools-src/'+tool.id+'/sample.json','utf8'));await upload(page,sample);
    const config=JSON.parse(await page.locator('#tool-config').textContent()),section=config.sections[0];
    await nav(page,section.id);await page.locator('#add-record').click();
    for(const field of section.fields.filter(field=>field.required&&!['date','select','number'].includes(field.type)))await page.locator('#field-'+field.key).fill(field.key==='assetNumber'||field.key==='code'?'DRAFT-01':'下書きから登録');
    await page.locator('#suspend-edit').click();await page.reload();await page.getByRole('button',{name:'下書きを再開',exact:true}).click();
    await page.locator('#submit-record').click();await expect(page.locator('#edit-dialog')).not.toBeVisible();
    const saved=await output(page),created=saved.sections[section.id].at(-1);expect(saved.sections[section.id].length).toBe(sample.sections[section.id].length+1);
    await nav(page,section.id);if(tool.id==='annual-calendar')await page.locator('#calendar-mode').selectOption('list');
    page.once('dialog',d=>d.accept());await page.locator('[data-record-id="'+created.id+'"]').getByRole('button',{name:'削除',exact:true}).click();
    await page.getByRole('button',{name:'直前の操作を取り消す',exact:true}).click();await page.reload();expect((await output(page)).sections).toEqual(saved.sections);
    const second=await context.newPage();await second.goto('/downloads/'+tool.id+'.html');await second.locator('#memo').fill('別画面の確定内容');
    await page.locator('#memo').fill('古い画面の未保存内容');await expect(page.locator('#storage-warning')).toContainText('別の画面');
    expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key)).text).toBe('別画面の確定内容');expect((await output(page)).text).toBe('古い画面の未保存内容');await second.close();
  });
  test(tool.id+' legacy data, JSON restoration, validation, extensions and quota protection',async({page})=>{
    await page.goto('/downloads/'+tool.id+'.html');
    const legacy={schemaVersion:1,toolId:tool.id,text:'移行前のメモ',extension:{kept:true}},key='municipal-toolbox:preview:v1:'+tool.id;
    await page.evaluate(({key,legacy})=>localStorage.setItem(key,JSON.stringify(legacy)),{key,legacy});await page.reload();await expect(page.locator('#memo')).toHaveValue('移行前のメモ');
    expect((await output(page)).legacyBackup).toEqual(legacy);
    const sample=JSON.parse(await readFile('tools-src/'+tool.id+'/sample.json','utf8'));sample.extension={kept:true};
    const section=Object.keys(sample.sections)[0];sample.sections[section][0].extension={kept:true};await upload(page,sample);
    await nav(page,section);if(tool.id==='annual-calendar'){await page.locator('#calendar-date').fill('2026-10-01');await page.locator('#calendar-mode').selectOption('list');}await page.locator('#record-list .record-card').first().getByRole('button',{name:'編集',exact:true}).click();await page.locator('#submit-record').click();
    const backup=await output(page);expect(backup.extension).toEqual({kept:true});expect(backup.sections[section][0].extension).toEqual({kept:true});
    await nav(page,'data');await page.locator('#clear').click();await page.locator('#clear-confirm').fill('すべて削除');await page.locator('#confirm-clear').click();await upload(page,backup);await page.reload();
    expect((await output(page)).sections).toEqual(backup.sections);expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)).toEqual(legacy);
    for(const input of ['{bad',JSON.stringify({...backup,toolId:'other'}),JSON.stringify({...backup,sections:{}})]){
      await page.locator('#import-file').setInputFiles({name:'不正.json',mimeType:'application/json',buffer:Buffer.from(input)});await expect(page.locator('#feedback')).not.toHaveText('バックアップを読み込みました。');expect((await output(page)).sections).toEqual(backup.sections);
    }
    await page.evaluate(id=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='municipal-toolbox:data:v2:'+id)throw new DOMException('full','QuotaExceededError');return original.call(this,key,value);};},tool.id);
    await page.locator('#memo').fill('保存できないメモ');await expect(page.locator('#storage-warning')).toContainText('保存できません');expect((await output(page)).text).toBe('保存できないメモ');
  });
  test(tool.id+' sample changes and clear leave all normal data untouched',async({page})=>{
    await page.addInitScript(({id})=>{localStorage.setItem('municipal-toolbox:data:v2:'+id,'{"protected":"業務データ"}');localStorage.setItem('municipal-toolbox:preview:v1:'+id,'旧領域');localStorage.setItem('municipal-toolbox:draft:v1:'+id,'下書き');localStorage.setItem('municipal-toolbox:export-operation:v1:'+id,'2026-01-01');},{id:tool.id});
    await page.goto('/downloads/'+tool.id+'.html#sample');await expect(page.locator('#sample-banner')).toContainText('サンプル体験中');
    const baseline=await page.evaluate(()=>({...localStorage}));await page.locator('#memo').fill('デモで変更');expect((await output(page)).sampleData).toBe(true);
    await nav(page,'data');await page.locator('#clear').click();await page.locator('#clear-confirm').fill('すべて削除');await page.locator('#confirm-clear').click();
    expect(await page.evaluate(()=>({...localStorage}))).toEqual(baseline);await page.reload();await expect(page.locator('#memo')).not.toHaveValue('デモで変更');
  });
  test(tool.id+' responsive screens, keyboard dialog and accessibility',async({page})=>{
    await page.goto('/downloads/'+tool.id+'.html#sample');const config=await page.locator('#tool-config').textContent();const sections=JSON.parse(config).sections;
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});for(const id of ['home',...sections.map(section=>section.id),'data','help']){if(id==='help')await page.locator('header [data-view="help"]').click();else await nav(page,id);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}}
    await nav(page,sections[0].id);await page.locator('#add-record').click();await page.keyboard.press('Shift+Tab');await expect(page.locator('#close-edit')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#add-record')).toBeFocused();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  });
}
test('lending registers and returns loans, blocks double lending and referenced deletion',async({page})=>{
  await page.goto('/downloads/lending-manager.html#sample');await nav(page,'loans');
  await page.locator('#add-record').click();await page.locator('#field-assetId').selectOption('asset-1');await page.locator('#field-borrowerId').selectOption('borrower-1');await page.locator('#field-dueDate').fill('2026-12-31');await page.locator('#submit-record').click();await expect(page.locator('#form-error')).toContainText('重ねて貸し出せません');
  page.once('dialog',d=>d.accept());await page.locator('#cancel-edit').click();
  await page.locator('[data-record-id="loan-1"]').getByRole('button',{name:'返却日を入力'}).click();await page.locator('#field-returnedAt').fill('2026-10-26');await page.locator('#submit-record').click();await expect(page.locator('[data-record-id="loan-1"] .record-state')).toHaveText('返却済み');
  await page.locator('#add-record').click();await page.locator('#field-assetId').selectOption('asset-1');await page.locator('#field-borrowerId').selectOption('borrower-1');await page.locator('#field-dueDate').fill('2026-12-31');await page.locator('#submit-record').click();await expect(page.locator('#record-list .record-card')).toHaveCount(3);
  await nav(page,'assets');page.once('dialog',d=>d.accept());await page.locator('[data-record-id="asset-1"]').getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('#feedback')).toContainText('関連する履歴');
});
test('inventory movements update shortages and reject stock below zero',async({page})=>{
  await page.goto('/downloads/inventory-manager.html#sample');await nav(page,'items');await page.locator('#state-filter').selectOption('在庫不足');await expect(page.locator('#record-list .record-card')).toHaveCount(1);await expect(page.locator('#record-list')).toContainText('現在庫：2 箱');
  await nav(page,'movements');await page.locator('#add-record').click();await page.locator('#field-itemId').selectOption('item-1');await page.locator('#field-direction').selectOption('出庫');await page.locator('#field-quantity').fill('3');await page.locator('#submit-record').click();await expect(page.locator('#form-error')).toContainText('在庫が範囲外');
  await page.locator('#field-direction').selectOption('入庫');await page.locator('#field-quantity').fill('5');await page.locator('#submit-record').click();await nav(page,'items');await expect(page.locator('[data-record-id="item-1"]')).toContainText('現在庫：7 箱');
  await page.locator('#state-filter').selectOption('在庫不足');await expect(page.locator('#empty-state')).toBeVisible();
});
test('calendar month, week, fiscal list, editing and printing use the chosen period',async({page})=>{
  await page.goto('/downloads/annual-calendar.html#sample');await nav(page,'events');await expect(page.locator('.calendar-day')).toHaveCount(31);await expect(page.locator('#calendar-grid')).toContainText('月次の備品確認');
  await page.locator('#calendar-date').fill('2026-10-05');await page.locator('#calendar-mode').selectOption('week');await expect(page.locator('.calendar-day')).toHaveCount(7);await expect(page.locator('#result-count')).toContainText('2件表示');
  await page.locator('#calendar-mode').selectOption('list');await expect(page.locator('#record-list .record-card')).toHaveCount(3);await page.locator('#state-filter').selectOption('イベント');await expect(page.locator('#record-list .record-card')).toHaveCount(1);
  await page.evaluate(()=>{window.print=()=>{};});await page.locator('#print-current').click();await expect(page.locator('#print-area')).toContainText('防災研修');await expect(page.locator('#print-area')).not.toContainText('年度末');
  await page.locator('#state-filter').selectOption('');await page.locator('#period-next').click();await expect(page.locator('#empty-state')).toBeVisible();
});
test('meeting TODO links, completion filters and minutes printing preserve the meeting',async({page})=>{
  await page.goto('/downloads/meeting-minutes.html#sample');await nav(page,'todos');await page.locator('#parent-filter').selectOption('meeting-1');await page.locator('#state-filter').selectOption('未着手');await expect(page.locator('#record-list .record-card')).toHaveCount(1);
  await page.getByRole('button',{name:'完了にする',exact:true}).click();await expect(page.locator('#empty-state')).toBeVisible();await page.locator('#state-filter').selectOption('完了');await expect(page.locator('#record-list .record-card')).toHaveCount(2);
  await nav(page,'meetings');await page.evaluate(()=>{window.print=()=>{};});await page.locator('#print').click();await expect(page.locator('#print-area')).toContainText('決定事項');await expect(page.locator('#print-area')).toContainText('備品一覧を配布する');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('#feedback')).toContainText('関連する履歴');
});
test('inquiry search and status filtering export every matching row with safe CSV',async({page})=>{
  await page.goto('/downloads/inquiry-log.html#sample');await nav(page,'inquiries');await page.locator('#query').fill('受付');await page.locator('#state-filter').selectOption('完了');await expect(page.locator('#record-list .record-card')).toHaveCount(1);
  await page.getByRole('button',{name:'編集',exact:true}).click();await page.locator('#field-content').fill('=1+1\nカンマ,引用"');await page.locator('#submit-record').click();
  const pending=page.waitForEvent('download');await page.locator('#csv-current').click();const csv=await readFile(await(await pending).path(),'utf8');expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=1+1\nカンマ,引用"""');expect(csv).toContain('受付日');expect(csv).not.toContain('配布資料');
  expect((await output(page)).sections.inquiries[1].content).toBe('=1+1\nカンマ,引用"');
});
test('event planning separates related records and completes day-of checklist',async({page})=>{
  await page.goto('/downloads/event-manager.html#sample');for(const section of ['tasks','participants','materials','checklist']){await nav(page,section);await page.locator('#parent-filter').selectOption('event-1');await expect(page.locator('#record-list')).not.toBeEmpty();}
  await page.locator('#state-filter').selectOption('未確認');await expect(page.locator('#record-list .record-card')).toHaveCount(2);await page.locator('[data-record-id="check-1"]').getByRole('button',{name:'完了にする'}).click();await expect(page.locator('#record-list .record-card')).toHaveCount(1);
  await nav(page,'events');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'削除',exact:true}).click();await expect(page.locator('#feedback')).toContainText('関連する履歴');
  const data=await output(page);expect(data.sections.checklist[0].status).toBe('完了');expect(data.sections.participants[0].name).toBe('庶務担当（架空）');
});
