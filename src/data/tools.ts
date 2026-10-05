import type { CategoryId } from './categories';

export interface Tool {
  id: string;
  name: string;
  description: string;
  summary: string;
  category: CategoryId;
  icon: string;
  tags: string[];
  features: string[];
  useCases: string[];
  version: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  status: 'preview' | 'ready';
  downloads: { txt: string; html: string };
  demo: string | null;
  network: false;
  account: false;
  externalLibrary: false;
  implementation?: { featureNote: string; storageDescription: string; printLabel: string; extraOutputs: string[] };
}

const definitions = [
  { id: 'handover-note', name: '異動引継ぎノート', description: '担当業務、年間予定、関係者、引継ぎ状況を管理。', summary: '異動・退職時に伝えておきたい担当業務、年間予定、関係者、ファイルの場所を一か所に整理するツールです。', category: 'handover', icon: 'notebook', tags: ['引継ぎ', '年間予定', '検索', 'JSON'], features: ['担当業務管理', '年間予定', '関係者リスト', 'ファイル保存場所', '申し送り事項', 'チェックリスト', '完成度チェック', '全文検索', 'JSONバックアップ'], useCases: ['異動前に、担当業務を少しずつ整理したい', '後任の方が迷わず仕事を始められるようにしたい'] },
  { id: 'equipment-manager', name: '備品管理台帳', description: '管理番号、設置場所、購入日、備品の状態を記録。', summary: '管理番号、設置場所、購入日、状態を整理して、部署内の備品を把握するための台帳です。', category: 'equipment', icon: 'box', tags: ['台帳', '備品', 'CSV'], features: ['備品登録', '管理番号', 'カテゴリ', '設置場所', '購入日', '状態管理', 'CSV出力', 'CSV読込み'], useCases: ['部署にある備品と保管場所を把握したい', '年度末の備品確認をスムーズに進めたい'] },
  { id: 'lending-manager', name: '貸出・返却管理', description: '備品の貸出先、返却予定、利用履歴を管理。', summary: '備品の貸出先と返却予定を記録し、返却漏れを防ぐための管理ツールです。', category: 'equipment', icon: 'exchange', tags: ['貸出', '備品', '履歴'], features: ['備品一覧', '貸出登録', '返却処理', '貸出者管理', '返却予定', '延滞表示', '利用履歴'], useCases: ['共有備品の貸出状況を確認したい', '返却予定日を過ぎた備品を見つけたい'] },
  { id: 'inventory-manager', name: '消耗品在庫管理', description: '消耗品の在庫数、入出庫、補充基準を管理。', summary: '消耗品の入庫・出庫と最低在庫を管理し、補充が必要なものを確認するツールです。', category: 'equipment', icon: 'layers', tags: ['在庫', '備品', '台帳'], features: ['在庫数量', '最低在庫の設定', '入庫記録', '出庫記録', '在庫不足表示'], useCases: ['用紙や文具の在庫を管理したい', '必要なタイミングで補充を行いたい'] },
  { id: 'annual-calendar', name: '年間業務カレンダー', description: '定例業務とイベントを月・週・一覧で確認。', summary: '年間の定例業務とイベントを、月・週・一覧の表示で整理するカレンダーです。', category: 'date', icon: 'calendar', tags: ['年間予定', 'カレンダー', '印刷'], features: ['年間予定', '月表示', '週表示', '一覧表示', '定例業務', 'イベント', '印刷'], useCases: ['年度を通した業務の流れを把握したい', '部署の年間予定を印刷して共有したい'] },
  { id: 'meeting-minutes', name: '会議メモ・議事録', description: '会議の議題、メモ、決定事項、TODOを記録。', summary: '会議の基本情報から議題、決定事項、TODOまでを一緒に記録するツールです。', category: 'meetings', icon: 'users', tags: ['会議', '文書', '印刷'], features: ['会議名・日時・場所', '出席者', '議題', 'メモ', '決定事項', 'TODO', '印刷'], useCases: ['会議中に決定事項とTODOを整理したい', '読みやすい議事録を印刷したい'] },
  { id: 'inquiry-log', name: '問い合わせ記録', description: '問い合わせの内容、回答、対応状況を記録。', summary: '問い合わせの内容と回答、対応者、進捗を記録し、過去の対応を探しやすくするツールです。', category: 'counter', icon: 'message', tags: ['窓口', '検索', 'CSV'], features: ['受付日', '分類', '内容', '対応者', '回答', '状態管理', '検索', 'CSV出力'], useCases: ['問い合わせへの対応漏れを防ぎたい', '同じ質問に対する過去の回答を確認したい'] },
  { id: 'event-manager', name: 'イベント進行管理', description: 'イベントのタスク、担当、締切、参加者を管理。', summary: 'イベントの基本情報、タスク、担当、締切、参加者、資料をまとめて管理するツールです。', category: 'events', icon: 'flag', tags: ['イベント', 'チェックリスト', 'タスク'], features: ['イベント基本情報', 'タスク', '担当・締切', '参加者', '資料', '当日チェックリスト'], useCases: ['行事の準備と担当者を整理したい', '当日の確認事項を一覧にしておきたい'] },
] satisfies Array<Pick<Tool, 'id' | 'name' | 'description' | 'summary' | 'category' | 'icon' | 'tags' | 'features' | 'useCases'>>;

const releases: Partial<Record<string, { version: string; status: Tool['status']; implementation: NonNullable<Tool['implementation']> }>> = {
  'handover-note': { version: '1.1.0', status: 'ready', implementation: {
    featureNote: '6分類の記録を登録・編集・削除できます。年間予定は4月から翌年3月の月別表示です。完成度は、登録した記録のうち確認済みにした割合を表示します。',
    storageDescription: 'すべての記録と基本情報・メモをブラウザ内に保存し、JSONで書き出せます。配布確認版のメモとJSONも読み込めます。',
    printLabel: '全記録・表示中の一覧の印刷', extraOutputs: [],
  } },
  'equipment-manager': { version: '1.1.0', status: 'ready', implementation: {
    featureNote: '備品の管理番号、備品名、カテゴリ、設置場所、購入日、状態、備考を登録・編集・削除できます。検索・絞り込み・並び替えと、全件または絞り込み結果のCSV出力と、列の対応を確認するCSV読込みに対応しています。',
    storageDescription: '全備品とメモをブラウザ内に保存し、JSONで書き出せます。配布確認版のメモとJSONも読み込めます。CSVから備品を追加できます。メモ・ID・拡張項目を含む復元にはJSONを使用してください。',
    printLabel: '全データ・絞り込み結果の印刷', extraOutputs: ['全件・絞り込み結果のCSV出力'],
  } },
};

export const tools: Tool[] = definitions.map((tool, order) => ({
  ...tool, order, version: '0.1.1-preview', createdAt: '2026-10-05', updatedAt: '2026-10-05', status: 'preview',
  ...releases[tool.id],
  downloads: { txt: `/downloads/${tool.id}.txt`, html: `/downloads/${tool.id}.html` },
  demo: releases[tool.id] ? `/downloads/${tool.id}.html#sample` : null, network: false, account: false, externalLibrary: false,
}));

export const distributionSummary = tools.filter(tool => tool.status === 'ready').map(tool => tool.name).join('、') + 'は業務機能を実装済みです。他の' + tools.filter(tool => tool.status === 'preview').length + '件は配布確認版です。';
