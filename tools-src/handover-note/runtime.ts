import { el, node, action, trapDialogFocus } from '../shared/dom.ts';
import { createEditDraft, draftFormValues, restoreDraftValues } from '../shared/drafts.ts';
import { practiceMode } from '../shared/experience.ts';
import { backupComparison } from '../shared/import-comparison.mjs';
import sample from './sample.json' with { type: 'json' };
import { HANDOVER_KEY, LEGACY_KEY, SECTIONS, PROFILE_FIELDS, MONTHS, MAX_RECORDS, freshData, parseHandoverText, serializeHandover, checkHandoverFile, completion, searchEntries, textValue, readField, validateEntry } from './model';
import type { HandoverData, Section, Entry, Field } from './model';

const memo = el<HTMLTextAreaElement>('memo');
const statusNode = el('save-status');
const feedback = el('feedback');
const dialog = el<HTMLDialogElement>('edit-dialog');
const clearDialog = el<HTMLDialogElement>('clear-dialog');
trapDialogFocus(dialog);
trapDialogFocus(clearDialog);
const form = el<HTMLFormElement>('record-form');
const sectionById = (id: string) => SECTIONS.find(section => section.id === id);
let state = freshData();
let lastRaw: string | null = null;
let blocked: 'corrupt' | 'conflict' | null = null;
let unsaved = false;
let currentView = 'home';
let recordQuery = '';
let recordFilter = 'all';
let editing: { section: Section; id: string | null } | null = null;
let editStart = '';
let importBusy = false;
let returnFocus: HTMLElement | null = null;
const drafts = createEditDraft('handover-note', draft => {
  const section = sectionById(draft.section);
  if (!section) throw new Error('分類がありません。');
  const original = draft.id ? state.sections[section.id].find(row => row.id === draft.id) : undefined;
  const matches = draft.id === null || (original && JSON.stringify(original) === draft.base);
  if (!matches && !confirm('元の記録が変更または削除されています。元の記録を上書きせず、新規記録として下書きを再開しますか？')) return;
  navigate(section.id); openEditor(section, matches ? original : undefined, true);
  restoreDraftValues(form,draft.values);
  el('draft-save-status').textContent = '下書きを復元しました。登録・保存するまで確定済みの記録は変わりません。';
  savedLabel('下書きを編集中：登録・保存で確定', true);
}, practiceMode);

