import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {tools} from '../src/data/tools.ts';
await mkdir('.local-review/business-screens',{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  for(const tool of tools.filter(tool=>tool.status==='ready'&&!['handover-note','equipment-manager'].includes(tool.id))){
    await page.goto('http://127.0.0.1:4321/downloads/'+tool.id+'.html#sample');
    await page.locator('#section-navigation button').first().click();
    await page.screenshot({path:'.local-review/business-screens/'+tool.id+'-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local-review/business-screens/'+tool.id+'-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-theme-toggle]').click();await page.screenshot({path:'.local-review/business-screens/'+tool.id+'-dark.png',fullPage:true});await page.locator('[data-theme-toggle]').click();
    await page.evaluate(()=>{window.print=()=>{};});await page.locator('#print').click();await page.emulateMedia({media:'print'});await page.screenshot({path:'.local-review/business-screens/'+tool.id+'-print.png',fullPage:true});await page.emulateMedia({media:'screen'});
  }
  await page.goto('http://127.0.0.1:4321/demo/');await page.screenshot({path:'.local-review/business-screens/demo-index.png',fullPage:true});
  await page.goto('http://127.0.0.1:4321/demo/annual-calendar/');await page.frameLocator('#demo-frame').locator('#section-navigation button').first().click();await page.screenshot({path:'.local-review/business-screens/demo-desktop.png',fullPage:true});
}finally{await browser.close();}
