import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {tools} from '../../src/data/tools.ts';
import AxeBuilder from '@axe-core/playwright';
for(const tool of tools)test(tool.id+' demo runs in isolation, creates records, exports and resets',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(id=>{if(window.top===window){localStorage.setItem('municipal-toolbox:data:v2:'+id,'{"protected":"業務データ"}');localStorage.setItem('municipal-toolbox:preview:v1:'+id,'旧メモ');localStorage.setItem('municipal-toolbox:draft:v1:'+id,'下書き');}},tool.id);
  await page.goto('/demo/'+tool.id+'/');const baseline=await page.evaluate(()=>({...localStorage}));
  expect(await page.locator('html').evaluate(element=>getComputedStyle(element).scrollBehavior)).toBe('auto');
  const frame=page.frameLocator('#demo-frame');await expect(frame.locator('#sample-banner')).toContainText('これはデモ版です');await expect(frame.getByRole('heading',{level:1})).toContainText(tool.name);
  await expect(page.locator('#demo-frame')).toHaveAttribute('sandbox','allow-scripts allow-forms allow-modals allow-downloads');
  const original=await frame.locator('#memo').inputValue();await frame.locator('#memo').fill('デモだけの変更');
  const pending=page.waitForEvent('download');await frame.locator('#export').click();const file=await pending;expect(file.suggestedFilename()).toMatch(/^sample-/);expect(JSON.parse(await readFile(await file.path(),'utf8')).text).toBe('デモだけの変更');
  if(tool.id==='equipment-manager'){await frame.locator('#navigation [data-view="list"]').click();await frame.locator('#add-record').click();await frame.locator('#field-assetNumber').fill('DEMO-NEW');await frame.locator('#field-name').fill('デモ登録');}
  else if(tool.id==='handover-note'){await frame.locator('#navigation [data-view="duties"]').click();await frame.locator('#add-record').click();await frame.locator('#field-title').fill('デモ登録');}
  else {
    const config=JSON.parse(await frame.locator('#tool-config').textContent());await frame.locator('#section-navigation button').first().click();await frame.locator('#add-record').click();
    for(const field of config.sections[0].fields.filter(field=>field.required&&!['date','select','number'].includes(field.type)))await frame.locator('#field-'+field.key).fill(field.key==='assetNumber'||field.key==='code'?'DEMO-NEW':'デモ登録');
  }
  await frame.locator('#submit-record').click();await expect(frame.locator('#edit-dialog')).not.toBeVisible();expect(await page.evaluate(()=>({...localStorage}))).toEqual(baseline);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#reset-demo').click();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-demo').click();await expect(frame.locator('#memo')).toHaveValue(original);
  await frame.locator('[data-theme-toggle]').click();await expect(frame.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>({...localStorage}))).toEqual(baseline);
  await frame.locator('#open-updates').click();await expect(frame.locator('#updates-dialog')).toBeVisible();await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
test('all demo entry links, narrow frames and keyboard reset are accessible',async({page})=>{
  await page.goto('/demo/');await expect(page.getByRole('link',{name:/のデモを開く$/})).toHaveCount(8);
  for(const tool of tools){await page.goto('/tools/'+tool.id+'/');await expect(page.getByRole('link',{name:'デモを開く（別画面）'})).toHaveAttribute('href','/demo/'+tool.id+'/');}
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.goto('/demo/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.goto('/demo/event-manager/');await expect(page.frameLocator('#demo-frame').locator('#memo')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).exclude('#demo-frame').analyze()).violations).toEqual([]);
  await page.screenshot({path:'.local-review/business-screens/demo-mobile.png',fullPage:true});
});
