import { validateBackup, MAX_TEXT_LENGTH } from '../shared/backup.mjs';
import { isObject, readField } from '../shared/fields.ts';
import type { Field } from '../shared/fields.ts';

export const EQUIPMENT_ID = 'equipment-manager';
export const EQUIPMENT_KEY = 'municipal-toolbox:data:v2:equipment-manager';
export const EQUIPMENT_LEGACY_KEY = 'municipal-toolbox:preview:v1:equipment-manager';
export const EQUIPMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EQUIPMENT_MAX_ITEMS = 3000;
export const EQUIPMENT_STATUSES = [
  { id: 'in-use', label: '使用中' }, { id: 'stored', label: '保管中' },
  { id: 'repair', label: '修理中' }, { id: 'disposed', label: '廃棄済み' },
  { id: 'unknown', label: '未確認' },
] as const;
export const EQUIPMENT_FIELDS: Field[] = [
  { key: 'assetNumber', label: '管理番号', required: true, maxLength: 100 },
  { key: 'name', label: '備品名', required: true },
  { key: 'category', label: 'カテゴリ' },
  { key: 'location', label: '設置場所' },
  { key: 'purchaseDate', label: '購入日', type: 'date' },
  { key: 'status', label: '状態', type: 'select', options: EQUIPMENT_STATUSES.map(status => status.id) },
  { key: 'notes', label: '備考', type: 'textarea' },
];
export interface EquipmentItem extends Record<string, unknown> {
  id: string; assetNumber: string; name: string; category: string; location: string;
  purchaseDate: string; status: string; notes: string;
}
export interface EquipmentData extends Record<string, unknown> {
  schemaVersion: 2; toolId: 'equipment-manager'; text: string; items: EquipmentItem[];
}
export interface EquipmentFilter { query: string; category: string; location: string; status: string; sort: string; }
export function equipmentEmpty(): EquipmentData {
  return { schemaVersion: 2, toolId: EQUIPMENT_ID, text: '', items: [] };
}
export function normalizeEquipmentText(value: string) { return value.normalize('NFKC').trim().toLocaleLowerCase('ja'); }
export function equipmentStatusLabel(value: string) { return EQUIPMENT_STATUSES.find(status => status.id === value)?.label ?? '未確認'; }
export function validateEquipmentItem(value: unknown): EquipmentItem {
  if (!isObject(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw new Error('備品IDが正しくありません。');
  const result: Record<string, unknown> = { ...value, status: value.status === undefined ? 'unknown' : value.status };
  for (const field of EQUIPMENT_FIELDS) result[field.key] = readField(result[field.key], field);
  return result as EquipmentItem;
}
export function parseEquipment(value: unknown): EquipmentData {
  if (!isObject(value) || value.toolId !== EQUIPMENT_ID) throw new Error('備品管理台帳のJSONバックアップを選択してください。');
  if (value.schemaVersion === 1) return { ...value, ...equipmentEmpty(), text: validateBackup(value, EQUIPMENT_ID), legacyBackup: structuredClone(value) };
  if (value.schemaVersion !== 2) throw new Error('対応していない保存形式です。対応するバージョンのツールを使用してください。');
  if (typeof value.text !== 'string' || value.text.length > MAX_TEXT_LENGTH) throw new Error('メモは50,000文字以内の文字列にしてください。');
  if (!Array.isArray(value.items)) throw new Error('備品一覧がありません。元のバックアップを選択してください。');
  if (value.items.length > EQUIPMENT_MAX_ITEMS) throw new Error('備品は3,000件まで読み込めます。');
  const ids = new Set<string>(), numbers = new Set<string>();
  const items = value.items.map(item => {
    const parsed = validateEquipmentItem(item);
    const number = normalizeEquipmentText(parsed.assetNumber);
    if (ids.has(parsed.id)) throw new Error('備品IDが重複しています。');
    if (numbers.has(number)) throw new Error('管理番号「' + parsed.assetNumber + '」が重複しています。管理番号を確認してください。');
    ids.add(parsed.id); numbers.add(number);
    return parsed;
  });
  return { ...value, schemaVersion: 2, toolId: EQUIPMENT_ID, text: value.text, items };
}
export function serializeEquipment(data: EquipmentData, date = new Date().toISOString()) {
  const raw = JSON.stringify({ ...data, exportedAt: date }, null, 2);
  if (new TextEncoder().encode(raw).length > EQUIPMENT_MAX_BYTES) throw new Error('データが10MBを超えています。現在のデータは変更していません。');
  return raw;
}
export function parseEquipmentText(raw: string) {
  if (new TextEncoder().encode(raw).length > EQUIPMENT_MAX_BYTES) throw new Error('10MB以下のJSONファイルを選択してください。');
  try {
    const data = parseEquipment(JSON.parse(raw.replace(/^\uFEFF/, '')));
    serializeEquipment(data);
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('JSONの形式が正しくありません。元のバックアップを選択してください。');
    throw error;
  }
}
export function checkEquipmentFile(file: { name: string; type: string; size: number }) {
  if (!/\.json$/i.test(file.name)) throw new Error('拡張子が.jsonのバックアップを選択してください。');
  if (!file.size) throw new Error('ファイルが空です。内容のあるJSONを選択してください。');
  if (file.size > EQUIPMENT_MAX_BYTES) throw new Error('10MB以下のJSONファイルを選択してください。');
  if (file.type && !['application/json', 'text/json', 'text/plain', 'application/octet-stream'].includes(file.type)) throw new Error('JSONファイルとして認識できません。元のバックアップを選択してください。');
}
export function selectEquipment(items: EquipmentItem[], filter: EquipmentFilter) {
  const words = normalizeEquipmentText(filter.query).split(/\s+/).filter(Boolean);
  const rows = items.filter(item => {
    const text = normalizeEquipmentText(EQUIPMENT_FIELDS.map(field => field.key === 'status' ? equipmentStatusLabel(item.status) : String(item[field.key] ?? '')).join(' '));
    return words.every(word => text.includes(word)) && (!filter.category || item.category === filter.category) && (!filter.location || item.location === filter.location) && (!filter.status || item.status === filter.status);
  });
  const key = filter.sort === 'name' ? 'name' : filter.sort.startsWith('date-') ? 'purchaseDate' : 'assetNumber';
  return rows.sort((a, b) => {
    if (key === 'purchaseDate' && (!a.purchaseDate || !b.purchaseDate)) return a.purchaseDate ? -1 : b.purchaseDate ? 1 : a.assetNumber.localeCompare(b.assetNumber, 'ja', { numeric: true });
    const order = a[key].localeCompare(b[key], 'ja', { numeric: true });
    return (filter.sort === 'date-desc' ? -order : order) || a.assetNumber.localeCompare(b.assetNumber, 'ja', { numeric: true }) || a.id.localeCompare(b.id);
  });
}
export function equipmentCsv(items: EquipmentItem[]) {
  function cell(value: string) {
    // Quoting alone does not prevent spreadsheet applications from executing a formula.
    const safe = /^[\s\u0000-\u001F\u007F-\u009F\u200B\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }
  const lines = [EQUIPMENT_FIELDS.map(field => cell(field.label)).join(',')];
  for (const item of items) lines.push(EQUIPMENT_FIELDS.map(field => cell(field.key === 'status' ? equipmentStatusLabel(item.status) : String(item[field.key] ?? ''))).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
