import { el, node, action, trapDialogFocus } from '../shared/dom.ts';
import { createLocalStore } from '../shared/local-store.ts';
import { createRecoveryControls, recoveryRevision, setupBackupPreparation } from '../shared/recovery.ts';
import { createEditDraft, draftFormValues, restoreDraftValues } from '../shared/drafts.ts';
import { practiceMode } from '../shared/experience.ts';
import { backupComparison } from '../shared/import-comparison.mjs';
import { emptyBusiness, parseBusiness, parseBusinessText, serializeBusiness, normalizeBusiness, businessValue, readBusinessField, inventoryQuantity, loanStatus, calendarRange, businessCsv, BUSINESS_MAX_BYTES } from './model.ts';
import type { BusinessConfig, BusinessData, BusinessSection, BusinessField, BusinessRecord } from './model.ts';
declare const sample: unknown;

const config=JSON.parse(el('tool-config').textContent!) as BusinessConfig;
const storageKey='municipal-toolbox:data:v2:'+config.id;
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const editor=el<HTMLDialogElement>('edit-dialog'),form=el<HTMLFormElement>('record-form'),clearDialog=el<HTMLDialogElement>('clear-dialog');
let currentView='home',pageNumber=1,editSection:BusinessSection=config.sections[0],editing:BusinessRecord|undefined,editorStart='',returnFocus:HTMLElement|null=null,savedLabel='未入力',saveWarning=false;
function message(text:string,error=false){el('feedback').textContent=text;el('feedback').classList.toggle('error',error);}
const store=createLocalStore<BusinessData>({key:storageKey,legacyKey:'municipal-toolbox:preview:v1:'+config.id,fresh:()=>emptyBusiness(config),parse:raw=>parseBusinessText(raw,config),serialize:serializeBusiness,memoryOnly:practiceMode,onNotice:notice=>{
  savedLabel=notice.message;saveWarning=notice.dirty||['unavailable','corrupt','conflict'].includes(notice.status);
  el('save-status').textContent=savedLabel;el('save-status').classList.toggle('unsaved',saveWarning);el('storage-warning').hidden=!saveWarning;el('storage-message').textContent=notice.message;
}});
const recovery=createRecoveryControls(()=>recoveryRevision(store.data,storageKey,practiceMode));
const drafts=createEditDraft(config.id,draft=>{
  const section=config.sections.find(section=>section.id===draft.section);if(!section)throw new Error('分類を確認してください。');
  const original=store.data.sections[section.id].find(row=>row.id===draft.id);
  const same=original && JSON.stringify(original)===draft.base;
  if(draft.id && !same && !confirm('元の記録が変更または削除されています。新しい記録として下書きを再開しますか？'))return;
  openEditor(section,same?original:undefined,true);restoreDraftValues(form,draft.values);el('draft-save-status').textContent='下書きを復元しました。登録・保存で確定してください。';
},practiceMode,draft=>{
  const section=config.sections.find(section=>section.id===draft.section);if(!section)throw new Error('このツールの分類ではありません。');
  for(const field of section.fields)if(Object.hasOwn(draft.values,field.key)&&draft.values[field.key]!=='')readBusinessField(draft.values[field.key],{...field,required:false});
});
const sectionFor=(id=currentView)=>config.sections.find(section=>section.id===id);
function display(row:BusinessRecord,field:BusinessField){
  const value=businessValue(row,field.key);
  if(!field.reference)return value;
  const target=store.data.sections[field.reference].find(target=>target.id===value),section=sectionFor(field.reference)!;
  return target?businessValue(target,section.titleKey):'参照先なし';
}
function recordTitle(row:BusinessRecord,section:BusinessSection){const title=display(row,section.fields.find(field=>field.key===section.titleKey)!);return title.length>120?title.slice(0,120)+'…':title;}
function commit(next:BusinessData,replaceCorrupt=false){
  try{const data=parseBusiness(next,config);serializeBusiness(data);recovery.invalidate();store.replace(data,replaceCorrupt);render();return true;}
  catch(error){message(error instanceof Error?error.message:'保存できません。入力を確認してください。',true);return false;}
}
function rowState(row:BusinessRecord,section:BusinessSection){
  if(config.kind==='lending'){
    if(section.id==='loans')return loanStatus(row,today());
    if(section.id==='assets')return store.data.sections.loans.some(loan=>loan.assetId===row.id&&!loan.returnedAt)?'貸出中':'貸出可能';
  }
  if(config.kind==='inventory'&&section.id==='items')return inventoryQuantity(store.data,row.id)<Number(row.minimum)?'在庫不足':'在庫あり';
  return businessValue(row,'status')||businessValue(row,'kind');
}
function filteredRows(section:BusinessSection){
  const words=normalizeBusiness(el<HTMLInputElement>('query').value).split(/\s+/).filter(Boolean),state=el<HTMLSelectElement>('state-filter').value,parent=el<HTMLSelectElement>('parent-filter').value;
  const relation=section.fields.find(field=>field.reference);
  let rows=store.data.sections[section.id].filter(row=>{
    const text=normalizeBusiness(section.fields.map(field=>display(row,field)).join(' '));
    return words.every(word=>text.includes(word))&&(!state||rowState(row,section)===state)&&(!parent||!relation||row[relation.key]===parent);
  });
  if(config.kind==='calendar'){
    const range=calendarRange(el<HTMLInputElement>('calendar-date').value,el<HTMLSelectElement>('calendar-mode').value);
    rows=rows.filter(row=>String(row.date)>=range.start&&String(row.date)<=range.end).sort((a,b)=>(String(a.date)+String(a.time)).localeCompare(String(b.date)+String(b.time)));
  }
  return rows;
}
function stateOptions(section:BusinessSection){
  if(config.kind==='lending'&&section.id==='loans')return ['貸出中','延滞','返却済み'];
  if(config.kind==='lending'&&section.id==='assets')return ['貸出可能','貸出中'];
  if(config.kind==='inventory'&&section.id==='items')return ['在庫不足','在庫あり'];
  return section.fields.find(field=>field.key==='status'||field.key==='kind')?.options??[];
}
function setFilters(section:BusinessSection){
  const select=el<HTMLSelectElement>('state-filter');select.replaceChildren(new Option('すべて',''),...stateOptions(section).map(value=>new Option(value,value)));select.disabled=select.options.length===1;
  const relation=section.fields.find(field=>field.reference),parent=el<HTMLSelectElement>('parent-filter');parent.replaceChildren(new Option('すべて',''));
  el('parent-filter-label').hidden=!relation;
  if(relation){for(const row of store.data.sections[relation.reference!])parent.append(new Option(recordTitle(row,sectionFor(relation.reference!)!),row.id));parent.setAttribute('aria-label',relation.label+'で絞り込み');}
}
function card(row:BusinessRecord,section:BusinessSection,print=false){
  const root=node('article','','record-card');root.dataset.recordId=row.id;root.append(node('h3',recordTitle(row,section)));
  const state=rowState(row,section);if(state)root.append(node('p',state,'record-state'));
  if(config.kind==='inventory'&&section.id==='items')root.append(node('p','現在庫：'+inventoryQuantity(store.data,row.id)+' '+String(row.unit||''),'record-state'));
  const list=node('dl');for(const field of section.fields)list.append(node('dt',field.label),node('dd',display(row,field)||'未入力'));root.append(list);
  if(!print){
    const buttons=node('div','','record-actions');buttons.append(action('編集',()=>openEditor(section,row)));
    if(config.kind==='lending'&&section.id==='loans'&&!row.returnedAt)buttons.append(action('返却日を入力',()=>{if(!openEditor(section,row))return;el<HTMLInputElement>('field-returnedAt').value=today();el('field-returnedAt').dispatchEvent(new Event('input',{bubbles:true}));el('field-returnedAt').focus();}));
    const statusField=section.fields.find(field=>field.key==='status'&&field.options?.includes('完了'));
    if(statusField)buttons.append(action(row.status==='完了'?statusField.options![0]+'に戻す':'完了にする',()=>commit({...store.data,sections:{...store.data.sections,[section.id]:store.data.sections[section.id].map(item=>item.id===row.id?{...item,status:row.status==='完了'?statusField.options![0]:'完了'}:item)}})));
    buttons.append(action('削除',()=>{
      if(!confirm('「'+recordTitle(row,section)+'」を削除しますか？関連する記録がある場合は削除できません。'))return;
      const before=structuredClone(store.data);
      if(commit({...store.data,sections:{...store.data.sections,[section.id]:store.data.sections[section.id].filter(item=>item.id!==row.id)}})){recovery.remember('記録を削除しました',()=>commit(before));message('記録を削除しました。');el('add-record').focus();}
    },'danger'));root.append(buttons);
  }return root;
}
function renderCalendar(rows:BusinessRecord[],section:BusinessSection){
  const root=el('calendar-grid');root.replaceChildren();root.className='';const mode=el<HTMLSelectElement>('calendar-mode').value;if(config.kind!=='calendar'||mode==='list')return false;
  root.className='calendar-grid';const range=calendarRange(el<HTMLInputElement>('calendar-date').value,mode);root.append(node('h3',range.start+' 〜 '+range.end,'calendar-period'));
  const start=new Date(range.start+'T12:00:00Z'),end=new Date(range.end+'T12:00:00Z');
  if(mode==='month')for(let i=0;i<(start.getUTCDay()+6)%7;i++)root.append(node('div','','calendar-empty'));
  for(const date=new Date(start);date<=end;date.setUTCDate(date.getUTCDate()+1)){
    const key=date.toISOString().slice(0,10),day=node('section','','calendar-day');day.append(node('h3',key.slice(5)+'（'+'日月火水木金土'[date.getUTCDay()]+'）'));
    for(const row of rows.filter(row=>row.date===key))day.append(action((row.time?row.time+' ':'')+recordTitle(row,section),()=>openEditor(section,row)));
    root.append(day);
  }return true;
}
function renderRecords(){
  const section=sectionFor();if(!section)return;
  let rows:BusinessRecord[];try{rows=filteredRows(section);}catch(error){message(error instanceof Error?error.message:'表示条件を確認してください。',true);return;}
  el('section-title').textContent=section.label;el('calendar-controls').hidden=config.kind!=='calendar';el('csv-current').hidden=!config.csv;
  el('result-count').textContent=rows.length+'件表示 / 登録'+store.data.sections[section.id].length+'件';el('empty-state').hidden=rows.length>0;
  const grid=renderCalendar(rows,section),pages=Math.max(1,Math.ceil(rows.length/50));pageNumber=Math.min(pageNumber,pages);
  el('record-list').replaceChildren(...(grid?[]:rows.slice((pageNumber-1)*50,pageNumber*50).map(row=>card(row,section))));
  el('page-number').textContent=pageNumber+' / '+pages;el<HTMLButtonElement>('previous-page').disabled=pageNumber===1;el<HTMLButtonElement>('next-page').disabled=pageNumber===pages;
  el('page-number').parentElement!.hidden=grid;
}
function render(){
  el('summary').replaceChildren(...config.sections.map(section=>{
    const box=node('div','','summary-card');box.append(node('h3',section.label),node('p',store.data.sections[section.id].length+'件'),action('一覧を開く',()=>navigate(section.id)));return box;
  }));
  el<HTMLTextAreaElement>('memo').value=store.data.text;el('count').textContent=store.data.text.length+' / 50,000文字';renderRecords();
}
function navigate(view:string){
  if(!['home','data','help'].includes(view)&&!sectionFor(view))return;currentView=view;pageNumber=1;el<HTMLInputElement>('query').value='';
  const section=sectionFor();if(section)setFilters(section);
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==(section?'records':view);});
  document.querySelectorAll<HTMLElement>('#navigation [data-view]').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  el<HTMLButtonElement>('print-current').disabled=!section;render();el('main').focus();
}
function snapshot(){return JSON.stringify(draftFormValues(form));}
function openEditor(section:BusinessSection,row?:BusinessRecord,restoring=false){
  if(!drafts.start(section.id,row?.id??null,row?JSON.stringify(row):null,restoring))return false;
  editSection=section;editing=row;returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  el('edit-title').textContent=section.label+(row?'を編集':'に登録');el('submit-record').textContent=row?'変更を保存':'登録する';el('form-error').textContent='';el('draft-save-status').textContent='入力内容は下書きとして保存します。';
  const fields=el('edit-fields');fields.replaceChildren();
  for(const field of section.fields){
    const label=node('label',field.label,field.type==='textarea'?'wide':'');label.htmlFor='field-'+field.key;if(field.required)label.append(node('span','必須','required'));
    const input=field.type==='textarea'?node('textarea'):['select','reference'].includes(field.type??'')?node('select'):node('input');input.id='field-'+field.key;input.name=field.key;input.required=!!field.required;
    if(input instanceof HTMLSelectElement){
      if(field.reference){input.append(new Option('選択してください',''));for(const candidate of store.data.sections[field.reference])input.append(new Option(recordTitle(candidate,sectionFor(field.reference)!),candidate.id));}
      else for(const option of field.options??[])input.append(new Option(option,option));
    }else{input.maxLength=field.maxLength??(field.type==='textarea'?20000:500);if(input instanceof HTMLInputElement){input.type=['date','time','number'].includes(field.type??'')?field.type!:'text';if(field.type==='number'){input.min=String(field.min??0);input.max='1000000000';input.step='1';}}}
    input.value=row?businessValue(row,field.key):field.default??(field.type==='number'?'0':field.type==='select'?field.options![0]:field.type==='date'&&field.required?today():'');label.append(input);fields.append(label);
  }
  editorStart=snapshot();editor.showModal();fields.querySelector<HTMLElement>('input,textarea,select')?.focus();return true;
}
function closeEditor(force=false){
  if(!force&&snapshot()!==editorStart){if(!confirm('未確定の変更を破棄しますか？残す場合はキャンセルし、「下書きを残して閉じる」を使ってください。'))return;if(!drafts.clear())return;}
  editor.close();el('save-status').textContent=savedLabel;el('save-status').classList.toggle('unsaved',saveWarning);if(returnFocus?.isConnected)returnFocus.focus();else el('main').focus();
}
function download(text:string,extension:'json'|'csv'){
  const url=URL.createObjectURL(new Blob([text],{type:extension==='json'?'application/json;charset=utf-8':'text/csv;charset=utf-8'})),link=node('a');link.href=url;link.download=(practiceMode?'sample-':'')+config.id+(extension==='json'?'-backup-':'-')+today().replaceAll('-','')+'.'+extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  if(extension==='json')dispatchEvent(new Event('tool-backup-export'));message('ダウンロードを開始しました。保存先を確認してください。');
}
function print(all:boolean){
  const root=el('print-area');root.replaceChildren(node('h1',config.name));
  for(const section of all?config.sections:sectionFor()?[sectionFor()!]:[]){root.append(node('h2',section.label));const rows=all?store.data.sections[section.id]:filteredRows(section);root.append(node('p',rows.length+'件'));if(!rows.length)root.append(node('p','記録はありません。'));for(const row of rows)root.append(card(row,section,true));}
  if(all)root.append(node('h2','メモ'),node('p',store.data.text,'print-memo'));window.print();
}
trapDialogFocus(editor);trapDialogFocus(clearDialog);
for(const section of config.sections){const button=action(section.label,()=>navigate(section.id));button.dataset.view=section.id;el('section-navigation').append(button);}
document.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>{if(!sectionFor(button.dataset.view))button.addEventListener('click',()=>navigate(button.dataset.view!));});
el('description').textContent=config.description;el('tool-help').replaceChildren(...config.help.map(text=>node('p',text)));
el<HTMLInputElement>('calendar-date').value=today();
el('add-record').addEventListener('click',()=>{const section=sectionFor();if(section)openEditor(section);});
for(const id of ['close-edit','cancel-edit'])el(id).addEventListener('click',()=>closeEditor());editor.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
for(const event of ['input','change'])form.addEventListener(event,()=>{if(editor.open){const saved=drafts.save(draftFormValues(form));el('draft-save-status').textContent=saved?'下書きを保存しました。登録・保存で確定してください。':'下書きを保存できません。入力内容を控えるか、登録してJSONを書き出してください。';}});
el('suspend-edit').addEventListener('click',()=>{if(drafts.save(draftFormValues(form)))closeEditor(true);});
form.addEventListener('submit',event=>{
  event.preventDefault();const row={...editing,...draftFormValues(form),id:editing?.id??crypto.randomUUID()};
  const rows=store.data.sections[editSection.id];const next={...store.data,sections:{...store.data.sections,[editSection.id]:editing?rows.map(item=>item.id===editing!.id?row:item):[...rows,row]}};
  if(commit(next)){if(!store.dirty)drafts.clear();closeEditor(true);message(store.dirty?'登録しましたがブラウザ内は未保存です。JSONを書き出してください。':'登録・変更を保存しました。',store.dirty);}else el('form-error').textContent=el('feedback').textContent;
});
el('memo').addEventListener('input',()=>{const text=el<HTMLTextAreaElement>('memo').value;if(!commit({...store.data,text}))el<HTMLTextAreaElement>('memo').value=store.data.text;});
for(const id of ['query','state-filter','parent-filter','calendar-mode','calendar-date'])el(id).addEventListener(id==='query'?'input':'change',()=>{pageNumber=1;renderRecords();});
for(const [id,step] of [['previous-page',-1],['next-page',1]] as const)el(id).addEventListener('click',()=>{pageNumber+=step;renderRecords();});
for(const [id,step] of [['period-previous',-1],['period-next',1]] as const)el(id).addEventListener('click',()=>{
  const input=el<HTMLInputElement>('calendar-date');if(!input.value)return;const d=new Date(input.value+'T12:00:00Z'),mode=el<HTMLSelectElement>('calendar-mode').value;
  if(mode==='week')d.setUTCDate(d.getUTCDate()+step*7);else if(mode==='month'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step);}else d.setUTCFullYear(d.getUTCFullYear()+step);input.value=d.toISOString().slice(0,10);pageNumber=1;renderRecords();
});
el('csv-current').addEventListener('click',()=>{const section=sectionFor();if(section)download(businessCsv(filteredRows(section),section,display),'csv');});
el('print').addEventListener('click',()=>print(true));el('print-current').addEventListener('click',()=>print(false));
el('save-now').addEventListener('click',()=>{if(store.save())message('現在のデータを保存しました。');});
el('export').addEventListener('click',()=>{try{download(serializeBusiness({...store.data,...(practiceMode?{sampleData:true}:{})}),'json');}catch(error){message(error instanceof Error?error.message:'JSONを書き出せません。',true);}});
setupBackupPreparation();let importing=false;
el('import-file').addEventListener('change',async()=>{
  const input=el<HTMLInputElement>('import-file'),file=input.files?.[0];input.value='';if(!file||importing)return;importing=true;el<HTMLButtonElement>('import').disabled=true;
  try{
    if(!/\.json$/i.test(file.name)||!file.size||file.size>BUSINESS_MAX_BYTES)throw new Error('空ではない10MB以下のJSONファイルを選択してください。');
    if(file.type&&!['application/json','text/json','text/plain','application/octet-stream'].includes(file.type))throw new Error('JSONファイルとして認識できません。');
    const revision=recoveryRevision(store.data,storageKey,practiceMode),incoming=parseBusinessText(await file.text(),config);
    const counts=(data:BusinessData)=>Object.fromEntries([...config.sections.map(section=>[section.label,data.sections[section.id].length] as const),['メモ文字数',data.text.length]]);
    if(!confirm(backupComparison(config.name,file.name,counts(store.data),counts(incoming),incoming.exportedAt)))return;
    if(revision!==recoveryRevision(store.data,storageKey,practiceMode))throw new Error('読込み中にデータが変更されました。現在の内容を確認してから読み直してください。');
    if(commit(incoming,true))message(store.dirty?'読み込みましたがブラウザ内は未保存です。JSONを書き出してください。':'バックアップを読み込みました。',store.dirty);
  }catch(error){message(error instanceof Error?error.message:'読み込めません。元のJSONを確認してください。',true);}finally{importing=false;el<HTMLButtonElement>('import').disabled=false;}
});
el('clear').addEventListener('click',()=>{el<HTMLInputElement>('clear-confirm').value='';el<HTMLButtonElement>('confirm-clear').disabled=true;el('clear-error').textContent='';clearDialog.showModal();el('clear-confirm').focus();});
el('clear-confirm').addEventListener('input',()=>{el<HTMLButtonElement>('confirm-clear').disabled=el<HTMLInputElement>('clear-confirm').value!=='すべて削除';});el('cancel-clear').addEventListener('click',()=>clearDialog.close());
el('confirm-clear').addEventListener('click',()=>{if(el<HTMLInputElement>('clear-confirm').value!=='すべて削除')return;try{store.clear();recovery.invalidate();clearDialog.close();render();message('このバージョンの全データを削除しました。旧版の保存領域・下書き・書出したファイルは残ります。');}catch(error){el('clear-error').textContent=error instanceof Error?error.message:'削除できません。';}});
el('reload-data').addEventListener('click',()=>{if(!confirm('画面内の未保存データを破棄して保存済みデータを読み直しますか？必要な内容は先にJSONを書き出してください。'))return;recovery.invalidate();store.load();render();});
addEventListener('beforeunload',event=>{if(!practiceMode&&(store.dirty||editor.open&&snapshot()!==editorStart))event.preventDefault();});
store.load();if(practiceMode){store.replace(parseBusiness(sample,config));if(config.kind==='calendar'&&store.data.sections.events[0])el<HTMLInputElement>('calendar-date').value=String(store.data.sections.events[0].date);}navigate('home');
