export interface Field {
  key: string;
  label: string;
  type?: 'textarea' | 'select' | 'date';
  options?: string[];
  required?: boolean;
  maxLength?: number;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
export function readField(value: unknown, field: Field): string {
  if (value === undefined && !field.required) return field.type === 'select' ? field.options![0] : '';
  if (typeof value !== 'string') throw new Error(field.label + 'の形式が正しくありません。');
  const limit = field.maxLength ?? (field.type === 'textarea' ? 20000 : 500);
  if (value.length > limit) throw new Error(field.label + 'は' + limit.toLocaleString('ja-JP') + '文字以内で入力してください。');
  if (field.required && !value.trim()) throw new Error(field.label + 'を入力してください。');
  if (field.type === 'select' && !field.options!.includes(value)) throw new Error(field.label + 'を選択肢から選んでください。');
  if (field.type === 'date' && value && !validDate(value)) throw new Error(field.label + 'に有効な日付を入力してください。');
  return value;
}
