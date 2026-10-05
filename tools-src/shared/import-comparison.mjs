export function backupComparison(name, fileName, before, after, exportedAt, sample = false) {
  const date = typeof exportedAt === 'string' && Number.isFinite(Date.parse(exportedAt)) ? new Date(exportedAt).toLocaleString('ja-JP') : '未記録または不明';
  const lines = ['JSON読込み前の確認', '対象ツール：' + name, 'ファイル：' + fileName, '書出し日時（JSONの記録）：' + date, '', '項目：現在 → 読込み後'];
  for (const label of Object.keys(before)) lines.push(label + '：' + before[label].toLocaleString('ja-JP') + ' → ' + after[label].toLocaleString('ja-JP'));
  if (sample) lines.push('', 'このJSONにはサンプルデータの印が付いています。');
  lines.push('', '確定済みのデータを、読込み後の内容ですべて置き換えます。追加や結合ではありません。', '下書きは別に保持します。必要な確定済みデータはキャンセルして先にJSONへ書き出してください。', '', 'この内容で置き換えますか？');
  return lines.join('\n');
}
