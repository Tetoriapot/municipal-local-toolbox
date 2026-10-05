import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { equipmentEmpty, validateEquipmentItem, equipmentCsv, EQUIPMENT_MAX_BYTES } from '../tools-src/equipment-manager/model.ts';
import { checkEquipmentCsvFile, decodeEquipmentCsv, parseEquipmentCsv, defaultCsvMapping, prepareEquipmentCsv } from '../tools-src/equipment-manager/csv.ts';

function prepare(text, data = equipmentEmpty(), restore = false) { const parsed = parseEquipmentCsv(text); return prepareEquipmentCsv(parsed,defaultCsvMapping(parsed.headers),data,restore); }

test('CSV export/import preserves leading zero, Japanese, quotes, multiline and optional formula restoration', () => {
  const item = validateEquipmentItem({ id:'original',assetNumber:'0007',name:'備品,「確認」',notes:'=SUM(A1)\n"説明"',status:'repair',purchaseDate:'2024-02-29' });
  const output = equipmentCsv([item]);
  assert.equal(prepare(output).items[0].notes,"'" + item.notes);
  const result = prepare(output,equipmentEmpty(),true); assert.deepEqual(result.errors,[]);
  const {id,...actual} = result.items[0]; const {id:original,...expected} = item;
  assert.notEqual(id,original); assert.deepEqual(actual,expected);
});

test('CSV decoding handles UTF-8 BOM, UTF-16 and Shift_JIS while rejecting bad bytes', () => {
  const source = '管理番号,備品名\r\n001,机';
  for (const bytes of [Buffer.from('\uFEFF'+source),Buffer.from('\uFEFF'+source,'utf16le')]) assert.equal(decodeEquipmentCsv(bytes),source);
  assert.equal(decodeEquipmentCsv(Uint8Array.from([0x94,0xf5,0x95,0x69]),'shift_jis'),'備品');
  assert.throws(() => decodeEquipmentCsv(Uint8Array.from([0x94,0xf5])),/文字コード/);
  assert.throws(() => decodeEquipmentCsv(Uint8Array.from([0])),/文字コード/);
});

test('CSV file, malformed quoting, column and row capacity validation', () => {
  const valid = {name:'日本語 台帳.CSV',type:'text/csv',size:20}; checkEquipmentCsvFile(valid);
  for (const change of [{size:0},{size:EQUIPMENT_MAX_BYTES+1},{name:'bad.json'},{type:'image/png'}]) assert.throws(() => checkEquipmentCsvFile({...valid,...change}));
  for (const source of ['', '管理番号,備品名', 'a,b\n"unterminated,x', 'a,b\n"closed"bad,x', 'a,b\nx"bad,x',Array(101).fill('列').join(',')+'\na,b', 'a,b\n' + 'x,y\n'.repeat(3001)]) assert.throws(() => parseEquipmentCsv(source));
  assert.equal(prepare('管理番号,備品名\n1,机,extra').errors.length,1);
});

test('CSV maps columns, dates and statuses and preserves all existing fields', () => {
  const data = {...equipmentEmpty(),text:'保持',extension:{a:1},items:[validateEquipmentItem({id:'old',assetNumber:'0001',name:'旧備品',extra:['保持']})]};
  const before = structuredClone(data);
  const parsed = parseEquipmentCsv('品名,番号,日付,状態\n新備品,0002,2024/2/29,保管中');
  const map = {...defaultCsvMapping(parsed.headers),assetNumber:1,name:0,purchaseDate:2};
  const result = prepareEquipmentCsv(parsed,map,data); assert.deepEqual(result.errors,[]);
  assert.equal(result.items[0].purchaseDate,'2024-02-29'); assert.equal(result.items[0].status,'stored'); assert.deepEqual(data,before);
  assert.ok(prepareEquipmentCsv(parsed,{...map,name:1},data).errors.length);
  assert.ok(prepareEquipmentCsv(parsed,{...map,name:-1},data).errors.length);
});

test('CSV duplicate management numbers, invalid rows and combined limits block import', () => {
  assert.match(prepare('管理番号,備品名\nＡ０１,机\na01,椅子').errors.join(),/重複/);
  const old = validateEquipmentItem({id:'old',assetNumber:'01',name:'旧備品'});
  const data = {...equipmentEmpty(),items:[old]};
  assert.match(prepare('管理番号,備品名\n01,追加',data).errors.join(),/既存/);
  assert.ok(prepare('管理番号,備品名,購入日,状態\n02,机,2025/2/29,不明な状態').errors.length);
  const full = {...equipmentEmpty(),items:Array.from({length:3000},(_,i)=>({...old,id:'id'+i,assetNumber:String(i)}))};
  assert.match(prepare('管理番号,備品名\n追加,机',full).errors.join(),/3,000/);
});
