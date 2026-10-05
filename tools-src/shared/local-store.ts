export type StoreStatus = 'empty' | 'saved' | 'unavailable' | 'corrupt' | 'conflict';
export interface StoreNotice { status: StoreStatus; message: string; dirty: boolean; }
export function createLocalStore<T>(options: {
  key: string; legacyKey: string; fresh: () => T; parse: (text: string) => T;
  serialize: (data: T) => string; onNotice: (notice: StoreNotice) => void;
  memoryOnly?: boolean;
}) {
  let data = options.fresh();
  let lastRaw: string | null = null;
  let blocked: 'corrupt' | 'conflict' | null = null;
  let dirty = false;
  function notify(status: StoreStatus, message: string) { options.onNotice({ status, message, dirty }); }
  function conflict() {
    blocked = 'conflict';
    notify('conflict', '別の画面で保存データが変更されました。この画面の内容をJSONに書き出し、保存済みデータを読み直してください。');
    return false;
  }
  function save() {
    if (options.memoryOnly) { dirty = false; notify('saved', 'サンプル：変更はこの画面内だけに保持します。'); return true; }
    if (blocked) {
      notify(blocked, blocked === 'corrupt' ? '保存データは上書きしません。有効なJSONを読み込むか、データ管理で初期化してください。' : '別の画面で変更されています。この画面の内容をJSONに書き出し、保存済みデータを読み直してください。');
      return false;
    }
    try {
      if (localStorage.getItem(options.key) !== lastRaw) return conflict();
      const raw = options.serialize(data);
      localStorage.setItem(options.key, raw);
      lastRaw = raw; dirty = false;
      notify('saved', '自動保存済み');
      return true;
    } catch {
      dirty = true;
      notify('unavailable', 'ブラウザ内に保存できません。容量不足や保存制限を確認し、画面を閉じる前にJSONを書き出してください。');
      return false;
    }
  }
  function load() {
    data = options.fresh(); dirty = false; blocked = null;
    if (options.memoryOnly) { notify('empty', 'サンプル'); return; }
    try {
      lastRaw = localStorage.getItem(options.key);
      const raw = lastRaw ?? localStorage.getItem(options.legacyKey);
      if (raw === null) { notify('empty', '未入力'); return; }
      try { data = options.parse(raw); options.serialize(data); }
      catch (error) {
        data = options.fresh(); blocked = 'corrupt';
        notify('corrupt', '保存データを読めません。既存データは保護しています。' + (error instanceof Error ? error.message : '有効なJSONを読み込んでください。'));
        return;
      }
      if (lastRaw === null) {
        dirty = true;
        if (save()) notify('saved', '旧版のメモを移行しました。旧版の保存領域は変更していません。');
      } else notify('saved', '自動保存済み');
    } catch {
      dirty = true;
      notify('unavailable', 'ブラウザの保存機能を利用できません。入力後はJSONを書き出してください。');
    }
  }
  function replace(next: T, replaceCorrupt = false) {
    options.serialize(next);
    data = next; dirty = true;
    if (replaceCorrupt && blocked === 'corrupt') blocked = null;
    return save();
  }
  function clear() {
    if (options.memoryOnly) { data = options.fresh(); dirty = false; notify('empty', 'サンプル'); return; }
    let currentRaw: string | null;
    try { currentRaw = localStorage.getItem(options.key); }
    catch { throw new Error('保存領域を読み取れません。ブラウザの保存制限を確認してください。'); }
    if (blocked === 'conflict' || currentRaw !== lastRaw) throw new Error('別の画面でデータが変更されています。保存済みデータを読み直してから削除してください。');
    const empty = options.fresh();
    const raw = options.serialize(empty);
    try { localStorage.setItem(options.key, raw); }
    catch { throw new Error('保存領域を更新できません。ブラウザの保存容量や保存制限を確認してください。'); }
    lastRaw = raw; data = empty; blocked = null; dirty = false;
    notify('saved', '自動保存済み');
  }
  addEventListener('storage', event => {
    if (options.memoryOnly) return;
    if ((event.key === options.key || event.key === null) && event.newValue !== lastRaw) conflict();
  });
  return { get data() { return data; }, get dirty() { return dirty; }, load, replace, save, clear };
}
