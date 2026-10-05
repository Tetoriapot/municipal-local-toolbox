import test from 'node:test';
import assert from 'node:assert/strict';
import { freshData, parseHandover, parseHandoverText, serializeHandover, validateEntry, checkHandoverFile, completion, searchEntries, SECTIONS, MAX_RECORDS, HANDOVER_MAX_BYTES } from '../tools-src/handover-note/model.ts';
import { makeBackup } from '../tools-src/shared/backup.mjs';

function record(section, id = section.id) {
  return validateEntry({ id, title: '引継ぎのテスト', month: '4', extension: { retained: true } }, section);
}
test('handover legacy migration preserves text and every unknown key', () => {
  const legacy = { ...makeBackup('handover-note', '旧メモ'), extra: { value: 5 }, profile: 'legacy profile', sections: ['unknown'] };
  const data = parseHandover(legacy);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.text, '旧メモ');
  assert.deepEqual(data.extra, { value: 5 });
  assert.deepEqual(data.legacyBackup, legacy);
  assert.equal(completion(data).total, 0);
  assert.equal(legacy.profile, 'legacy profile');
});
test('handover round trip preserves all six sections and extension keys', () => {
  const data = freshData();
  data.profile.department = '試験市 総務課';
  data.profile.extra = ['保管'];
  data.extra = { version: 9 };
  data.sections.other = [{ future: 1 }];
  for (const section of SECTIONS) data.sections[section.id] = [record(section)];
  const result = parseHandoverText(serializeHandover(data, '2026-10-05T00:00:00Z'));
  assert.deepEqual(result, { ...data, exportedAt: '2026-10-05T00:00:00Z' });
  assert.deepEqual(result.sections.duties[0].extension, { retained: true });
});
test('handover rejects malformed and incompatible data without mutating it', () => {
  for (const invalid of [null, [], {}, { ...freshData(), toolId: 'equipment-manager' }, { ...freshData(), schemaVersion: 3 }, { ...freshData(), profile: [] }, { ...freshData(), sections: {} }, { ...freshData(), text: 0 }]) {
    const original = JSON.stringify(invalid);
    assert.throws(() => parseHandover(invalid));
    assert.equal(JSON.stringify(invalid), original);
  }
  assert.throws(() => parseHandoverText(''));
  assert.throws(() => parseHandoverText('{broken'));
  assert.equal(parseHandoverText('\uFEFF' + serializeHandover(freshData())).schemaVersion, 2);
});
test('record validation rejects whitespace titles, bad dates, types and duplicate ids', () => {
  assert.throws(() => validateEntry({ id: 'one', title: '　 ' }, SECTIONS[0]));
  assert.throws(() => validateEntry({ id: 'one', title: 'x', completed: 'false' }, SECTIONS[0]));
  assert.throws(() => validateEntry({ id: 'one', title: 'x', month: '13' }, SECTIONS[1]));
  assert.throws(() => validateEntry({ id: 'one', title: 'x', dueDate: '2025-02-29' }, SECTIONS[4]));
  assert.equal(validateEntry({ id: 'one', title: 'x', dueDate: '2024-02-29' }, SECTIONS[4]).dueDate, '2024-02-29');
  assert.throws(() => validateEntry({ id: 'one', title: 'x'.repeat(501) }, SECTIONS[0]));
  const data = freshData();
  data.sections.duties = [record(SECTIONS[0]), record(SECTIONS[0])];
  assert.throws(() => parseHandover(data), /重複/);
});
test('capacity and input-file validation accept boundaries and Japanese filenames', () => {
  const valid = { name: '引継ぎ バックアップ.JSON', size: HANDOVER_MAX_BYTES, type: '' };
  assert.doesNotThrow(() => checkHandoverFile(valid));
  for (const change of [{ size: 0 }, { size: HANDOVER_MAX_BYTES + 1 }, { name: 'backup.txt' }, { type: 'image/png' }]) assert.throws(() => checkHandoverFile({ ...valid, ...change }));
  const data = freshData();
  data.sections.duties = Array.from({ length: MAX_RECORDS }, (_, i) => record(SECTIONS[0], 'id-' + i));
  assert.equal(parseHandover(data).sections.duties.length, MAX_RECORDS);
  data.sections.checklist = [record(SECTIONS[5])];
  assert.throws(() => parseHandover(data), /3,000/);
});
test('completion counts all records, with no misleading 100% for empty data', () => {
  const data = freshData();
  assert.deepEqual(completion(data), { total: 0, done: 0, percent: 0 });
  data.sections.duties = [record(SECTIONS[0])];
  data.sections.checklist = [{ ...record(SECTIONS[5]), completed: true }];
  assert.deepEqual(completion(data), { total: 2, done: 1, percent: 50 });
});
test('full-text search includes fields in all sections, NFKC and multiple terms', () => {
  const data = freshData();
  data.sections.duties = [{ ...record(SECTIONS[0]), procedure: 'CSV帳票の出力' }];
  assert.equal(searchEntries(data, 'ｃｓｖ 出力').length, 1);
  assert.equal(searchEntries(data, '存在しない').length, 0);
  assert.equal(searchEntries(data, '.*').length, 0);
});
