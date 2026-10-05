import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentEmpty, parseEquipment, parseEquipmentText, serializeEquipment, validateEquipmentItem, checkEquipmentFile, selectEquipment, equipmentCsv, EQUIPMENT_MAX_BYTES, EQUIPMENT_MAX_ITEMS } from '../tools-src/equipment-manager/model.ts';
import { makeBackup } from '../tools-src/shared/backup.mjs';

function item(assetNumber = '001', extras = {}) { return validateEquipmentItem({ id: 'id-' + assetNumber, name: '備品', assetNumber, ...extras }); }

test('equipment JSON round trip preserves old memos and extension fields', () => {
  const legacy = { ...makeBackup('equipment-manager', '旧メモ'), custom: { retained: 1 }, items: { legacy: true } };
  const migrated = parseEquipment(legacy);
  assert.equal(migrated.text, legacy.text);
  assert.deepEqual(migrated.legacyBackup, legacy);
  const data = { ...migrated, items: [item('001', { category: '事務機器', location: '総務課', purchaseDate: '2024-02-29', status: 'repair', notes: '日本語\nメモ', extra: [1, 2] })] };
  assert.deepEqual(parseEquipmentText(serializeEquipment(data, '2026-10-05')), { ...data, exportedAt: '2026-10-05' });
  assert.deepEqual(legacy.items, { legacy: true });
});

test('equipment rejects whitespace, invalid types, missing lists and unsupported schemas', () => {
  for (const change of [{ name: '　' }, { assetNumber: ' ' }, { assetNumber: 'x'.repeat(101) }, { name: 1 }, { category: [] }, { purchaseDate: '2025-02-29' }, { status: 'broken' }, { status: null }, { notes: 'x'.repeat(20001) }]) assert.throws(() => item('001', change));
  for (const value of [null, [], {}, { ...equipmentEmpty(), schemaVersion: 3 }, { ...equipmentEmpty(), toolId: 'handover-note' }, { ...equipmentEmpty(), items: null }, { ...equipmentEmpty(), text: 1 }]) assert.throws(() => parseEquipment(value));
  assert.equal(item().status, 'unknown');
  assert.throws(() => parseEquipmentText('{broken'));
  assert.equal(parseEquipmentText('\uFEFF' + serializeEquipment(equipmentEmpty())).items.length, 0);
});

test('equipment refuses duplicate ids and normalized management numbers without changing input', () => {
  const a = item('Ａ０１', { id: 'one' }), b = item('a01 ', { id: 'two' });
  const data = { ...equipmentEmpty(), items: [a, b] }, before = structuredClone(data);
  assert.throws(() => parseEquipment(data), /管理番号/);
  assert.deepEqual(data, before);
  assert.throws(() => parseEquipment({ ...data, items: [a, { ...b, id: a.id, assetNumber: 'other' }] }), /備品ID/);
});

test('equipment limits accept 3000 records and reject excess or unexportable documents', () => {
  const data = { ...equipmentEmpty(), items: Array.from({ length: EQUIPMENT_MAX_ITEMS }, (_, i) => item(String(i))) };
  assert.equal(parseEquipment(data).items.length, EQUIPMENT_MAX_ITEMS);
  assert.throws(() => parseEquipment({ ...data, items: [...data.items, item('extra')] }), /3,000/);
  assert.throws(() => serializeEquipment({ ...equipmentEmpty(), extra: 'あ'.repeat(EQUIPMENT_MAX_BYTES / 3) }), /10MB/);
  const raw = JSON.stringify({ ...equipmentEmpty(), extra: Array.from({ length: 1700000 }, () => 0) });
  assert.ok(Buffer.byteLength(raw) < EQUIPMENT_MAX_BYTES);
  assert.throws(() => parseEquipmentText(raw), /10MB/);
});

test('equipment file validation accepts Japanese names and rejects invalid input', () => {
  const valid = { name: '備品 台帳.JSON', size: EQUIPMENT_MAX_BYTES, type: '' };
  assert.doesNotThrow(() => checkEquipmentFile(valid));
  for (const change of [{ name: 'test.csv' }, { type: 'image/png' }, { size: 0 }, { size: EQUIPMENT_MAX_BYTES + 1 }]) assert.throws(() => checkEquipmentFile({ ...valid, ...change }));
});

test('equipment search, filters and date sorting preserve the original item order', () => {
  const items = [
    item('A10', { category: '機器', location: '倉庫', purchaseDate: '', status: 'stored' }),
    item('A2', { category: '機器', location: '総務課', purchaseDate: '2026-04-01', notes: 'ＣＳＶ 出力', status: 'in-use' }),
    item('A1', { category: '家具', location: '総務課', purchaseDate: '2020-01-01', status: 'disposed' }),
  ];
  const defaults = { query: '', category: '', location: '', status: '', sort: 'number' };
  assert.deepEqual(selectEquipment(items, defaults).map(item => item.assetNumber), ['A1', 'A2', 'A10']);
  assert.deepEqual(selectEquipment(items, { ...defaults, sort: 'date-desc' }).map(item => item.assetNumber), ['A2', 'A1', 'A10']);
  assert.equal(selectEquipment(items, { ...defaults, query: 'csv 出力', category: '機器', location: '総務課', status: 'in-use' }).length, 1);
  assert.equal(selectEquipment(items, { ...defaults, query: '廃棄済み' })[0].assetNumber, 'A1');
  assert.equal(selectEquipment(items, { ...defaults, query: '.*' }).length, 0);
  assert.deepEqual(items.map(item => item.assetNumber), ['A10', 'A2', 'A1']);
});

test('equipment CSV has a BOM, quotes newlines and commas, preserves zeros and neutralizes formulas', () => {
  const rows = [item('0001', { name: '机,"日本語"', notes: '1行目\n2行目', location: ' \t=1+1', category: '@SUM(A1:A2)' })];
  const csv = equipmentCsv(rows);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('"0001","机,""日本語"""'));
  assert.ok(csv.includes('"1行目\n2行目"'));
  assert.ok(csv.includes('"' + "' \t=1+1" + '"'));
  assert.ok(csv.includes('"' + "'@SUM(A1:A2)" + '"'));
  assert.equal(rows[0].location, ' \t=1+1');
  assert.ok(equipmentCsv([]).includes('"管理番号","備品名"'));
  for (const value of ['=1+1', '+1', '-1', '@SUM()', '\ttext', '\ntext', '\u200B=1', '\u0000=1']) assert.ok(equipmentCsv([item('1', { name: value })]).includes('"' + "'" + value + '"'));
});
