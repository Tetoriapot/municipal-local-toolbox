import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, makeBackup, serializeBackup, MAX_TEXT_LENGTH, MAX_FILE_BYTES } from '../tools-src/shared/backup.mjs';

test('backup round trip preserves multiline text and HTML as plain data', () => {
  const text = '引継ぎ\n<img src=x onerror=alert(1)>\n日本語・絵文字📁';
  const data = makeBackup('handover-note', text, '2026-10-05T00:00:00.000Z');
  assert.equal(validateBackup(JSON.parse(JSON.stringify(data)), 'handover-note'), text);
});
test('foreign tool, invalid schema and invalid types are rejected', () => {
  const valid = makeBackup('handover-note', 'test');
  for (const data of [null, [], {}, { ...valid, toolId: 'other' }, { ...valid, schemaVersion: 2 }, { ...valid, text: 1 }, { ...valid, text: 'a'.repeat(MAX_TEXT_LENGTH + 1) }]) {
    assert.throws(() => validateBackup(data, 'handover-note'));
  }
});
test('empty and maximum length backups are accepted', () => {
  assert.equal(validateBackup(makeBackup('a', ''), 'a'), '');
  assert.equal(validateBackup(makeBackup('a', 'a'.repeat(MAX_TEXT_LENGTH)), 'a').length, MAX_TEXT_LENGTH);
});
test('preview backups retain unknown fields when saved again', () => {
  const source = { ...makeBackup('a', 'original'), custom: { keep: true } };
  assert.deepEqual(makeBackup('a', 'edited', '2026-10-05', source).custom, { keep: true });
});

test('preview export remains within the import byte limit including extension fields', () => {
  const data = makeBackup('equipment-manager', '日本語', '2026-10-05', { future: { retained: true } });
  assert.deepEqual(JSON.parse(serializeBackup(data)), data);
  assert.throws(() => serializeBackup({ ...data, padding: 'a'.repeat(MAX_FILE_BYTES) }), /1MB/);
});
