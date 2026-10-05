export const MAX_TEXT_LENGTH = 50000;
export const MAX_FILE_BYTES = 1024 * 1024;

export function validateBackup(data, toolId) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schemaVersion !== 1 || data.toolId !== toolId || typeof data.text !== 'string' || data.text.length > MAX_TEXT_LENGTH) {
    throw new Error('同じツールの有効なバックアップを選択してください。メモは50,000文字までです。');
  }
  return data.text;
}

export function makeBackup(toolId, text, exportedAt = new Date().toISOString(), original = {}) {
  return { ...original, schemaVersion: 1, toolId, exportedAt, text };
}

export function serializeBackup(data) {
  const text = JSON.stringify(data, null, 2);
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    throw new Error('バックアップが1MBを超えるため反映できません。必要な内容を書き出し、メモを短くしてください。');
  }
  return text;
}
