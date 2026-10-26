import { node, action, trapDialogFocus } from '../shared/dom.ts';
import { EQUIPMENT_FIELDS, equipmentStatusLabel } from './model.ts';
import type { EquipmentData } from './model.ts';
import { checkEquipmentCsvFile, decodeEquipmentCsv, parseEquipmentCsv, defaultCsvMapping, prepareEquipmentCsv } from './csv.ts';

export function setupEquipmentCsv(options: { getData:()=>EquipmentData; revision:()=>string; commit:(data:EquipmentData)=>boolean; dirty:()=>boolean; feedback:(message:string,error?:boolean)=>void }) {
  const dialog = node('dialog'); dialog.id = 'csv-dialog'; dialog.setAttribute('aria-labelledby','csv-title');
  const title = node('h2','CSVから備品を追加・更新'); title.id = 'csv-title';
  const modeLabel = node('label','取込み方法'); const mode = node('select'); mode.id = 'csv-mode'; modeLabel.htmlFor = mode.id;
  for (const [value,label] of [['append','新しい備品を追加（既存番号は拒否）'],['upsert','管理番号で照合して追加・更新']]) { const option=node('option',label); option.value=value; mode.append(option); } modeLabel.append(mode);
  const inputLabel = node('label','CSVファイル'); const input = node('input'); input.type = 'file'; input.accept = '.csv,text/csv'; input.id = 'csv-file'; inputLabel.htmlFor = input.id; inputLabel.append(input);
  const encodingLabel = node('label','文字コード'); const encoding = node('select'); encoding.id = 'csv-encoding'; encodingLabel.htmlFor = encoding.id;
  for (const [value,label] of [['auto','自動（BOM付きUTF-16／UTF-8）'],['utf-8','UTF-8'],['shift_jis','Shift_JIS'],['utf-16le','UTF-16LE'],['utf-16be','UTF-16BE']]) { const option = node('option',label); option.value = value; encoding.append(option); } encodingLabel.append(encoding);
  const prefixLabel = node('label','このツールのCSV出力で付いた数式対策の先頭アポストロフィを戻す', 'check-field'); const prefix = node('input'); prefix.type = 'checkbox'; prefix.id = 'csv-formula-prefix'; prefixLabel.prepend(prefix);
  const mapping = node('div','','field-grid'); mapping.id = 'csv-mapping';
  const error = node('p','','feedback error'); error.id = 'csv-error'; error.setAttribute('role','alert');
  const preview = node('div'); preview.id = 'csv-preview';
  const summary = node('p'); summary.id = 'csv-summary'; summary.setAttribute('role','status');
  const reviewLabel = node('label','変更前後と空欄による削除を確認しました','check-field'); const review = node('input'); review.type='checkbox'; review.id='csv-review'; reviewLabel.prepend(review); reviewLabel.hidden=true;
  const pages = node('div','','dialog-actions'); const pageLabel = node('span'); pageLabel.id='csv-page'; pageLabel.setAttribute('role','status');
  const previous = action('前の20件',()=>{ previewPage--; renderPreview(); }); previous.id='csv-previous';
  const next = action('次の20件',()=>{ previewPage++; renderPreview(); }); next.id='csv-next'; pages.append(previous,pageLabel,next); pages.hidden=true;
  let file: File | null = null, parsed: ReturnType<typeof parseEquipmentCsv> | null = null, prepared: ReturnType<typeof prepareEquipmentCsv> | null = null, original = '', busy = false, generation = 0, previewPage = 0;
  function invalidate() { prepared = null; original = ''; accept.disabled = true; preview.replaceChildren(); summary.textContent = ''; previewPage=0; pages.hidden=true; review.checked=false; reviewLabel.hidden=true; }
  function renderPreview() {
    preview.replaceChildren(); if (!prepared) return;
    const count = Math.max(1,Math.ceil(prepared.changes.length/20)); previewPage=Math.max(0,Math.min(previewPage,count-1));
    previous.disabled=previewPage===0; next.disabled=previewPage===count-1; pages.hidden=count===1; pageLabel.textContent=(previewPage+1)+' / '+count;
    for (const change of prepared.changes.slice(previewPage*20,previewPage*20+20)) {
      const card=node('article','','csv-change'); card.append(node('h3',change.kind+'：'+change.after.assetNumber+' '+change.after.name));
      if (change.kind === '変更なし') { card.append(node('p','この備品は変更しません。')); preview.append(card); continue; }
      const table=node('table','','csv-change-table'); table.append(node('caption','取込み前後の内容'));
      const head=node('thead'), heading=node('tr'); for (const label of ['項目','変更前','変更後']) { const th=node('th',label); th.scope='col'; heading.append(th); } head.append(heading); table.append(head);
      const body=node('tbody');
      for (const field of EQUIPMENT_FIELDS.filter(field=>change.fields.includes(field.key))) {
        const row=node('tr'); const label=node('th',field.label); label.scope='row'; row.append(label);
        for (const item of [change.before,change.after]) {
          const text=item ? field.key === 'status' ? equipmentStatusLabel(item.status) : String(item[field.key] ?? '') : '';
          const cell=node('td'); const value=node('div',text || '（空欄）','csv-value'); value.tabIndex=0; cell.append(value); row.append(cell);
        } body.append(row);
      } table.append(body); card.append(table); preview.append(card);
    }
  }
  const validate = action('内容を検証してプレビュー', () => {
    invalidate(); error.textContent = ''; if (!parsed) { error.textContent = 'CSVファイルを選択してください。'; return; }
    const selected = Object.fromEntries([...mapping.querySelectorAll('select')].map(select => [select.name,Number(select.value)]));
    const result = prepareEquipmentCsv(parsed,selected,options.getData(),prefix.checked,mode.value === 'upsert' ? 'upsert' : 'append');
    summary.textContent = 'CSV ' + parsed.records.length + '件／検証エラー ' + result.errors.length + '件。エラーがある間は1件も取り込みません。';
    if (result.errors.length) { error.textContent = result.errors.join('\n'); return; }
    prepared = result; original = options.revision();
    const added=result.changes.filter(change=>change.kind === '追加').length, updated=result.changes.filter(change=>change.kind === '更新').length;
    summary.textContent = '現在 ' + options.getData().items.length + '件 → ' + (mode.value === 'upsert' ? '反映後 ' : '追加後 ') + result.nextItems.length + '件。追加 '+added+'件／更新 '+updated+'件／変更なし '+(result.changes.length-added-updated)+'件。メモ・拡張項目とCSVにない備品は保持します。20件ずつ確認できます。';
    renderPreview(); reviewLabel.hidden=mode.value !== 'upsert';
    accept.textContent = mode.value === 'upsert' ? '確認した追加・更新を反映' : added + '件を追加'; accept.disabled = mode.value === 'upsert' || added+updated === 0;
  }); validate.id = 'csv-validate';
  const accept = action('検証後に追加', () => {
    if (!prepared || busy || (mode.value === 'upsert' && !review.checked)) return;
    if (options.revision() !== original) { invalidate(); error.textContent = '台帳が変更されました。内容をもう一度検証してください。'; return; }
    const added=prepared.changes.filter(change=>change.kind === '追加').length, updated=prepared.changes.filter(change=>change.kind === '更新').length;
    if (!added && !updated) return;
    if (options.commit({ ...options.getData(),items:prepared.nextItems })) {
      dialog.close(); options.feedback(added + '件を追加しました。'+updated+'件を更新しました。' + (options.dirty() ? 'ブラウザ内は未保存です。JSONを書き出してください。' : '別の変更を行う前なら取り消せます。'), options.dirty());
    } else error.textContent = '追加できませんでした。台帳の容量と入力内容を確認してください。';
  }); accept.id = 'csv-accept'; accept.disabled = true;
  const cancel = action('キャンセル', () => dialog.close()); cancel.id = 'csv-cancel';
  const actions = node('div','','dialog-actions'); actions.append(validate,accept,cancel);
  dialog.append(title,node('p','管理番号・備品名の列は必須です。更新では管理番号の全角・半角、英字の大小、前後空白を区別せず照合します。選ばない列は既存値を保持し、選んだ列の空欄は既存値を消します。CSVにない備品は削除しません。'),modeLabel,inputLabel,encodingLabel,prefixLabel,mapping,error,summary,preview,pages,reviewLabel,actions);
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
  mode.addEventListener('change',invalidate); review.addEventListener('change',()=>{accept.disabled=!prepared || !review.checked || !prepared.changes.some(change=>change.kind !== '変更なし');});
  dialog.addEventListener('close', () => { generation++; busy = false; file = null; parsed = null; input.value = ''; invalidate(); mapping.replaceChildren(); });
  const open = action('CSVを読み込む', () => { mode.value='append'; error.textContent = ''; summary.textContent = ''; validate.disabled = false; dialog.showModal(); input.focus(); }); open.id = 'csv-import'; document.querySelector('.list-actions')!.append(open);
}
