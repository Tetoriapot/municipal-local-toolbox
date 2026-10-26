import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../tools-src/lending-manager/config.ts';
import inventory from '../tools-src/inventory-manager/config.ts';
import {emptyBusiness,parseBusiness,parseBusinessText,serializeBusiness,loanStatus,inventoryQuantity,calendarRange} from '../tools-src/business/model.ts';
import {readFileSync} from 'node:fs';
import calendar from '../tools-src/annual-calendar/config.ts';
import meeting from '../tools-src/meeting-minutes/config.ts';
import inquiry from '../tools-src/inquiry-log/config.ts';
import event from '../tools-src/event-manager/config.ts';
const source=()=>parseBusiness(JSON.parse(readFileSync('tools-src/lending-manager/sample.json','utf8')),config);
for(const definition of [config,inventory,calendar,meeting,inquiry,event])test(definition.id+' validates the schema, capacities and sample data without removing extensions',()=>{
  const sample=JSON.parse(readFileSync('tools-src/'+definition.id+'/sample.json','utf8'));
  sample.sections.future={retained:true};sample.extension={retained:true};
  const data=parseBusiness(sample,definition);assert.deepEqual(parseBusinessText('\uFEFF'+serializeBusiness(data),definition).sections,data.sections);
  assert.deepEqual(data.extension,{retained:true});assert.deepEqual(data.sections.future,{retained:true});
  for(const invalid of [null,[],{...sample,toolId:'wrong'},{...sample,schemaVersion:99},{...sample,text:'a'.repeat(50001)},{...sample,sections:{}}])assert.throws(()=>parseBusiness(invalid,definition));
  const section=definition.sections[0],row=data.sections[section.id][0];
  for(const id of ['', '<script>', 'a'.repeat(101)])assert.throws(()=>parseBusiness({...sample,sections:{...sample.sections,[section.id]:[{...row,id}]}},definition));
  assert.throws(()=>parseBusiness({...sample,sections:{...sample.sections,[section.id]:[row,row]}},definition));
  assert.throws(()=>parseBusiness({...sample,sections:{...sample.sections,[section.id]:Array(3001).fill(row)}},definition),/3,000/);
  const required=section.fields.find(field=>field.required&&field.type!=='date');assert.throws(()=>parseBusiness({...sample,sections:{...sample.sections,[section.id]:[{...row,[required.key]:'  '}]}},definition));
  assert.throws(()=>parseBusinessText('{invalid',definition),/JSON/);
  assert.throws(()=>parseBusinessText(' '.repeat(10*1024*1024+1),definition),/10MB/);
});
test('lending JSON preserves extension fields and legacy memo across round trips',()=>{
  const data=source();data.extra={kept:true};data.sections.assets[0].extra={kept:true};
  assert.deepEqual(parseBusinessText(serializeBusiness(data),config).sections,data.sections);
  assert.deepEqual(parseBusinessText(serializeBusiness(data),config).extra,{kept:true});
  const old={schemaVersion:1,toolId:config.id,text:'旧メモ',sections:{future:true},extra:'保持'};
  const migrated=parseBusiness(old,config);assert.equal(migrated.text,'旧メモ');assert.deepEqual(migrated.legacyBackup,old);assert.deepEqual(migrated.sections,emptyBusiness(config).sections);
});
test('calendar periods handle fiscal year, week and leap month boundaries',()=>{
  assert.deepEqual(calendarRange('2026-03-31','list'),{start:'2025-04-01',end:'2026-03-31'});
  assert.deepEqual(calendarRange('2026-04-01','list'),{start:'2026-04-01',end:'2027-03-31'});
  assert.deepEqual(calendarRange('2024-02-29','month'),{start:'2024-02-01',end:'2024-02-29'});
  assert.deepEqual(calendarRange('2026-11-01','week'),{start:'2026-10-26',end:'2026-11-01'});
  assert.throws(()=>calendarRange('2026-02-30','month'),/日付/);
});
test('inventory calculates movements and prevents negative historical balances and invalid quantities',()=>{
  const data=parseBusiness(JSON.parse(readFileSync('tools-src/inventory-manager/sample.json','utf8')),inventory);
  assert.equal(inventoryQuantity(data,'item-1'),2);assert.equal(inventoryQuantity(data,'item-2'),50);
  const first=data.sections.movements[0];
  for(const quantity of ['11','-1','1.5','1000000001'])assert.throws(()=>parseBusiness({...data,sections:{...data.sections,movements:[{...first,quantity}]}},inventory));
  const movements=[{...first,quantity:'11'},{...first,id:'later',date:'2026-10-02',direction:'入庫',quantity:'20'}];
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,movements}},inventory),/在庫が範囲外/);
});
test('lending refuses duplicate loans, missing references, bad dates and duplicate inventory numbers',()=>{
  const data=source();const loan=data.sections.loans[0];
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,loans:[loan,{...loan,id:'another'}]}},config),/重ねて/);
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,assets:[]}},config),/登録済み/);
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,loans:[{...loan,dueDate:'2026-02-30'}]}},config),/日付/);
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,loans:[{...loan,returnedAt:'2020-01-01'}]}},config),/貸出日以降/);
  assert.throws(()=>parseBusiness({...data,sections:{...data.sections,assets:[...data.sections.assets,{...data.sections.assets[0],id:'duplicate'}]}},config),/重複/);
  assert.equal(loanStatus(loan,'2026-10-26'),'延滞');assert.equal(loanStatus({...loan,returnedAt:'2026-10-26'},'2026-10-26'),'返却済み');
});
