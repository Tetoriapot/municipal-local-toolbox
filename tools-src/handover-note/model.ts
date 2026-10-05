import { isObject, textValue, readField } from '../shared/fields.ts';
import type { Field } from '../shared/fields.ts';
export { textValue, validDate, readField } from '../shared/fields.ts';
export type { Field } from '../shared/fields.ts';
import { validateBackup, MAX_TEXT_LENGTH } from '../shared/backup.mjs';

export type SectionId = 'duties' | 'schedule' | 'contacts' | 'files' | 'notes' | 'checklist';
export interface Section {
  id: SectionId;
  label: string;
  description: string;
  fields: Field[];
}
export interface Entry extends Record<string, unknown> {
  id: string;
  title: string;
  completed: boolean;
}
export interface Profile extends Record<string, unknown> {
  department: string;
  predecessor: string;
  successor: string;
  handoverDate: string;
}
export interface HandoverData extends Record<string, unknown> {
  schemaVersion: 2;
  toolId: 'handover-note';
  text: string;
  profile: Profile;
  sections: Record<SectionId, Entry[]> & Record<string, unknown>;
}

export const HANDOVER_ID = 'handover-note';
export const HANDOVER_KEY = 'municipal-toolbox:data:v2:handover-note';
export const LEGACY_KEY = 'municipal-toolbox:preview:v1:handover-note';
export const HANDOVER_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS = 3000;
export const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map(String);
export const PROFILE_FIELDS: Field[] = [
  { key: 'department', label: '自治体・部署名' },
  { key: 'predecessor', label: '前任者' },
  { key: 'successor', label: '後任者' },
  { key: 'handoverDate', label: '引継ぎ日', type: 'date' },
];
export const SECTIONS: Section[] = [
  { id: 'duties', label: '担当業務', description: '業務内容、手順、頻度、期限、連絡先を登録します。', fields: [
    { key: 'title', label: '業務名', required: true },
    { key: 'overview', label: '業務の概要', type: 'textarea' },
    { key: 'procedure', label: '作業手順', type: 'textarea' },
    { key: 'frequency', label: '実施頻度' },
    { key: 'deadline', label: '期限・実施時期' },
    { key: 'owner', label: '担当者' },
    { key: 'contact', label: '関係者・連絡先' },
    { key: 'location', label: '資料の保存場所', type: 'textarea' },
    { key: 'remarks', label: '注意点', type: 'textarea' },
  ] },
  { id: 'schedule', label: '年間予定', description: '毎年の業務を月ごとに整理します。予定のない月も確認できます。', fields: [
    { key: 'title', label: '予定名', required: true },
    { key: 'month', label: '実施月', type: 'select', options: MONTHS, required: true },
    { key: 'timing', label: '実施時期・締切' },
    { key: 'owner', label: '担当者' },
    { key: 'details', label: '内容・準備するもの', type: 'textarea' },
  ] },
  { id: 'contacts', label: '関係者', description: '関係する部署・団体の担当者、連絡先、連絡時の注意点を登録します。', fields: [
    { key: 'title', label: '氏名・窓口名', required: true },
    { key: 'organization', label: '所属・団体名' },
    { key: 'role', label: '担当・関係する業務' },
    { key: 'phone', label: '電話・内線' },
    { key: 'email', label: 'メールアドレス' },
    { key: 'remarks', label: '連絡時の注意点', type: 'textarea' },
  ] },
  { id: 'files', label: '資料の保存場所', description: '資料名、フォルダーの場所、利用権限、管理担当者を記録します。', fields: [
    { key: 'title', label: '資料名', required: true },
    { key: 'location', label: 'ファイル・フォルダーの場所', type: 'textarea' },
    { key: 'owner', label: '管理担当者' },
    { key: 'access', label: '利用権限・申請方法', type: 'textarea' },
    { key: 'remarks', label: '内容・注意点', type: 'textarea' },
  ] },
  { id: 'notes', label: '申し送り事項', description: '未解決の課題、注意点、対応期限を記録します。', fields: [
    { key: 'title', label: '件名', required: true },
    { key: 'priority', label: '優先度', type: 'select', options: ['通常', '高', '低'] },
    { key: 'dueDate', label: '対応期限', type: 'date' },
    { key: 'owner', label: '対応者' },
    { key: 'details', label: '内容・対応方法', type: 'textarea' },
  ] },
  { id: 'checklist', label: 'チェックリスト', description: '引継ぎ時に確認する項目を登録し、確認が済んだらチェックします。', fields: [
    { key: 'title', label: '確認項目', required: true },
    { key: 'owner', label: '確認担当者' },
    { key: 'dueDate', label: '確認期限', type: 'date' },
    { key: 'details', label: '確認方法・補足', type: 'textarea' },
  ] },
];