function message(text: string, error = false) {
  feedback.textContent = text;
  feedback.classList.toggle('error', error);
}
function savedLabel(text: string, error = false) {
  statusNode.textContent = practiceMode && (text.includes('自動保存済み') || text === '未入力') ? 'サンプル：この画面内のみ' : text;
  statusNode.classList.toggle('unsaved', error);
}
function storageWarning(text: string) {
  el('storage-warning').hidden = false;
  el('storage-message').textContent = text;
}
function reportStorageError(error: unknown) {
  unsaved = true;
  savedLabel('未保存：JSONを書き出してください', true);
  storageWarning(error instanceof Error ? error.message : 'ブラウザ内に保存できません。JSONバックアップを書き出してください。');
}
function writeState(): boolean {
  if (practiceMode) { unsaved = false; savedLabel('サンプル：この画面内のみ'); return true; }
  if (blocked) {
    unsaved = true;
    savedLabel(blocked === 'conflict' ? '未保存：別の画面で変更されています' : '未保存：既存データを保護中', true);
    return false;
  }
  try {
    if (!practiceMode && localStorage.getItem(HANDOVER_KEY) !== lastRaw) {
      blocked = 'conflict';
      storageWarning('別の画面で保存データが変更されました。この画面の内容をJSONに書き出し、保存済みデータを読み直してください。');
      unsaved = true;
      savedLabel('未保存：別の画面で変更されています', true);
      return false;
    }
    const raw = serializeHandover(state);
    if (!practiceMode) localStorage.setItem(HANDOVER_KEY, raw);
    lastRaw = raw;
    unsaved = false;
    el('storage-warning').hidden = true;
    savedLabel('このブラウザ内に自動保存済み');
    return true;
  } catch (error) {
    reportStorageError(error instanceof Error && error.message.includes('10MB') ? error : new Error('ブラウザ内に保存できません。容量不足や保存制限を確認し、画面を閉じる前にJSONを書き出してください。'));
    return false;
  }
}
function loadState() {
  if (practiceMode) { state = parseHandoverText(JSON.stringify(sample)); unsaved = false; savedLabel('サンプル：この画面内のみ'); return; }
  blocked = null;
  unsaved = false;
  state = freshData();
  try {
    lastRaw = localStorage.getItem(HANDOVER_KEY);
    const source = lastRaw ?? localStorage.getItem(LEGACY_KEY);
    if (source !== null) {
      try {
        state = parseHandoverText(source);
        if (lastRaw === null) {
          writeState();
          message('旧版のメモを読み込みました。旧版の保存領域は変更していません。');
        } else savedLabel('このブラウザ内に自動保存済み');
      } catch (error) {
        blocked = 'corrupt';
        savedLabel('保存データを読めません：未保存', true);
        storageWarning('保存データは上書きしません。有効なJSONを読み込むか、データ管理で初期化してください。' + (error instanceof Error ? error.message : ''));
      }
    } else savedLabel('未入力');
  } catch {
    reportStorageError(new Error('ブラウザの保存機能を利用できません。入力後はJSONバックアップを書き出してください。'));
  }
}
function commit(next: HandoverData): boolean {
  try {
    // Validate capacity before mutating state so an accepted dataset can always be exported.
    serializeHandover(next);
    state = next;
    unsaved = true;
    writeState();
    render();
    return true;
  } catch (error) {
    message(error instanceof Error ? error.message : '変更を反映できませんでした。入力内容を確認してください。', true);
    return false;
  }
}
function inputField(field: Field, value: unknown, prefix: string) {
  const wrapper = node('label', field.label, field.type === 'textarea' ? 'wide' : '');
  const id = prefix + field.key;
  wrapper.htmlFor = id;
  if (field.required) wrapper.append(node('span', '必須', 'required'));
  const input = field.type === 'textarea' ? node('textarea') : field.type === 'select' ? node('select') : node('input');
  input.id = id;
  input.name = field.key;
  if (input instanceof HTMLInputElement) input.type = field.type === 'date' ? 'date' : 'text';
  if (input instanceof HTMLSelectElement) {
    for (const option of field.options!) {
      const item = node('option', field.key === 'month' ? option + '月' : option);
      item.value = option; input.append(item);
    }
  } else input.maxLength = field.maxLength ?? (field.type === 'textarea' ? 20000 : 500);
  input.required = field.required ?? false;
  input.value = typeof value === 'string' ? value : field.options?.[0] ?? '';
  wrapper.append(input);
  return { wrapper, input };
}
function renderProfile() {
  const root = el('profile-fields');
  root.replaceChildren();
  for (const field of PROFILE_FIELDS) {
    const { wrapper, input } = inputField(field, state.profile[field.key], 'profile-');
    input.addEventListener('input', () => {
      try {
        const value = readField(input.value, field);
        const next = { ...state, profile: { ...state.profile, [field.key]: value } };
        serializeHandover(next);
        state = next; writeState();
        input.setCustomValidity('');
      } catch (error) {
        input.setCustomValidity(error instanceof Error ? error.message : '入力を確認してください。');
        unsaved = true; savedLabel('未保存：入力内容を確認してください', true);
      }
    });
    root.append(wrapper);
  }
}
function renderHome() {
  const summary = el('summary');
  summary.replaceChildren();
  for (const section of SECTIONS) {
    const button = action('', () => navigate(section.id));
    button.append(node('span', section.label), node('strong', state.sections[section.id].length + '件'));
    summary.append(button);
  }
  const counts = completion(state);
  el('completion-label').textContent = counts.total ? counts.percent + '%（' + counts.done + ' / ' + counts.total + '件）' : '記録が未登録です';
  el<HTMLProgressElement>('completion-progress').value = counts.percent;
  el('completion-sections').replaceChildren(...SECTIONS.map(section => {
    const rows = state.sections[section.id];
    return node('span', section.label + '：' + rows.filter(row => row.completed).length + ' / ' + rows.length + '件');
  }));
  memo.value = state.text;
  el('count').textContent = state.text.length.toLocaleString('ja-JP') + ' / 50,000文字';
  el('data-count').textContent = '現在の記録数：' + counts.total + '件';
}
function editSnapshot() {
  const values = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].map(input => input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value);
  return JSON.stringify(values);
}
function editDirty() { return dialog.open && editSnapshot() !== editStart; }
function closeEdit(force = false) {
  if (!force && editDirty() && !confirm('登録していない変更を破棄して閉じますか？')) return;
  if (!force || !unsaved) drafts.clear();
  dialog.close();
  editing = null;
  if (unsaved) savedLabel('未保存：JSONを書き出してください', true);
  else savedLabel(lastRaw === null ? '未入力' : 'このブラウザ内に自動保存済み');
  if (returnFocus?.isConnected) returnFocus.focus();
  else el<HTMLButtonElement>('add-record').focus();
}
function openEditor(section: Section, entry?: Entry, restoring = false) {
  if (!drafts.start(section.id, entry?.id ?? null, entry ? JSON.stringify(entry) : null, restoring)) return;
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  editing = { section, id: entry?.id ?? null };
  el('edit-title').textContent = section.label + (entry ? 'を編集' : 'を登録');
  el('submit-record').textContent = entry ? '変更を保存' : '登録する';
  el('form-error').textContent = '';
  el('draft-save-status').textContent = '入力中の内容は下書きとして保存します。確定済みの記録とは別です。';
  const fields = el('edit-fields');
  fields.replaceChildren();
  for (const field of section.fields) fields.append(inputField(field, entry?.[field.key], 'field-').wrapper);
  el<HTMLInputElement>('entry-completed').checked = entry?.completed ?? false;
  editStart = editSnapshot();
  dialog.showModal();
  fields.querySelector<HTMLInputElement>('input')?.focus();
}
function deleteEntry(section: Section, entry: Entry) {
  if (!confirm('「' + entry.title + '」を削除しますか？この操作は取り消せません。')) return;
  if (commit({ ...state, sections: { ...state.sections, [section.id]: state.sections[section.id].filter(row => row.id !== entry.id) } })) {
    message('記録を削除しました。'); el<HTMLButtonElement>('add-record').focus();
  }
}
function entryCard(section: Section, entry: Entry, print = false) {
  const card = node('article', '', 'record-card');
  const top = node('div', '', 'record-top');
  const heading = node('div');
  heading.append(node('p', section.label, 'record-category'), node('h3', entry.title));
  top.append(heading);
  if (!print) {
    const actions = node('div', '', 'record-actions');
    actions.append(action('編集', () => openEditor(section, entry)), action('削除', () => deleteEntry(section, entry), 'danger'));
    top.append(actions);
  }
  card.append(top);
  const details = node('dl');
  for (const field of section.fields.filter(field => field.key !== 'title')) {
    const value = textValue(entry[field.key]);
    if (value) details.append(node('dt', field.label), node('dd', field.key === 'month' ? value + '月' : value));
  }
  if (details.childElementCount) card.append(details);
  if (print) card.append(node('p', entry.completed ? '確認済み' : '未確認'));
  else {
    const label = node('label', '確認済み', 'check-field');
    const checkbox = node('input');
    checkbox.type = 'checkbox'; checkbox.checked = entry.completed;
    checkbox.setAttribute('aria-label', entry.title + 'を確認済みにする');
    checkbox.addEventListener('change', () => {
      const next = { ...entry, completed: checkbox.checked };
      if (commit({ ...state, sections: { ...state.sections, [section.id]: state.sections[section.id].map(row => row.id === entry.id ? next : row) } })) {
        message(next.completed ? '確認済みにしました。' : '未確認に戻しました。');
        const candidates = [...document.querySelectorAll<HTMLInputElement>('.record-card input[type=checkbox]')];
        candidates.find(item => item.getAttribute('aria-label') === checkbox.getAttribute('aria-label'))?.focus();
      }
    });
    label.prepend(checkbox); card.append(label);
  }
  return card;
}
function visibleRecords(section: Section) {
  return searchEntries(state, recordQuery).filter(item => item.section.id === section.id && (recordFilter === 'all' || item.entry.completed === (recordFilter === 'done'))).map(item => item.entry);
}
function renderRecords() {
  const section = sectionById(currentView);
  if (!section) return;
  const rows = visibleRecords(section);
  el('section-heading').textContent = section.label;
  el('section-description').textContent = section.description;
  el('record-count').textContent = rows.length + '件表示 / 登録' + state.sections[section.id].length + '件';
  const root = el('record-list'); root.replaceChildren();
  if (section.id === 'schedule') {
    for (const month of MONTHS) {
      root.append(node('h3', month + '月', 'month-heading'));
      const matches = rows.filter(row => row.month === month);
      if (!matches.length) root.append(node('p', '該当する予定はありません。', 'muted'));
      for (const row of matches) root.append(entryCard(section, row));
    }
  } else if (!rows.length) {
    root.append(node('p', state.sections[section.id].length ? '条件に一致する記録はありません。検索や確認状態を変更してください。' : '記録がありません。「新規登録」から追加してください。', 'empty'));
  } else for (const row of rows) root.append(entryCard(section, row));
}
function generalMatches(query: string) {
  const words = query.normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every(word => text.normalize('NFKC').toLocaleLowerCase('ja').includes(word));
  return {
    profile: matches(PROFILE_FIELDS.map(field => textValue(state.profile[field.key])).join(' ')),
    memo: matches(state.text),
  };
}
function renderSearch() {
  const query = el<HTMLInputElement>('global-query').value.trim();
  const root = el('search-results'); root.replaceChildren();
  if (!query) { el('search-count').textContent = '検索キーワードを入力してください。'; return; }
  const matches = searchEntries(state, query);
  const general = generalMatches(query);
  el('search-count').textContent = matches.length + Number(general.profile) + Number(general.memo) + '件見つかりました。';
  for (const [key, label] of [['profile', '基本情報'], ['memo', 'メモ']] as const) {
    if (general[key]) {
      const result = node('article', '', 'record-card');
      result.append(node('h3', label), node('p', key === 'memo' ? state.text.slice(0, 250) : PROFILE_FIELDS.map(field => textValue(state.profile[field.key])).filter(Boolean).join(' / ')));
      result.append(action('ホームで確認', () => { navigate('home'); (key === 'memo' ? memo : el<HTMLInputElement>('profile-department')).focus(); }));
      root.append(result);
    }
  }
  for (const match of matches) root.append(entryCard(match.section, match.entry));
  if (!root.childElementCount) root.append(node('p', '一致する記録はありません。キーワードを変更してください。', 'empty'));
}
function render() {
  renderHome(); renderRecords();
  if (currentView === 'search') renderSearch();
}
function navigate(view: string) {
  if (!['home', 'data', 'help', 'search'].includes(view) && !sectionById(view)) return;
  currentView = view;
  recordQuery = ''; recordFilter = 'all';
  el<HTMLInputElement>('record-query').value = '';
  el<HTMLSelectElement>('completion-filter').value = 'all';
  document.querySelectorAll<HTMLButtonElement>('#navigation [data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== (sectionById(view) ? 'records' : view); });
  render();
  el('main').focus();
}
function buildPrint(all: boolean) {
  const target = el('print-area'); target.replaceChildren(node('h1', '異動引継ぎノート'));
  const counts = completion(state);
  target.append(node('p', '確認済み ' + counts.done + ' / ' + counts.total + '件'));
  const includeHome = all || currentView === 'home' || currentView === 'data' || currentView === 'help';
  const searchQuery = el<HTMLInputElement>('global-query').value.trim();
  const matches = currentView === 'search' && searchQuery ? generalMatches(searchQuery) : { profile: false, memo: false };
  if (includeHome || matches.profile) {
    target.append(node('h2', '基本情報'));
    for (const field of PROFILE_FIELDS) target.append(node('p', field.label + '：' + (textValue(state.profile[field.key]) || '未入力')));
  }
  if (includeHome || matches.memo) {
    target.append(node('h2', 'メモ'), node('p', state.text || '未入力', 'print-memo'));
    target.lastElementChild!.id = 'print-text';
  }
  const items = all ? SECTIONS.flatMap(section => state.sections[section.id].map(entry => ({ section, entry }))) : currentView === 'search' ? (searchQuery ? searchEntries(state, searchQuery) : []) : sectionById(currentView) ? visibleRecords(sectionById(currentView)!).map(entry => ({ section: sectionById(currentView)!, entry })) : [];
  for (const section of SECTIONS) {
    let rows = items.filter(item => item.section.id === section.id);
    if (!all && !rows.length) continue;
    target.append(node('h2', section.label));
    if (section.id === 'schedule') rows = rows.sort((a, b) => MONTHS.indexOf(textValue(a.entry.month)) - MONTHS.indexOf(textValue(b.entry.month)));
    if (!rows.length) target.append(node('p', '登録なし'));
    for (const row of rows) target.append(entryCard(section, row.entry, true));
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view!)));
el('add-record').addEventListener('click', () => { const section = sectionById(currentView); if (section) openEditor(section); });
el('close-edit').addEventListener('click', () => closeEdit());
el('cancel-edit').addEventListener('click', () => closeEdit());
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEdit(); });
form.addEventListener('input', () => {
  if (dialog.open) {
    savedLabel('編集中：登録・保存で確定', true);
    el('draft-save-status').textContent = drafts.save(draftFormValues(form)) ? (practiceMode ? '下書きをこの画面内に保持しました。再読込みすると消えます。' : '下書きをこのブラウザ内に保存しました。登録・保存で確定します。') : '下書きは未保存です。容量・保存制限や別画面での変更を確認し、閉じる前に登録・保存してください。';
  }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!editing) return;
  try {
    const { section, id } = editing;
    if (!id && completion(state).total >= MAX_RECORDS) throw new Error('記録は合計3,000件までです。必要なデータを書き出し、記録を整理してください。');
    const values: Record<string, unknown> = {};
    for (const field of section.fields) values[field.key] = el<HTMLInputElement>('field-' + field.key).value;
    const old = id ? state.sections[section.id].find(row => row.id === id) : undefined;
    const entry = validateEntry({ ...old, ...values, id: id ?? crypto.randomUUID(), completed: el<HTMLInputElement>('entry-completed').checked }, section);
    const rows = id ? state.sections[section.id].map(row => row.id === id ? entry : row) : [...state.sections[section.id], entry];
    const next = { ...state, sections: { ...state.sections, [section.id]: rows } };
    serializeHandover(next);
    if (commit(next)) {
      closeEdit(true);
      message(unsaved ? '画面に反映しましたが、ブラウザ内に保存できていません。JSONを書き出してください。' : id ? '変更を保存しました。' : '記録を登録しました。', unsaved);
    }
  } catch (error) {
    el('form-error').textContent = error instanceof Error ? error.message : '登録できませんでした。入力内容を確認してください。';
  }
});
memo.addEventListener('input', () => {
  try {
    const next = { ...state, text: memo.value };
    serializeHandover(next); state = next; writeState();
    el('count').textContent = memo.value.length.toLocaleString('ja-JP') + ' / 50,000文字';
  } catch (error) {
    memo.value = state.text;
    message(error instanceof Error ? error.message : 'メモを保存できませんでした。', true);
  }
});
el('record-query').addEventListener('input', () => { recordQuery = el<HTMLInputElement>('record-query').value; renderRecords(); });
el('completion-filter').addEventListener('change', () => { recordFilter = el<HTMLSelectElement>('completion-filter').value; renderRecords(); });
el('global-query').addEventListener('input', renderSearch);
el('save-now').addEventListener('click', () => { if (writeState()) message('現在のデータを保存しました。'); });
el('export').addEventListener('click', () => {
  try {
    const blob = new Blob([serializeHandover(practiceMode ? { ...state,sampleData:true } : state)], { type: 'application/json;charset=utf-8' });
    const link = node('a');
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    link.href = url; link.download = 'handover-note-backup-' + date + '.json';
    if (practiceMode) link.download = 'sample-' + link.download;
    document.body.append(link); link.click(); link.remove();
    dispatchEvent(new Event('tool-backup-export'));
    // Delay revocation only for the browser's download handoff; never used for app state.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('バックアップのダウンロードを開始しました。保存先を確認してください。');
  } catch (error) { message(error instanceof Error ? error.message : 'バックアップを書き出せませんでした。', true); }
});
el('import').addEventListener('click', () => el<HTMLInputElement>('import-file').click());
el('import-file').addEventListener('change', async () => {
  const picker = el<HTMLInputElement>('import-file');
  const file = picker.files?.[0]; picker.value = '';
  if (!file || importBusy) return;
  importBusy = true;
  el<HTMLButtonElement>('import').disabled = true;
  try {
    checkHandoverFile(file);
    message('バックアップを確認しています。');
    const incoming = parseHandoverText(await file.text());
    const describe = (data: HandoverData) => Object.fromEntries([...SECTIONS.map(section => [section.label + '件数', data.sections[section.id].length]), ['メモ文字数',data.text.length]]);
    if (!confirm(backupComparison('異動引継ぎノート', file.name, describe(state), describe(incoming), incoming.exportedAt, incoming.sampleData === true))) { message('読込みをキャンセルしました。'); return; }
    if (blocked === 'corrupt') blocked = null;
    if (commit(incoming)) { renderProfile(); message(unsaved ? '読込みましたが、未保存です。JSONを書き出してください。' : 'バックアップを読み込みました。', unsaved); }
  } catch (error) { message((error instanceof Error ? error.message : 'ファイルを読み込めませんでした。') + '現在のデータは変更していません。', true); }
  finally { importBusy = false; el<HTMLButtonElement>('import').disabled = false; }
});
el('reload-data').addEventListener('click', () => {
  if (!confirm('この画面の内容を破棄して、保存済みデータを読み直しますか？必要な内容は先にJSONへ書き出してください。')) return;
  el('storage-warning').hidden = true;
  loadState(); renderProfile(); render();
});
el('clear').addEventListener('click', () => {
  el<HTMLInputElement>('clear-confirm').value = '';
  el<HTMLButtonElement>('confirm-clear').disabled = true;
  el('clear-error').textContent = '';
  clearDialog.showModal();
  el<HTMLInputElement>('clear-confirm').focus();
});
el('clear-confirm').addEventListener('input', () => { el<HTMLButtonElement>('confirm-clear').disabled = el<HTMLInputElement>('clear-confirm').value !== 'すべて削除'; });
el('cancel-clear').addEventListener('click', () => clearDialog.close());
el('confirm-clear').addEventListener('click', () => {
  if (el<HTMLInputElement>('clear-confirm').value !== 'すべて削除') return;
  try {
    if (!practiceMode && localStorage.getItem(HANDOVER_KEY) !== lastRaw) throw new Error('別の画面でデータが変更されています。保存済みデータを読み直してから削除してください。');
    // Store an empty valid document to prevent an old preview memo from reappearing.
    const empty = freshData();
    const raw = serializeHandover(empty);
    if (!practiceMode) localStorage.setItem(HANDOVER_KEY, raw);
    lastRaw = raw; state = empty; blocked = null; unsaved = false;
    el('storage-warning').hidden = true;
    savedLabel('このブラウザ内に自動保存済み'); clearDialog.close(); renderProfile(); render();
    message('このバージョンのデータを削除しました。旧版の保存領域とJSONファイルは残っています。');
  } catch (error) { el('clear-error').textContent = (error instanceof Error ? error.message : '保存領域を更新できませんでした。') + '現在のデータは変更していません。'; }
});
el('print').addEventListener('click', () => { buildPrint(true); window.print(); });
el('print-current').addEventListener('click', () => { buildPrint(false); window.print(); });
addEventListener('beforeprint', () => { if (!el('print-area').childElementCount) buildPrint(true); });
addEventListener('afterprint', () => el('print-area').replaceChildren());
addEventListener('storage', event => {
  if (practiceMode) return;
  if ((event.key === HANDOVER_KEY || event.key === null) && event.newValue !== lastRaw) {
    blocked = 'conflict';
    savedLabel('別の画面で変更：保存を停止中', true);
    storageWarning('別の画面で保存データが変更されました。この画面の内容は保持しています。JSONに書き出すか、保存済みデータを読み直してください。');
  }
});
addEventListener('beforeunload', event => {
  if (unsaved || editDirty()) event.preventDefault();
});

loadState(); renderProfile(); render();

el('suspend-edit').addEventListener('click', () => {
  if (drafts.save(draftFormValues(form))) { dialog.close(); el('resume-draft').focus(); }
  else el('draft-save-status').textContent = '下書きを保存できません。編集中の内容を登録・保存するか、手元に控えてください。';
});
