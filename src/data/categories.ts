export const categories = [
  { id: 'handover', name: '引継ぎ', icon: 'notebook', description: '担当業務・年間予定・関係者を記録。' },
  { id: 'equipment', name: '備品', icon: 'box', description: '備品・貸出・在庫を管理。' },
  { id: 'documents', name: '文書', icon: 'file', description: '文書の作成と保存場所の整理。' },
  { id: 'meetings', name: '会議', icon: 'users', description: '議題・議事録・決定事項を記録。' },
  { id: 'counter', name: '窓口', icon: 'message', description: '問い合わせと対応を整理。' },
  { id: 'events', name: 'イベント', icon: 'flag', description: 'イベントの準備・タスク・当日進行を管理。' },
  { id: 'aggregation', name: '集計', icon: 'chart', description: '数値の集計と結果の確認。' },
  { id: 'date', name: '日付・計算', icon: 'calendar', description: '予定の管理と日付の計算。' },
  { id: 'other', name: 'その他', icon: 'grid', description: 'その他の業務用ツール。' },
] as const;
export type CategoryId = typeof categories[number]['id'];
export const categoryById = (id: CategoryId) => categories.find(category => category.id === id)!;
