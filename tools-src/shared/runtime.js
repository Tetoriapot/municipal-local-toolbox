(() => {
  'use strict';
  const config = /* CONFIG */ {};
  /* BACKUP_HELPERS */
  const key = 'municipal-toolbox:preview:v1:' + config.id;
  const memo = document.getElementById('memo');
  const saveStatus = document.getElementById('save-status');
  const feedback = document.getElementById('feedback');
  const fileInput = document.getElementById('import-file');
  let protectedStorage = false;
  let originalBackup = {};
  let lastStoredRaw = null;
  let importBusy = false;
  let acceptedMemo = '';
  function statusText(message, unsaved = false) {
    saveStatus.textContent = message;
    saveStatus.classList.toggle('unsaved', unsaved);
  }
  function refresh() {
    document.getElementById('count').textContent = memo.value.length.toLocaleString('ja-JP') + ' / 50,000文字';
    document.getElementById('print-text').textContent = memo.value;
  }
  function save() {
    refresh();
    if (protectedStorage) {
      statusText('未保存：既存データを保護中', true);
      return false;
    }
    try {
      if (localStorage.getItem(key) !== lastStoredRaw) {
        statusText('未保存：別の画面で変更されています', true);
        feedback.textContent = 'この画面のメモをバックアップに書き出し、画面を再読込みしてください。他の画面のデータは上書きしません。';
        return false;
      }
      const raw = serializeBackup(makeBackup(config.id, memo.value, new Date().toISOString(), originalBackup));
      localStorage.setItem(key, raw);
      lastStoredRaw = raw;
      statusText('このブラウザ内に自動保存済み');
      return true;
    } catch {
      statusText('未保存：バックアップを書き出してください', true);
      return false;
    }
  }
  try {
    const raw = localStorage.getItem(key);
    lastStoredRaw = raw;
    if (raw !== null) {
      try {
        const data = JSON.parse(raw);
        memo.value = validateBackup(data, config.id);
        originalBackup = data;
        acceptedMemo = memo.value;
        statusText('このブラウザ内に自動保存済み');
      } catch {
        protectedStorage = true;
        statusText('保存データを読めません：未保存', true);
        feedback.textContent = '保存データに問題があります。既存データは上書きしません。必要なら元の保存領域を管理者に確認し、有効なJSONを読み込むか「すべてのデータを削除」で初期化してください。';
      }
    } else statusText('未入力');
  } catch {
    statusText('保存機能を利用できません：未保存', true);
  }
  refresh();
  memo.addEventListener('input', () => {
    try {
      serializeBackup(makeBackup(config.id, memo.value, new Date().toISOString(), originalBackup));
      acceptedMemo = memo.value;
      save();
    } catch (error) {
      memo.value = acceptedMemo;
      refresh();
      feedback.textContent = error.message + '直前の入力は反映していません。';
    }
  });
  document.getElementById('export').addEventListener('click', () => {
    let data;
    try { data = serializeBackup(makeBackup(config.id, memo.value, new Date().toISOString(), originalBackup)); }
    catch (error) { feedback.textContent = error.message; return; }
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    anchor.href = objectUrl; anchor.download = config.id + '-backup-' + date + '.json';
    document.body.append(anchor); anchor.click(); anchor.remove();
    dispatchEvent(new Event('tool-backup-export'));
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    feedback.textContent = 'バックアップのダウンロードを開始しました。保存先をご確認ください。';
  });
  document.getElementById('import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file || importBusy) return;
    importBusy = true;
    document.getElementById('import').disabled = true;
    let incoming;
    let incomingBackup;
    try {
      if (!/\.json$/i.test(file.name)) throw new Error('拡張子が.jsonのバックアップを選択してください。');
      if (!file.size) throw new Error('ファイルが空です。内容のあるJSONを選択してください。');
      if (file.type && !['application/json', 'text/json', 'text/plain', 'application/octet-stream'].includes(file.type)) throw new Error('JSONファイルとして認識できません。元のバックアップを選択してください。');
      if (file.size > MAX_FILE_BYTES) throw new Error('1MB以下のJSONファイルを選択してください。');
      incomingBackup = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      incoming = validateBackup(incomingBackup, config.id);
      serializeBackup(makeBackup(config.id, incoming, new Date().toISOString(), incomingBackup));
    } catch (error) {
      feedback.textContent = error instanceof SyntaxError ? 'JSONの形式が正しくありません。現在のメモは変更していません。' : error.message;
      return;
    } finally {
      importBusy = false;
      document.getElementById('import').disabled = false;
    }
    if (!confirm(backupComparison(config.name, file.name, { 'メモ文字数': memo.value.length }, { 'メモ文字数': incoming.length }, incomingBackup.exportedAt))) return;
    memo.value = incoming;
    acceptedMemo = incoming;
    originalBackup = incomingBackup;
    protectedStorage = false;
    const saved = save();
    feedback.textContent = saved ? 'バックアップを読み込みました。' : 'メモを読み込みましたが、ブラウザ内に保存できません。JSONを書き出して保管してください。';
  });
  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm('このツールのすべてのデータを削除しますか？この操作は取り消せません。必要な内容をバックアップしてください。')) return;
    try {
      if (localStorage.getItem(key) !== lastStoredRaw) {
        feedback.textContent = '別の画面でデータが変更されています。画面を再読込みしてから削除してください。';
        return;
      }
      localStorage.removeItem(key);
    } catch {
      feedback.textContent = '保存領域から削除できませんでした。メモは変更していません。';
      return;
    }
    protectedStorage = false; lastStoredRaw = null; originalBackup = {}; acceptedMemo = ''; memo.value = ''; refresh(); statusText('未入力');
    feedback.textContent = 'このツールのデータを削除しました。書き出したJSONファイルは削除されません。';
  });
  document.getElementById('print').addEventListener('click', () => { refresh(); window.print(); });
})();
