import { node, action, trapDialogFocus } from './dom.ts';

export function setupToolShell(config: { id: string; name: string; version: string; ready: boolean }) {
  const sampleMode = config.ready && location.hash === '#sample';
  const header = document.querySelector('body > header')!;
  let controls = header.querySelector('.header-actions');
  if (!controls) { controls = node('div', '', 'header-actions'); controls.append(document.getElementById('save-status')!); header.append(controls); }
  const help = controls.querySelector('[data-view="help"]');
  if (help) { help.textContent = 'Help'; help.setAttribute('aria-label', 'Help（使い方）'); }
  const updates = node('dialog'); updates.id = 'updates-dialog'; updates.setAttribute('aria-labelledby', 'updates-title');
  const title = node('h2', '更新情報'); title.id = 'updates-title';
  updates.append(title, node('p', config.name + ' v' + config.version), node('p', '2026-10-05：右上の更新情報・配色切替・Helpと、保存先・バックアップの案内を追加しました。'));
  if (config.ready) updates.append(node('p','2026-10-27：全8ツールの業務機能と、架空データを操作できる専用デモページを公開しました。デモは通常の保存データから分離し、初期状態に戻せます。'));
  if (config.ready) updates.append(node('p','2026-10-26：直前の削除の取消、読込み前の書出し操作、下書きJSONの専用読込みを追加しました。'));
  if (config.id === 'equipment-manager') updates.append(node('p','管理番号で照合するCSV更新と変更前後の確認、CSV反映の取消、棚卸確認日・確認者・差異メモを追加しました。'));
  if (config.id === 'handover-note') updates.append(node('p','分類別の記入例と、申し送り事項・チェックリストの期限順表示を追加しました。'));
  if (!config.ready) updates.append(node('p','2026-10-26：配布ファイルの共通スタイルを更新しました。業務機能は未実装です。'));
  updates.append(node('p', 'JSONを読み込む前に、対象ツール・ファイル・書出し日時・件数を確認できます。'));
  if (config.ready) updates.append(node('p', '編集中の下書き保存・再開と、架空データで操作を試せるサンプルを追加しました。'));
  if (config.id === 'equipment-manager') updates.append(node('p', 'CSVから備品を追加できます。列の対応・重複・入力内容を検証し、プレビューで確認してから取り込みます。'));
  updates.append(node('p', config.ready ? '業務機能を実装済みです。更新情報はこのファイルに含まれる内容を表示します。更新の自動取得は行いません。' : '配布確認版です。メモの保存・JSON・印刷を確認できます。業務機能は未実装です。'));
  const close = action('閉じる', () => updates.close()); close.id = 'close-updates'; updates.append(close);
  document.body.append(updates); trapDialogFocus(updates);
  const open = action('更新情報', () => { updates.showModal(); close.focus(); }); open.id = 'open-updates';
  const theme = action('ダークモード', () => {}); theme.dataset.themeToggle = ''; theme.disabled = true;
  controls.insertBefore(open, help); controls.insertBefore(theme, help);
  if (!help) { const link = node('a', 'Help', 'secondary shell-help'); link.href = '#help'; link.setAttribute('aria-label', 'Help（使い方）'); controls.append(link); }
  const strip = node('aside', '', 'storage-strip'); strip.setAttribute('aria-label', '保存先とバックアップ');
  strip.append(node('p', '保存先はこのブラウザ内です。HTMLファイルには入力データを保存しません。'));
  const details = node('details'); details.append(node('summary', 'バックアップとPC移行の手順'));
  details.append(node('p', '作業後は「バックアップを書き出す」でJSONを保存し、保存先でファイルを確認してください。ブラウザ内の自動保存とは別の操作です。'));
  details.append(node('p', 'PC・ブラウザ・ファイルの場所を変える前にJSONを書き出します。移行先で同じツールを開き、JSONを読み込んで内容を確認してください。HTMLだけをコピーしても入力データは移りません。'));
  details.append(node('p', '共有PCでは同じブラウザを使う人が保存内容を閲覧できる場合があります。組織で許可された保存先を使ってください。'));
  const stamp = node('p'); stamp.id = 'backup-operation';
  const metaKey = 'municipal-toolbox:export-operation:v1:' + config.id;
  function showDate(value: string | null) {
    const date = value ? new Date(value) : null;
    stamp.textContent = date && Number.isFinite(date.valueOf()) ? '最終書出し操作：' + date.toLocaleString('ja-JP') + '。ファイルの保存完了は保存先で確認してください。' : 'このブラウザでの書出し操作は未記録です。';
  }
  try { showDate(sampleMode ? null : localStorage.getItem(metaKey)); } catch { showDate(null); }
  details.append(stamp); strip.append(details);
  const themeNotice = node('p'); themeNotice.dataset.themeNotice = ''; themeNotice.setAttribute('role', 'status'); strip.append(themeNotice);
  header.after(strip);
  if (config.ready) {
    const banner = node('aside', '', sampleMode ? 'sample-banner warning' : 'sample-banner storage-strip'); banner.id = 'sample-banner';
    if (sampleMode) {
      banner.append(node('strong', 'サンプル体験中'), node('p', 'これはデモ版です。入力内容は実際の業務には使用しないでください。架空データで操作を試せます。通常の保存データと下書きは読み書きしません。変更はこの画面内だけに保持し、再読込みすると初期のサンプルへ戻ります。'));
      const embedded = window.self !== window.top;
      banner.append(action(embedded ? 'サンプルをリセット' : 'サンプルを終了', () => { if (embedded && !confirm('デモでの変更を破棄して初期状態に戻しますか？')) return; if (!embedded) location.hash = ''; location.reload(); }));
      strip.firstElementChild!.textContent = 'サンプル体験中：変更はこの画面内だけに保持します。';
    } else {
      const link = node('a', 'サンプルで試す（別画面）'); link.href = location.pathname + location.search + '#sample'; link.target = '_blank'; link.rel = 'noopener';
      banner.append(link, node('p', '架空データを使います。現在の保存データは変更しません。'));
    }
    strip.after(banner);
  }
  addEventListener('tool-backup-export', () => {
    const date = new Date().toISOString(); showDate(date);
    if (sampleMode) { stamp.textContent = 'サンプルの書出し操作：' + new Date(date).toLocaleString('ja-JP') + '。通常のバックアップ操作日時は変更していません。'; return; }
    try { localStorage.setItem(metaKey, date); } catch { stamp.append(' 操作日時はこの画面だけに表示しています。'); }
  });
}
