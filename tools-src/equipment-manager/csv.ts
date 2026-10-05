import { EQUIPMENT_FIELDS, EQUIPMENT_STATUSES, EQUIPMENT_MAX_BYTES, EQUIPMENT_MAX_ITEMS, normalizeEquipmentText, validateEquipmentItem, parseEquipment, serializeEquipment } from './model.ts';
import type { EquipmentData, EquipmentItem } from './model.ts';

export function checkEquipmentCsvFile(file: { name:string; type:string; size:number }) {
  if (!/\.csv$/i.test(file.name)) throw new Error('拡張子が.csvのファイルを選択してください。');
  if (!file.size) throw new Error('CSVファイルが空です。');
  if (file.size > EQUIPMENT_MAX_BYTES) throw new Error('10MB以下のCSVを選択してください。');
  if (file.type && !['text/csv','application/csv','text/plain','application/vnd.ms-excel','application/octet-stream'].includes(file.type)) throw new Error('CSVとして認識できないファイル形式です。');
}
export function decodeEquipmentCsv(bytes: Uint8Array, encoding = 'auto') {
  if (bytes.byteLength > EQUIPMENT_MAX_BYTES) throw new Error('10MB以下のCSVを選択してください。');
  let code = encoding;
  if (code === 'auto') code = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  if (!['utf-8','shift_jis','utf-16le','utf-16be'].includes(code)) throw new Error('文字コードを選び直してください。');
  try {
    const text = new TextDecoder(code,{ fatal:true }).decode(bytes).replace(/^\uFEFF/,'');
    if (text.includes('\u0000')) throw new Error('binary');
    return text;
  } catch { throw new Error('選択した文字コードでCSVを読めません。文字コードを選び直すか、元の表からCSVを書き出し直してください。'); }
}
export function parseEquipmentCsv(text: string) {
  if (new TextEncoder().encode(text).length > EQUIPMENT_MAX_BYTES) throw new Error('読み込んだCSVが10MBを超えています。');
  text = text.replace(/^\uFEFF/,'');
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  function pushCell() { row.push(cell); cell = ''; closed = false; if (row.length > 100) throw new Error('CSVは100列以内にしてください。'); }
  function pushRow() { pushCell(); if (row.some(value => value !== '')) rows.push(row); row = []; if (rows.length > EQUIPMENT_MAX_ITEMS + 1) throw new Error('CSVは見出しを除き3,000件以内にしてください。'); }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === ',') pushCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index++; pushRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error('CSVの引用符が正しくありません。元の表からCSVを書き出し直してください。'); cell += char; }
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error('見出し行と1件以上の備品データが必要です。');
  const [headers,...records] = rows;
  if (headers.every(value => !value.trim())) throw new Error('CSVの見出しがありません。');
  return { headers, records };
}
export function defaultCsvMapping(headers: string[]) {
  return Object.fromEntries(EQUIPMENT_FIELDS.map(field => [field.key, headers.findIndex(header => [field.label,field.key].some(label => normalizeEquipmentText(label) === normalizeEquipmentText(header)))]));
}
export function prepareEquipmentCsv(parsed: ReturnType<typeof parseEquipmentCsv>, mapping: Record<string,number>, data: EquipmentData, restoreFormulaPrefix = false) {
  const errors: string[] = [], items: EquipmentItem[] = [];
  const columns = Object.values(mapping).filter(column => column >= 0);
  if (new Set(columns).size !== columns.length) errors.push('同じCSV列を複数の項目に割り当てないでください。');
  for (const field of EQUIPMENT_FIELDS) {
    if (field.required && (!Number.isInteger(mapping[field.key]) || mapping[field.key] < 0)) errors.push(field.label + 'の列を選んでください。');
    if (!Number.isInteger(mapping[field.key]) || mapping[field.key] < -1 || mapping[field.key] >= parsed.headers.length) errors.push(field.label + 'の列指定が正しくありません。');
  }
  if (errors.length) return { items,errors };
  const numbers = new Set(data.items.map(item => normalizeEquipmentText(item.assetNumber)));
  parsed.records.forEach((row,index) => {
    try {
      if (row.length !== parsed.headers.length) throw new Error('見出しと列数が一致しません。');
      const values: Record<string,string> = {};
      for (const field of EQUIPMENT_FIELDS) {
        let value = mapping[field.key] < 0 ? '' : row[mapping[field.key]];
        if (restoreFormulaPrefix && /^'[\s\u0000-\u001F\u007F-\u009F\u200B\uFEFF]*[=+\-@]/u.test(value)) value = value.slice(1);
        else if (restoreFormulaPrefix && /^'[\t\r\n]/.test(value)) value = value.slice(1);
        values[field.key] = value;
      }
      const status = values.status.trim();
      values.status = status ? EQUIPMENT_STATUSES.find(value => value.id === status || value.label === status)?.id ?? status : 'unknown';
      const date = values.purchaseDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (date) values.purchaseDate = date[1] + '-' + date[2].padStart(2,'0') + '-' + date[3].padStart(2,'0');
      const item = validateEquipmentItem({ ...values,id:crypto.randomUUID() });
      const number = normalizeEquipmentText(item.assetNumber);
      if (numbers.has(number)) throw new Error('管理番号「' + item.assetNumber + '」が既存の備品またはCSV内で重複しています。');
      numbers.add(number); items.push(item);
    } catch (error) { errors.push((index + 1) + '件目：' + (error instanceof Error ? error.message : '内容を確認してください。')); }
  });
  if (!errors.length) {
    try { serializeEquipment(parseEquipment({ ...data,items:[...data.items,...items] })); }
    catch (error) { errors.push(error instanceof Error ? error.message : '台帳の上限を確認してください。'); }
  }
  return { items,errors };
}
