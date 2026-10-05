import { node, action } from './dom.ts';
import { isObject } from './fields.ts';

export interface EditDraft {
  schemaVersion: 1; toolId: string; section: string; id: string | null;
  base: string | null; values: Record<string, string | boolean>; updatedAt: string;
}
export function draftFormValues(form: HTMLFormElement) {
  return Object.fromEntries([...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')].map(input => [input.name || input.id, input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value]));
}
export function restoreDraftValues(form: HTMLFormElement, values: EditDraft['values']) {
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')) {
    const value = values[input.name || input.id];
    if (input instanceof HTMLInputElement && input.type === 'checkbox' && typeof value === 'boolean') input.checked = value;
    else if (typeof value === 'string') input.value = value;
  }
}
export function parseEditDraft(raw: string, toolId: string): EditDraft {
  if (raw.length > 600000) throw new Error('下書きの容量が上限を超えています。');
  const data: unknown = JSON.parse(raw);
  if (!isObject(data) || data.schemaVersion !== 1 || data.toolId !== toolId || typeof data.section !== 'string' || (data.id !== null && typeof data.id !== 'string') || (data.base !== null && typeof data.base !== 'string') || !isObject(data.values) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('下書きの形式が正しくありません。');
  if (Object.keys(data.values).length > 40 || Object.values(data.values).some(value => typeof value !== 'boolean' && (typeof value !== 'string' || value.length > 50000))) throw new Error('下書きの項目が正しくありません。');
  return data as unknown as EditDraft;
}
export function createEditDraft(toolId: string, restore: (draft: EditDraft) => void, memoryOnly = false) {
  const key = 'municipal-toolbox:draft:v1:' + toolId;
  let raw: string | null = null;
  let active: Pick<EditDraft, 'section' | 'id' | 'base'> | null = null;
  const panel = node('section', '', 'draft-panel content-panel'); panel.id = 'draft-panel';
  panel.setAttribute('aria-label', '編集中の下書き');
  const title = node('h2', '編集中の下書き');
  const message = node('p'); message.id = 'draft-message'; message.setAttribute('role', 'status');
  const resume = action('下書きを再開', () => {
    try { if (raw) restore(parseEditDraft(raw, toolId)); }
    catch { message.textContent = '下書きを復元できません。下書きを書き出して内容を保管してください。'; }
  }); resume.id = 'resume-draft';
  const discard = action('下書きを削除', () => { if (confirm('編集中の下書きを削除しますか？確定済みの記録は削除しません。')) clear(); }, 'danger'); discard.id = 'discard-draft';
  const exportDraft = action('下書きを書き出す', () => {
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type:'application/json;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = (memoryOnly ? 'sample-' : '') + toolId + '-draft.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    message.textContent = '下書きのJSONを書き出しました。内容の保管用です。通常のバックアップ読込みには使用できません。';
  });
  panel.append(title, message, resume, discard, exportDraft);
  document.getElementById('feedback')!.after(panel);
  function render() {
    panel.hidden = raw === null;
    exportDraft.disabled = raw === null;
    if (!raw) return;
    try {
      const draft = parseEditDraft(raw, toolId); resume.disabled = false;
      message.textContent = '未確定の下書き1件があります。' + (memoryOnly ? 'この画面内での保持日時：' : '保存日時：') + new Date(draft.updatedAt).toLocaleString('ja-JP') + '。確定済みの記録・通常のJSONバックアップ・印刷には含まれません。';
    } catch { resume.disabled = true; message.textContent = '下書きの形式を読めません。元の内容は保持しています。「下書きを書き出す」で保管できます。'; }
  }
  try { raw = memoryOnly ? null : localStorage.getItem(key); render(); }
  catch { panel.hidden = false; resume.disabled = true; discard.disabled = true; exportDraft.disabled = true; message.textContent = '下書きの保存領域を利用できません。入力後は登録・保存で確定し、JSONを書き出してください。'; }
  function clear() {
    try {
      if (!memoryOnly && localStorage.getItem(key) !== raw) throw new Error('別の画面で下書きが変更されています。再読込みして確認してください。');
      if (!memoryOnly) localStorage.removeItem(key);
      raw = null; active = null; render(); return true;
    } catch (error) { panel.hidden = false; message.textContent = error instanceof Error ? error.message : '下書きを削除できません。'; return false; }
  }
  function start(section: string, id: string | null, base: string | null, restoring = false) {
    if (raw && !restoring) { panel.hidden = false; message.textContent = '保存済みの下書きがあります。先に再開するか、内容を確認して下書きを削除してください。'; resume.focus(); return false; }
    active = { section,id,base }; return true;
  }
  function save(values: Record<string,string|boolean>) {
    if (!active) return false;
    const next = JSON.stringify({ schemaVersion:1,toolId,...active,values,updatedAt:new Date().toISOString() });
    try {
      parseEditDraft(next,toolId);
      if (!memoryOnly && localStorage.getItem(key) !== raw) throw new Error('別の画面で下書きが変更されています。上書きしていません。編集中の内容を登録するか、手元に控えてください。');
      if (!memoryOnly) localStorage.setItem(key,next);
      raw = next; render(); return true;
    } catch (error) {
      panel.hidden = false; message.textContent = '下書きは未保存です。' + (error instanceof Error && error.message.includes('別の画面') ? error.message : 'ブラウザの容量や保存制限を確認し、画面を閉じる前に登録・保存してください。');
      return false;
    }
  }
  return { start,save,clear, get exists() { return raw !== null; } };
}
