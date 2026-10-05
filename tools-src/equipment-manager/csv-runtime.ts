import { node, action, trapDialogFocus } from '../shared/dom.ts';
import { EQUIPMENT_FIELDS, equipmentStatusLabel } from './model.ts';
import type { EquipmentData, EquipmentItem } from './model.ts';
import { checkEquipmentCsvFile, decodeEquipmentCsv, parseEquipmentCsv, defaultCsvMapping, prepareEquipmentCsv } from './csv.ts';

export function setupEquipmentCsv(options: { getData:()=>EquipmentData; commit:(data:EquipmentData)=>boolean; dirty:()=>boolean; feedback:(message:string,error?:boolean)=>void }) {
  const dialog = node('dialog'); dialog.id = 'csv-dialog'; dialog.setAttribute('aria-labelledby','csv-title');
  const title = node('h2','CSVから備品を追加'); title.id = 'csv-title';
  const inputLabel = node('label','CSVファイル'); const input = node('input'); input.type = 'file'; input.accept = '.csv,text/csv'; input.id = 'csv-file'; inputLabel.htmlFor = input.id; inputLabel.append(input);
  const encodingLabel = node('label','文字コード'); const encoding = node('select'); encoding.id = 'csv-encoding'; encodingLabel.htmlFor = encoding.id;
  for (const [value,label] of [['auto','自動（BOM付きUTF-16／UTF-8）'],['utf-8','UTF-8'],['shift_jis','Shift_JIS'],['utf-16le','UTF-16LE'],['utf-16be','UTF-16BE']]) { const option = node('option',label); option.value = value; encoding.append(option); } encodingLabel.append(encoding);
  const prefixLabel = node('label','このツールのCSV出力で付いた数式対策の先頭アポストロフィを戻す', 'check-field'); const prefix = node('input'); prefix.type = 'checkbox'; prefix.id = 'csv-formula-prefix'; prefixLabel.prepend(prefix);
  const mapping = node('div','','field-grid'); mapping.id = 'csv-mapping';
  const error = node('p','','feedback error'); error.id = 'csv-error'; error.setAttribute('role','alert');
  const preview = node('div'); preview.id = 'csv-preview';
  const summary = node('p'); summary.id = 'csv-summary'; summary.setAttribute('role','status');
  let file: File | null = null, parsed: ReturnType<typeof parseEquipmentCsv> | null = null, prepared: EquipmentItem[] = [], original = '', busy = false, generation = 0;
  function invalidate() { prepared = []; original = ''; accept.disabled = true; preview.replaceChildren(); summary.textContent = ''; }
  const validate = action('内容を検証してプレビュー', () => {
    invalidate(); error.textContent = ''; if (!parsed) { error.textContent = 'CSVファイルを選択してください。'; return; }
    const selected = Object.fromEntries([...mapping.querySelectorAll('select')].map(select => [select.name,Number(select.value)]));
    const result = prepareEquipmentCsv(parsed,selected,options.getData(),prefix.checked);
    summary.textContent = 'CSV ' + parsed.records.length + '件／検証エラー ' + result.errors.length + '件。エラーがある間は1件も取り込みません。';
    if (result.errors.length) { error.textContent = result.errors.join('\n'); return; }
    prepared = result.items; original = JSON.stringify(options.getData());
    summary.textContent = '現在 ' + options.getData().items.length + '件 → 追加後 ' + (options.getData().items.length + prepared.length) + '件。既存の備品・メモ・拡張項目は保持します。先頭20件を表示しています。';
    const table = node('table','','csv-preview-table'); const caption = node('caption','追加する備品のプレビュー'); table.append(caption);
    const head = node('thead'), heading = node('tr');
    for (const field of EQUIPMENT_FIELDS) { const th = node('th',field.label); th.scope = 'col'; heading.append(th); } head.append(heading); table.append(head);
    const body = node('tbody'); for (const item of prepared.slice(0,20)) { const row = node('tr'); for (const field of EQUIPMENT_FIELDS) row.append(node('td',field.key === 'status' ? equipmentStatusLabel(item.status) : String(item[field.key]))); body.append(row); } table.append(body); preview.append(table);
    accept.textContent = prepared.length + '件を追加'; accept.disabled = false;
  }); validate.id = 'csv-validate';
  const accept = action('検証後に追加', () => {
    if (!prepared.length || busy) return;
    if (JSON.stringify(options.getData()) !== original) { invalidate(); error.textContent = '台帳が変更されました。内容をもう一度検証してください。'; return; }
    const count = prepared.length;
    if (options.commit({ ...options.getData(),items:[...options.getData().items,...prepared] })) {
      dialog.close(); options.feedback(count + '件を追加しました。' + (options.dirty() ? 'ブラウザ内は未保存です。JSONを書き出してください。' : '既存の備品は保持しています。'), options.dirty());
    } else error.textContent = '追加できませんでした。台帳の容量と入力内容を確認してください。';
  }); accept.id = 'csv-accept'; accept.disabled = true;
  const cancel = action('キャンセル', () => dialog.close()); cancel.id = 'csv-cancel';
  const actions = node('div','','dialog-actions'); actions.append(validate,accept,cancel);
  dialog.append(title,node('p','1行目を見出しとして読みます。管理番号・備品名の列は必須です。選ばない列は取り込みません。既存データへの追加のみで、置換・更新は行いません。'),inputLabel,encodingLabel,prefixLabel,mapping,error,summary,preview,actions);
  document.body.append(dialog); trapDialogFocus(dialog);
  async function load() {
    const token = ++generation; invalidate(); parsed = null; mapping.replaceChildren(); error.textContent = ''; busy = false; validate.disabled = false; if (!file) return;
    busy = true; validate.disabled = true; summary.textContent = 'CSVを読み込んでいます。';
    try {
      checkEquipmentCsvFile(file); const bytes = new Uint8Array(await file.arrayBuffer()); if (token !== generation) return;
      parsed = parseEquipmentCsv(decodeEquipmentCsv(bytes,encoding.value)); const defaults = defaultCsvMapping(parsed.headers);
      for (const field of EQUIPMENT_FIELDS) {
        const label = node('label',field.label + (field.required ? '（必須）' : '')); const select = node('select'); select.name = field.key; select.id = 'csv-map-' + field.key; label.htmlFor = select.id;
        const empty = node('option','取り込まない'); empty.value = '-1'; select.append(empty);
        parsed.headers.forEach((header,index) => { const option = node('option',(index + 1) + '列目：' + (header || '見出しなし')); option.value = String(index); select.append(option); });
        select.value = String(defaults[field.key]); select.addEventListener('change',invalidate); label.append(select); mapping.append(label);
      }
      summary.textContent = parsed.records.length + '件を読みました。列の対応を確認して「内容を検証してプレビュー」を押してください。';
    } catch (failure) { if (token === generation) { error.textContent = failure instanceof Error ? failure.message : 'CSVを読めません。'; summary.textContent = ''; } }
    finally { if (token === generation) { busy = false; validate.disabled = false; } }
  }
  input.addEventListener('change', () => { file = input.files?.[0] ?? null; void load(); }); encoding.addEventListener('change', () => void load()); prefix.addEventListener('change',invalidate);
  dialog.addEventListener('close', () => { generation++; busy = false; file = null; parsed = null; input.value = ''; invalidate(); mapping.replaceChildren(); });
  const open = action('CSVを読み込む', () => { error.textContent = ''; summary.textContent = ''; validate.disabled = false; dialog.showModal(); input.focus(); }); open.id = 'csv-import'; document.querySelector('.list-actions')!.append(open);
}
