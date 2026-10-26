import { node, action, el, trapDialogFocus } from './dom.ts';

export function recoveryRevision(data: unknown, storageKey: string, memoryOnly = false) {
  let stored: string | null = null;
  try { stored = memoryOnly ? null : localStorage.getItem(storageKey); } catch { stored = 'storage-unavailable'; }
  return JSON.stringify([data, stored]);
}

export function createRecoveryControls(revision: () => string) {
  const panel = node('aside', '', 'recovery-panel storage-strip'); panel.hidden = true;
  panel.setAttribute('aria-label', '直前の操作の取消');
  const status = node('p'); status.setAttribute('role', 'status');
  let expected = '', restore: (() => boolean) | null = null;
  const undo = action('直前の操作を取り消す', () => {
    if (!restore) return;
    if (revision() !== expected) {
      restore = null; undo.disabled = true;
      status.textContent = '操作後にデータが変更されています。新しい内容を保護するため、取り消せません。';
      return;
    }
    const apply = restore;
    if (apply()) { restore = null; undo.disabled = true; panel.hidden = false; status.textContent = '直前の操作を取り消しました。保存状態を確認してください。'; }
  }); undo.id = 'undo-last';
  panel.append(status, undo, node('p', '取消用の内容はこの画面だけに保持します。別の変更や再読込みで失われます。JSONバックアップとは別です。', 'muted'));
  el('feedback').after(panel);
  return {
    invalidate() { restore = null; undo.disabled = true; panel.hidden = true; },
    remember(label: string, apply: () => boolean) {
      expected = revision(); restore = apply; undo.disabled = false; panel.hidden = false;
      status.textContent = label + '。別の変更を行う前なら取り消せます。';
    },
  };
}

export function setupBackupPreparation() {
  const modal = node('dialog'); modal.id = 'prepare-import-dialog';
  modal.setAttribute('aria-labelledby', 'prepare-import-title');
  const title = node('h2', 'バックアップ読込み前の保存'); title.id = 'prepare-import-title';
  const exportCurrent = action('現在のデータを書き出す', () => el<HTMLButtonElement>('export').click()); exportCurrent.id = 'export-before-import';
  const choose = action('読込みファイルを選ぶ', () => { modal.close(); el<HTMLInputElement>('import-file').click(); }); choose.id = 'choose-import-file';
  const cancel = action('キャンセル', () => modal.close());
  const actions = node('div', '', 'dialog-actions'); actions.append(exportCurrent, choose, cancel);
  modal.append(title, node('p', 'JSONを読み込むと、確定済みデータ全体を置き換えます。現在の内容が必要な場合は、先にJSONを書き出し、保存先でファイルを確認してください。'), node('p', '下書きは別に残ります。ファイルを選んだ後に、対象ツールと件数を確認します。'), actions);
  document.body.append(modal); trapDialogFocus(modal);
  el('import').addEventListener('click', () => { modal.showModal(); exportCurrent.focus(); });
}