export function freshData(): HandoverData {
  return {
    schemaVersion: 2, toolId: HANDOVER_ID, text: '',
    profile: { department: '', predecessor: '', successor: '', handoverDate: '' },
    sections: { duties: [], schedule: [], contacts: [], files: [], notes: [], checklist: [] },
  };
}
export function validateEntry(value: unknown, section: Section): Entry {
  if (!isObject(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) throw new Error('レコードIDが正しくありません。');
  if (value.completed !== undefined && typeof value.completed !== 'boolean') throw new Error('完了状態の形式が正しくありません。');
  const fields: Record<string, string> = {};
  for (const field of section.fields) fields[field.key] = readField(value[field.key], field);
  return { ...value, ...fields, id: value.id, title: fields.title, completed: value.completed ?? false };
}
export function parseHandover(value: unknown): HandoverData {
  if (!isObject(value) || value.toolId !== HANDOVER_ID) throw new Error('異動引継ぎノートのJSONバックアップを選択してください。');
  if (value.schemaVersion === 1) {
    const text = validateBackup(value, HANDOVER_ID);
    // Retain all legacy extension keys, including names reserved by the newer schema.
    return { ...value, ...freshData(), text, legacyBackup: structuredClone(value) };
  }
  if (value.schemaVersion !== 2) throw new Error('対応していない保存形式です。対応するバージョンのツールを使用してください。');
  if (typeof value.text !== 'string' || value.text.length > MAX_TEXT_LENGTH) throw new Error('メモの形式が正しくありません。');
  if (!isObject(value.profile) || !isObject(value.sections)) throw new Error('基本情報または記録データがありません。');
  const profile = { ...value.profile };
  for (const field of PROFILE_FIELDS) profile[field.key] = readField(value.profile[field.key], field);
  const sections = { ...value.sections };
  let total = 0;
  for (const section of SECTIONS) {
    const rows = value.sections[section.id];
    if (!Array.isArray(rows)) throw new Error(section.label + 'の一覧がありません。');
    total += rows.length;
    if (total > MAX_RECORDS) throw new Error('記録は合計3,000件まで読み込めます。');
    const ids = new Set<string>();
    sections[section.id] = rows.map(row => {
      const entry = validateEntry(row, section);
      if (ids.has(entry.id)) throw new Error(section.label + 'のIDが重複しています。');
      ids.add(entry.id);
      return entry;
    });
  }
  return { ...value, schemaVersion: 2, toolId: HANDOVER_ID, text: value.text, profile: profile as Profile, sections: sections as HandoverData['sections'] };
}
export function parseHandoverText(text: string): HandoverData {
  if (new TextEncoder().encode(text).length > HANDOVER_MAX_BYTES) throw new Error('10MB以下のJSONファイルを選択してください。');
  try { return parseHandover(JSON.parse(text.replace(/^\uFEFF/, ''))); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('JSONの形式が正しくありません。元のバックアップファイルを選択してください。');
    throw error;
  }
}
export function serializeHandover(data: HandoverData, date = new Date().toISOString()): string {
  const value = JSON.stringify({ ...data, exportedAt: date }, null, 2);
  if (new TextEncoder().encode(value).length > HANDOVER_MAX_BYTES) throw new Error('データが10MBを超えています。記録を整理してから保存してください。');
  return value;
}
export function checkHandoverFile(file: { name: string; size: number; type: string }): void {
  if (!/\.json$/i.test(file.name)) throw new Error('拡張子が.jsonのバックアップを選択してください。');
  if (!file.size) throw new Error('ファイルが空です。内容のあるJSONバックアップを選択してください。');
  if (file.size > HANDOVER_MAX_BYTES) throw new Error('10MB以下のJSONファイルを選択してください。');
  if (file.type && !['application/json', 'text/json', 'text/plain', 'application/octet-stream'].includes(file.type)) throw new Error('JSONファイルとして認識できません。元のバックアップを選択してください。');
}
export function completion(data: HandoverData) {
  const rows = SECTIONS.flatMap(section => data.sections[section.id]);
  const done = rows.filter(row => row.completed).length;
  return { total: rows.length, done, percent: rows.length ? Math.round(done / rows.length * 100) : 0 };
}
export function searchEntries(data: HandoverData, query: string) {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja');
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return SECTIONS.flatMap(section => data.sections[section.id]
    .filter(entry => {
      const content = normalize([section.label, ...section.fields.map(field => textValue(entry[field.key]))].join(' '));
      return words.every(word => content.includes(word));
    }).map(entry => ({ section, entry })));
}
