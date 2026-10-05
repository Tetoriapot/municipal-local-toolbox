import { el, node, action, trapDialogFocus } from '../shared/dom.ts';
import { createEditDraft, draftFormValues, restoreDraftValues } from '../shared/drafts.ts';
import { createLocalStore } from '../shared/local-store.ts';
import { practiceMode } from '../shared/experience.ts';
import { backupComparison } from '../shared/import-comparison.mjs';
import { setupEquipmentCsv } from './csv-runtime.ts';
import sample from './sample.json' with { type: 'json' };
import { EQUIPMENT_KEY, EQUIPMENT_LEGACY_KEY, EQUIPMENT_FIELDS, EQUIPMENT_STATUSES, equipmentEmpty, equipmentStatusLabel, parseEquipment, parseEquipmentText, serializeEquipment, checkEquipmentFile, selectEquipment, equipmentCsv } from './model';
import type { EquipmentData, EquipmentItem, EquipmentFilter } from './model';

const editor = el<HTMLDialogElement>('edit-dialog');
const clearModal = el<HTMLDialogElement>('clear-dialog');
const recordForm = el<HTMLFormElement>('record-form');
const equipmentMemo = el<HTMLTextAreaElement>('memo');
const PAGE_SIZE = 50;
let view = 'home';
let pageNumber = 1;
let editingId: string | null = null;
let editorStart = '';
let editorReturn: HTMLElement | null = null;
let importBusy = false;
let currentSaveLabel = '未入力';
let currentSaveWarning = false;
const filter: EquipmentFilter = { query: '', category: '', location: '', status: '', sort: 'number' };
const store = createLocalStore<EquipmentData>({
  key: EQUIPMENT_KEY, legacyKey: EQUIPMENT_LEGACY_KEY, fresh: equipmentEmpty,
  parse: parseEquipmentText, serialize: serializeEquipment,
  memoryOnly: practiceMode,
  onNotice(notice) {
    const warning = notice.status === 'corrupt' || notice.status === 'conflict' || notice.status === 'unavailable';
    const label = practiceMode ? 'サンプル：この画面内のみ' : notice.status === 'corrupt' ? '保存データを読めません：未保存' : notice.status === 'conflict' ? '別の画面で変更：保存を停止中' : notice.dirty ? '未保存：JSONを書き出してください' : notice.status === 'empty' ? '未入力' : 'このブラウザ内に自動保存済み';
    currentSaveLabel = label; currentSaveWarning = warning || notice.dirty;
    el('save-status').textContent = label;
    el('save-status').classList.toggle('unsaved', currentSaveWarning);
    el('storage-warning').hidden = !warning;
    el('storage-message').textContent = notice.message;
    if (!warning && notice.message !== label) feedback(notice.message);
  },
});
function feedback(text: string, error = false) {
  el('feedback').textContent = text;
  el('feedback').classList.toggle('error', error);
}
const drafts = createEditDraft('equipment-manager', draft => {
  if (draft.section !== 'equipment') throw new Error('分類がありません。');
  const original = draft.id ? store.data.items.find(row => row.id === draft.id) : undefined;
  const matches = draft.id === null || (original && JSON.stringify(original) === draft.base);
  if (!matches && !confirm('元の備品が変更または削除されています。元の備品を上書きせず、新規登録として下書きを再開しますか？')) return;
  navigateEquipment('list'); openEquipmentEditor(matches ? original : undefined, true);
  restoreDraftValues(recordForm,draft.values);
  el('draft-save-status').textContent = '下書きを復元しました。登録・保存するまで確定済みの備品は変わりません。';
  el('save-status').textContent = '下書きを編集中：登録・保存で確定';
}, practiceMode);
function valuesFor(key: 'category' | 'location') {
  return [...new Set(store.data.items.map(item => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
}
function syncSelect(id: string, values: string[], selected: string) {
  const input = el<HTMLSelectElement>(id);
  const available = selected && !values.includes(selected) ? [...values, selected] : values;
  input.replaceChildren();
  for (const value of ['', ...available]) {
    const option = node('option', value || 'すべて'); option.value = value;
    input.append(option);
  }
  input.value = selected;
}
function renderHome() {
  const root = el('summary'); root.replaceChildren();
  for (const status of [{ id: '', label: '全備品' }, ...EQUIPMENT_STATUSES]) {
    const count = store.data.items.filter(item => !status.id || item.status === status.id).length;
    const button = action('', () => {
      resetFilters(); filter.status = status.id;
      el<HTMLSelectElement>('status-filter').value = status.id; navigateEquipment('list');
    });
    button.append(node('span', status.label), node('strong', count + '件')); root.append(button);
  }
  el('data-count').textContent = '登録済みの備品：' + store.data.items.length + '件';
}
function restoreMemo() {
  equipmentMemo.value = store.data.text;
  updateMemoCount();
}
function updateMemoCount() { el('count').textContent = equipmentMemo.value.length.toLocaleString('ja-JP') + ' / 50,000文字'; }
function filteredItems() { return selectEquipment(store.data.items, filter); }
function renderList() {
  syncSelect('category-filter', valuesFor('category'), filter.category);
  syncSelect('location-filter', valuesFor('location'), filter.location);
  const rows = filteredItems();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  pageNumber = Math.max(1, Math.min(pageNumber, pages));
  const first = (pageNumber - 1) * PAGE_SIZE;
  el('result-count').textContent = '該当 ' + rows.length + '件 / 全 ' + store.data.items.length + '件' + (rows.length ? '（' + (first + 1) + '〜' + Math.min(first + PAGE_SIZE, rows.length) + '件目）' : '');
  el('empty-state').hidden = rows.length > 0;
  el('empty-state').textContent = store.data.items.length ? '条件に一致する備品はありません。検索条件を変更してください。' : '備品がありません。「備品を登録」から追加してください。';
  el('equipment-table').hidden = rows.length === 0;
  el('page-number').textContent = pageNumber + ' / ' + pages;
  el<HTMLButtonElement>('previous-page').disabled = pageNumber === 1;
  el<HTMLButtonElement>('next-page').disabled = pageNumber === pages;
  const body = el('equipment-rows'); body.replaceChildren();
  for (const item of rows.slice(first, first + PAGE_SIZE)) {
    const row = node('tr'); row.dataset.itemId = item.id;
    for (const [key, label] of [['assetNumber', '管理番号'], ['name', '備品名・備考'], ['category', 'カテゴリ'], ['location', '設置場所'], ['purchaseDate', '購入日'], ['status', '状態']] as const) {
      const cell = node('td'); cell.dataset.label = label;
      const content = node('div');
      if (key === 'status') {
        const badge = node('span', equipmentStatusLabel(item.status), 'status-tag');
        badge.dataset.status = item.status; content.append(badge);
      } else content.append(node(key === 'name' ? 'strong' : 'span', item[key] || '未入力'));
      if (key === 'name' && item.notes) {
        const details = node('details'); details.append(node('summary', '備考'), node('p', item.notes)); content.append(details);
      }
      cell.append(content); row.append(cell);
    }
    const actionsCell = node('td'); actionsCell.dataset.label = '操作';
    const actions = node('div', '', 'item-actions');
    const edit = action('編集', () => openEquipmentEditor(item));
    edit.setAttribute('aria-label', item.assetNumber + ' ' + item.name + 'を編集');
    const remove = action('削除', () => {
      if (!confirm('「' + item.assetNumber + ' ' + item.name + '」を削除しますか？この操作は取り消せません。')) return;
      if (commitEquipment({ ...store.data, items: store.data.items.filter(row => row.id !== item.id) })) {
        feedback(store.dirty ? '画面から削除しましたが未保存です。JSONを書き出してください。' : '備品を削除しました。', store.dirty);
        el('add-record').focus();
      }
    }, 'danger');
    remove.setAttribute('aria-label', item.assetNumber + ' ' + item.name + 'を削除');
    actions.append(edit, remove); actionsCell.append(actions); row.append(actionsCell); body.append(row);
  }
}
function renderEquipment() { renderHome(); if (view === 'list') renderList(); }
function commitEquipment(next: EquipmentData, replaceCorrupt = false) {
  try {
    const valid = parseEquipment(next);
    serializeEquipment(valid);
    store.replace(valid, replaceCorrupt);
    renderEquipment();
    return true;
  } catch (error) {
    feedback(error instanceof Error ? error.message : '変更できませんでした。入力内容を確認してください。', true);
    return false;
  }
}
function navigateEquipment(next: string) {
  if (!['home', 'list', 'data', 'help'].includes(next)) return;
  view = next;
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
  document.querySelectorAll<HTMLButtonElement>('#navigation [data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  renderEquipment(); el('main').focus();
}
function resetFilters() {
  Object.assign(filter, { query: '', category: '', location: '', status: '', sort: 'number' });
  for (const id of ['query', 'category-filter', 'location-filter', 'status-filter']) el<HTMLInputElement>(id).value = '';
  el<HTMLSelectElement>('sort').value = 'number'; pageNumber = 1;
}
function formSnapshot() {
  return JSON.stringify([...recordForm.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,textarea,select')].map(input => input.value));
}
function equipmentEditDirty() { return editor.open && formSnapshot() !== editorStart; }
function closeEquipmentEditor(force = false) {
  if (!force && equipmentEditDirty() && !confirm('登録していない変更を破棄して閉じますか？')) return;
  if (!force || !store.dirty) drafts.clear();
  editor.close(); editingId = null;
  el('save-status').textContent = currentSaveLabel;
  el('save-status').classList.toggle('unsaved', currentSaveWarning);
  if (editorReturn?.isConnected) editorReturn.focus();
  else el(view === 'home' ? 'home-add' : 'add-record').focus();
}
function openEquipmentEditor(item?: EquipmentItem, restoring = false) {
  if (!drafts.start('equipment', item?.id ?? null, item ? JSON.stringify(item) : null, restoring)) return;
  editorReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  editingId = item?.id ?? null;
  el('edit-title').textContent = item ? '備品を編集' : '備品を登録';
  el('submit-record').textContent = item ? '変更を保存' : '登録する';
  el('form-error').textContent = '';
  el('draft-save-status').textContent = '入力中の内容は下書きとして保存します。確定済みの備品とは別です。';
  const root = el('edit-fields'); root.replaceChildren();
  for (const field of EQUIPMENT_FIELDS) {
    const label = node('label', field.label, field.type === 'textarea' ? 'wide' : '');
    label.htmlFor = 'field-' + field.key;
    if (field.required) label.append(node('span', '必須', 'required'));
    const input = field.type === 'textarea' ? node('textarea') : field.type === 'select' ? node('select') : node('input');
    input.id = 'field-' + field.key; input.name = field.key; input.required = !!field.required;
    if (input instanceof HTMLSelectElement) {
      for (const status of EQUIPMENT_STATUSES) { const option = node('option', status.label); option.value = status.id; input.append(option); }
    } else {
      input.maxLength = field.maxLength ?? (field.type === 'textarea' ? 20000 : 500);
      if (input instanceof HTMLInputElement) {
        input.type = field.type === 'date' ? 'date' : 'text';
        if (field.key === 'category' || field.key === 'location') input.setAttribute('list', field.key === 'category' ? 'categories' : 'locations');
      }
    }
    input.value = String(item?.[field.key] ?? (field.key === 'status' ? 'unknown' : ''));
    label.append(input); root.append(label);
  }
  for (const [key, id] of [['category', 'categories'], ['location', 'locations']] as const) {
    el(id).replaceChildren(...valuesFor(key).map(value => { const option = node('option'); option.value = value; return option; }));
  }
  editorStart = formSnapshot(); editor.showModal(); el('field-assetNumber').focus();
}
function downloadEquipment(text: string, extension: 'json' | 'csv', filtered = false) {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  const blob = new Blob([text], { type: extension === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = node('a'); link.href = url;
  link.download = extension === 'json' ? 'equipment-manager-backup-' + date + '.json' : '備品管理台帳-' + (filtered ? '絞り込み-' : '全件-') + date + '.csv';
  if (practiceMode) link.download = 'sample-' + link.download;
  document.body.append(link); link.click(); link.remove();
  if (extension === 'json') dispatchEvent(new Event('tool-backup-export'));
  // Keep the URL alive until the browser has handed the download to its download manager.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback('ダウンロードを開始しました。保存先を確認してください。');
}
function printEquipment(all: boolean) {
  const root = el('print-area'); root.replaceChildren(node('h1', '備品管理台帳'));
  const rows = all ? selectEquipment(store.data.items, { query: '', category: '', location: '', status: '', sort: 'number' }) : filteredItems();
  root.append(node('p', (all ? '全備品' : '絞り込み結果') + '：' + rows.length + '件'));
  if (!all) root.append(node('p', '条件：' + ['キーワード ' + (filter.query || '指定なし'), 'カテゴリ ' + (filter.category || 'すべて'), '設置場所 ' + (filter.location || 'すべて'), '状態 ' + (filter.status ? equipmentStatusLabel(filter.status) : 'すべて')].join(' / ')));
  if (!rows.length) root.append(node('p', '該当する備品はありません。'));
  for (const item of rows) {
    const card = node('article', '', 'record-card'); card.append(node('h2', item.assetNumber + '　' + item.name));
    const list = node('dl');
    for (const field of EQUIPMENT_FIELDS.filter(field => !['assetNumber', 'name'].includes(field.key))) list.append(node('dt', field.label), node('dd', field.key === 'status' ? equipmentStatusLabel(item.status) : String(item[field.key] || '未入力')));
    card.append(list); root.append(card);
  }
  if (all) { root.append(node('h2', 'メモ')); const memo = node('p', store.data.text || '未入力', 'print-memo'); memo.id = 'print-text'; root.append(memo); }
}

trapDialogFocus(editor); trapDialogFocus(clearModal);
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => navigateEquipment(button.dataset.view!)));
for (const id of ['home-add', 'add-record']) el(id).addEventListener('click', () => openEquipmentEditor());
for (const id of ['close-edit', 'cancel-edit']) el(id).addEventListener('click', () => closeEquipmentEditor());
editor.addEventListener('cancel', event => { event.preventDefault(); closeEquipmentEditor(); });
recordForm.addEventListener('input', () => {
  if (editor.open) {
    el('save-status').textContent = '編集中：登録・保存で確定'; el('save-status').classList.add('unsaved');
    el('draft-save-status').textContent = drafts.save(draftFormValues(recordForm)) ? (practiceMode ? '下書きをこの画面内に保持しました。再読込みすると消えます。' : '下書きをこのブラウザ内に保存しました。登録・保存で確定します。') : '下書きは未保存です。容量・保存制限や別画面での変更を確認し、閉じる前に登録・保存してください。';
  }
});
recordForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const old = store.data.items.find(item => item.id === editingId);
    const fields = Object.fromEntries(EQUIPMENT_FIELDS.map(field => [field.key, el<HTMLInputElement>('field-' + field.key).value]));
    const item = { ...old, ...fields, id: editingId ?? crypto.randomUUID() };
    const next = parseEquipment({ ...store.data, items: editingId ? store.data.items.map(row => row.id === editingId ? item : row) : [...store.data.items, item] });
    serializeEquipment(next);
    if (commitEquipment(next)) { closeEquipmentEditor(true); feedback(store.dirty ? '画面に反映しましたが未保存です。JSONを書き出してください。' : '備品を保存しました。', store.dirty); }
  } catch (error) { el('form-error').textContent = error instanceof Error ? error.message : '登録できませんでした。入力内容を確認してください。'; }
});
equipmentMemo.addEventListener('input', () => {
  if (!commitEquipment({ ...store.data, text: equipmentMemo.value })) equipmentMemo.value = store.data.text;
  updateMemoCount();
});
for (const [id, key] of [['query', 'query'], ['category-filter', 'category'], ['location-filter', 'location'], ['status-filter', 'status'], ['sort', 'sort']] as const) {
  el(id).addEventListener(id === 'query' ? 'input' : 'change', () => { filter[key] = el<HTMLInputElement>(id).value; pageNumber = 1; renderList(); });
}
el('reset-filters').addEventListener('click', () => { resetFilters(); renderList(); el('query').focus(); });
el('previous-page').addEventListener('click', () => { pageNumber--; renderList(); });
el('next-page').addEventListener('click', () => { pageNumber++; renderList(); });
for (const status of EQUIPMENT_STATUSES) { const option = node('option', status.label); option.value = status.id; el('status-filter').append(option); }
el('save-now').addEventListener('click', () => { if (store.save()) feedback('現在のデータを保存しました。'); });
el('export').addEventListener('click', () => {
  try { downloadEquipment(serializeEquipment(practiceMode ? { ...store.data,sampleData:true } : store.data), 'json'); }
  catch (error) { feedback(error instanceof Error ? error.message : 'バックアップを書き出せませんでした。', true); }
});
for (const [id, filtered] of [['csv-all', false], ['csv-current', true]] as const) el(id).addEventListener('click', () => {
  try { downloadEquipment(equipmentCsv(filtered ? filteredItems() : selectEquipment(store.data.items, { ...filter, query: '', category: '', location: '', status: '' })), 'csv', filtered); }
  catch { feedback('CSVを書き出せませんでした。入力内容を確認し、もう一度実行してください。', true); }
});
el('import').addEventListener('click', () => el<HTMLInputElement>('import-file').click());
el('import-file').addEventListener('change', async () => {
  const picker = el<HTMLInputElement>('import-file'); const file = picker.files?.[0]; picker.value = '';
  if (!file || importBusy) return;
  importBusy = true; el<HTMLButtonElement>('import').disabled = true;
  try {
    checkEquipmentFile(file); feedback('バックアップを確認しています。');
    const incoming = parseEquipmentText(await file.text());
    if (!confirm(backupComparison('備品管理台帳', file.name, { '備品件数': store.data.items.length, 'メモ文字数': store.data.text.length }, { '備品件数': incoming.items.length, 'メモ文字数': incoming.text.length }, incoming.exportedAt, incoming.sampleData === true))) { feedback('読込みをキャンセルしました。'); return; }
    if (commitEquipment(incoming, true)) { restoreMemo(); feedback(store.dirty ? '読み込みましたが未保存です。JSONを書き出してください。' : 'バックアップを読み込みました。', store.dirty); }
  } catch (error) { feedback((error instanceof Error ? error.message : 'ファイルを読み込めませんでした。') + '現在のデータは変更していません。', true); }
  finally { importBusy = false; el<HTMLButtonElement>('import').disabled = false; }
});
el('reload-data').addEventListener('click', () => {
  if (!confirm('この画面の内容を破棄して保存済みデータを読み直しますか？必要な内容は先にJSONへ書き出してください。')) return;
  store.load(); if (practiceMode) store.replace(parseEquipment(sample)); restoreMemo(); renderEquipment();
});
el('clear').addEventListener('click', () => {
  el<HTMLInputElement>('clear-confirm').value = ''; el<HTMLButtonElement>('confirm-clear').disabled = true; el('clear-error').textContent = '';
  clearModal.showModal(); el('clear-confirm').focus();
});
el('clear-confirm').addEventListener('input', () => { el<HTMLButtonElement>('confirm-clear').disabled = el<HTMLInputElement>('clear-confirm').value !== 'すべて削除'; });
el('cancel-clear').addEventListener('click', () => clearModal.close());
el('confirm-clear').addEventListener('click', () => {
  if (el<HTMLInputElement>('clear-confirm').value !== 'すべて削除') return;
  try {
    store.clear(); restoreMemo(); renderEquipment(); clearModal.close();
    feedback('このバージョンのデータを削除しました。旧版の保存領域とJSON・CSVファイルは残っています。');
  } catch (error) { el('clear-error').textContent = (error instanceof Error ? error.message : '削除できませんでした。') + '現在のデータは変更していません。'; }
});
el('print').addEventListener('click', () => { printEquipment(true); window.print(); });
el('print-current').addEventListener('click', () => { printEquipment(false); window.print(); });
addEventListener('beforeprint', () => { if (!el('print-area').childElementCount) printEquipment(true); });
addEventListener('afterprint', () => el('print-area').replaceChildren());
addEventListener('beforeunload', event => { if (store.dirty || equipmentEditDirty()) event.preventDefault(); });
store.load(); if (practiceMode) store.replace(parseEquipment(sample)); restoreMemo(); renderEquipment();
setupEquipmentCsv({ getData:()=>store.data, commit:commitEquipment, dirty:()=>store.dirty, feedback });

el('suspend-edit').addEventListener('click', () => {
  if (drafts.save(draftFormValues(recordForm))) { editor.close(); el('resume-draft').focus(); }
  else el('draft-save-status').textContent = '下書きを保存できません。編集中の内容を登録・保存するか、手元に控えてください。';
});
