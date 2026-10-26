import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentEmpty, validateEquipmentItem, selectEquipment, parseEquipment } from '../tools-src/equipment-manager/model.ts';
import { parseEquipmentCsv, defaultCsvMapping, prepareEquipmentCsv } from '../tools-src/equipment-manager/csv.ts';
import { sortByDueDate } from '../tools-src/handover-note/model.ts';
import { parseEditDraft, validateDraftFields } from '../tools-src/shared/drafts.ts';

test('CSV updates preserve IDs, unmapped values, extensions and rows absent from CSV', () => {
  const original = {...equipmentEmpty(),extra:{kept:true},items:[validateEquipmentItem({id:'one',assetNumber:'Ab-001',name:'机',location:'総務課',notes:'保持',extra:{kept:true}}),validateEquipmentItem({id:'two',assetNumber:'002',name:'椅子'})]};
  const snapshot=JSON.stringify(original);
  const parsed=parseEquipmentCsv('管理番号,備品名,設置場所\nａｂ-００１,新しい机,\n003,追加備品,倉庫');
  const result=prepareEquipmentCsv(parsed,defaultCsvMapping(parsed.headers),original,false,'upsert');
  assert.deepEqual(result.errors,[]); assert.deepEqual(result.changes.map(row=>row.kind),['更新','追加']);
  assert.equal(result.nextItems[0].id,'one'); assert.equal(result.nextItems[0].assetNumber,'Ab-001');
  assert.equal(result.nextItems[0].location,''); assert.equal(result.nextItems[0].notes,'保持');
  assert.deepEqual(result.nextItems[0].extra,{kept:true}); assert.deepEqual(result.nextItems[1],original.items[1]);
  assert.equal(JSON.stringify(original),snapshot);
});
test('CSV update detects unchanged records, duplicate source rows and formula-protected identifiers', () => {
  const original={...equipmentEmpty(),items:[validateEquipmentItem({id:'one',assetNumber:'=001',name:'机',notes:"'=保持"})]};
  const parse = text => { const parsed=parseEquipmentCsv(text); return prepareEquipmentCsv(parsed,defaultCsvMapping(parsed.headers),original,true,'upsert'); };
  const unchanged=parse("管理番号,備品名\n'=001,机"); assert.deepEqual(unchanged.errors,[]); assert.equal(unchanged.changes[0].kind,'変更なし'); assert.equal(unchanged.nextItems[0].notes,"'=保持");
  assert.match(parse("管理番号,備品名\n'=001,机\n'=001,別名").errors.join(''),/重複/);
  assert.match(parse('管理番号,備品名\n009,').errors.join(''),/備品名/);
});
test('stocktake fields accept old JSON, reject invalid dates and filter the chosen year', () => {
  const data=parseEquipment({...equipmentEmpty(),items:[{id:'one',assetNumber:'001',name:'旧版'},{id:'two',assetNumber:'002',name:'確認済み',checkedAt:'2026-10-26',checkedBy:'担当者',checkNotes:'差異なし'}]});
  assert.equal(data.items[0].checkedAt,'');
  const filter={query:'',category:'',location:'',status:'',sort:'number',checked:'pending',checkYear:'2026'};
  assert.deepEqual(selectEquipment(data.items,filter).map(item=>item.id),['one']);
  assert.equal(selectEquipment(data.items,{...filter,checkYear:'2027'}).length,2);
  assert.throws(()=>validateEquipmentItem({...data.items[0],checkedAt:'2026-02-30'}),/日付/);
});
test('deadline sort leaves source ordering intact and places absent deadlines last', () => {
  const rows=[{id:'a',title:'未定',dueDate:''},{id:'b',title:'先',dueDate:'2026-11-01'},{id:'c',title:'後',dueDate:'2026-12-01'}];
  assert.deepEqual(sortByDueDate(rows).map(row=>row.id),['b','c','a']); assert.equal(rows[0].id,'a');
});
test('draft import accepts unfinished required text while rejecting foreign tools and invalid field types', () => {
  const raw={schemaVersion:1,toolId:'handover-note',section:'notes',id:null,base:null,values:{title:'',dueDate:'2026-10-26'},updatedAt:'2026-10-26T00:00:00Z',extension:{kept:true}};
  const draft=parseEditDraft(JSON.stringify(raw),'handover-note');
  assert.deepEqual(draft.extension,raw.extension);
  validateDraftFields(draft,[{key:'title',label:'件名',required:true},{key:'dueDate',label:'期限',type:'date'}]);
  assert.throws(()=>parseEditDraft(JSON.stringify(raw),'equipment-manager'));
  assert.throws(()=>validateDraftFields({...draft,values:{title:true}},[{key:'title',label:'件名'}]));
});
