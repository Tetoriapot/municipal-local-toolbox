import { isObject, readField, validDate } from '../shared/fields.ts';
import type { Field } from '../shared/fields.ts';
import { validateBackup } from '../shared/backup.mjs';

export interface BusinessField extends Omit<Field, 'type'> {
  type?: Field['type'] | 'number' | 'time' | 'reference';
  reference?: string; min?: number; default?: string;
}
export interface BusinessSection { id: string; label: string; titleKey: string; fields: BusinessField[]; unique?: string; }
export interface BusinessConfig { id: string; name: string; kind: 'lending'|'inventory'|'calendar'|'meeting'|'inquiry'|'event'; description: string; sections: BusinessSection[]; help: string[]; csv?: boolean; }
export interface BusinessRecord extends Record<string, unknown> { id: string; }
export interface BusinessData extends Record<string, unknown> { schemaVersion: 2; toolId: string; text: string; sections: Record<string, BusinessRecord[]>; }
export const BUSINESS_MAX_BYTES = 10 * 1024 * 1024;
export const normalizeBusiness = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ja');
export function emptyBusiness(config: BusinessConfig): BusinessData {
  return {schemaVersion:2,toolId:config.id,text:'',sections:Object.fromEntries(config.sections.map(section=>[section.id,[]]))};
}
export function businessValue(row: BusinessRecord, key: string): string { return typeof row[key] === 'string' ? row[key] : ''; }
export function readBusinessField(value: unknown, field: BusinessField): string {
  if (value === undefined) value = field.default ?? (field.type === 'number' ? '0' : field.type === 'select' ? field.options?.[0] : undefined);
  if (field.type === 'number') {
    if (typeof value !== 'string' || !/^\d{1,10}$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<(field.min ?? 0) || Number(value)>1000000000) throw new Error(field.label+'は'+(field.min ?? 0)+'〜1,000,000,000の整数で入力してください。');
    return String(Number(value));
  }
  if (field.type === 'time') {
    const time=readField(value,{...field,type:undefined});
    if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error(field.label+'は時:分で入力してください。');
    return time;
  }
  return readField(value,{...field,type:field.type === 'reference' ? undefined : field.type});
}
export function validateBusinessRecord(value: unknown, section: BusinessSection): BusinessRecord {
  if(!isObject(value)||typeof value.id!=='string'||!/^[\w-]{1,100}$/.test(value.id))throw new Error(section.label+'のIDが正しくありません。');
  const row: BusinessRecord={...value,id:value.id};
  for(const field of section.fields)row[field.key]=readBusinessField(value[field.key],field);
  return row;
}
export function inventoryQuantity(data: BusinessData, itemId: string) {
  const item=data.sections.items.find(row=>row.id===itemId);
  return Number(item?.initialQuantity ?? 0)+data.sections.movements.filter(row=>row.itemId===itemId).reduce((total,row)=>total+(row.direction==='入庫'?1:-1)*Number(row.quantity),0);
}
export function loanStatus(row: BusinessRecord, today: string) { return row.returnedAt ? '返却済み' : String(row.dueDate)<today ? '延滞' : '貸出中'; }
export function validateBusinessRelations(data: BusinessData, config: BusinessConfig) {
  for(const section of config.sections)for(const field of section.fields.filter(field=>field.reference))for(const row of data.sections[section.id]) {
    if(!data.sections[field.reference!].some(target=>target.id===row[field.key]))throw new Error(section.label+'の'+field.label+'を登録済みの一覧から選んでください。関連する履歴がある記録は削除できません。');
  }
  if(config.kind==='lending') {
    const active=new Set<string>();
    for(const row of data.sections.loans) {
      if(String(row.dueDate)<String(row.loanDate)||row.returnedAt && String(row.returnedAt)<String(row.loanDate))throw new Error('返却予定日・返却日は貸出日以降にしてください。');
      if(!row.returnedAt){if(active.has(String(row.assetId)))throw new Error('貸出中の備品は重ねて貸し出せません。先に返却処理を行ってください。');active.add(String(row.assetId));}
    }
  }
  if(config.kind==='inventory')for(const item of data.sections.items) {
    let count=Number(item.initialQuantity);
    for(const row of data.sections.movements.filter(row=>row.itemId===item.id).sort((a,b)=>String(a.date).localeCompare(String(b.date)))) {
      count+=(row.direction==='入庫'?1:-1)*Number(row.quantity);
      if(!Number.isSafeInteger(count)||count<0||count>1000000000)throw new Error('「'+item.name+'」の在庫が範囲外になります。初期在庫と入出庫の日付・数量を確認してください。');
    }
  }
}
export function parseBusiness(value: unknown, config: BusinessConfig): BusinessData {
  if(!isObject(value)||value.toolId!==config.id)throw new Error(config.name+'のJSONバックアップを選択してください。');
  if(value.schemaVersion===1)return {...value,...emptyBusiness(config),text:validateBackup(value,config.id),legacyBackup:structuredClone(value)};
  if(value.schemaVersion!==2||!isObject(value.sections))throw new Error('保存形式または分類が正しくありません。元のJSONを確認してください。');
  if(typeof value.text!=='string'||value.text.length>50000)throw new Error('メモは50,000文字以内にしてください。');
  const sections: Record<string,BusinessRecord[]>={...value.sections} as Record<string,BusinessRecord[]>;
  let count=0;
  for(const section of config.sections) {
    const rows=value.sections[section.id];if(!Array.isArray(rows))throw new Error(section.label+'がありません。');
    count+=rows.length;if(count>3000)throw new Error('記録は全分類の合計3,000件までです。');
    const ids=new Set<string>(),unique=new Set<string>();
    sections[section.id]=rows.map(value=>{
      const row=validateBusinessRecord(value,section);
      if(ids.has(row.id))throw new Error(section.label+'のIDが重複しています。');ids.add(row.id);
      if(section.unique){const key=normalizeBusiness(String(row[section.unique]));if(unique.has(key))throw new Error(section.label+'の管理番号が重複しています。');unique.add(key);}
      return row;
    });
  }
  const data: BusinessData={...value,schemaVersion:2,toolId:config.id,text:value.text,sections};
  validateBusinessRelations(data,config);return data;
}
export function serializeBusiness(data: BusinessData) {
  const text=JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2);
  if(new TextEncoder().encode(text).length>BUSINESS_MAX_BYTES)throw new Error('JSONは10MBまでです。データを分けて保管してください。');
  return text;
}
export function parseBusinessText(raw: string, config: BusinessConfig) {
  if(new TextEncoder().encode(raw).length>BUSINESS_MAX_BYTES)throw new Error('10MB以下のJSONを選んでください。');
  try{const data=parseBusiness(JSON.parse(raw.replace(/^\uFEFF/,'')),config);serializeBusiness(data);return data;}
  catch(error){if(error instanceof SyntaxError)throw new Error('JSONの形式が正しくありません。現在のデータは変更していません。');throw error;}
}
export function businessCsv(rows: BusinessRecord[], section: BusinessSection, display: (row:BusinessRecord,field:BusinessField)=>string) {
  const quote=(text:string)=>'"'+((/^[\s\u0000-\u001F\u007F-\u009F\u200B\uFEFF]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text)?"'":'')+text).replaceAll('"','""')+'"';
  return '\uFEFF'+[section.fields.map(field=>field.label),...rows.map(row=>section.fields.map(field=>display(row,field)))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
export function calendarRange(date: string, mode: string): {start:string;end:string} {
  if(!validDate(date))throw new Error('表示する日付を選んでください。');
  const day=new Date(date+'T12:00:00Z'),year=day.getUTCFullYear(),month=day.getUTCMonth();
  let start:Date,end:Date;
  if(mode==='month'){start=new Date(Date.UTC(year,month,1));end=new Date(Date.UTC(year,month+1,0));}
  else if(mode==='week'){start=new Date(day);start.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));end=new Date(start);end.setUTCDate(start.getUTCDate()+6);}
  else {const fiscal=month<3?year-1:year;start=new Date(Date.UTC(fiscal,3,1));end=new Date(Date.UTC(fiscal+1,2,31));}
  return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
