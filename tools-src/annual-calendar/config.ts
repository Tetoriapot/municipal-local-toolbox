import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'annual-calendar',name:'年間業務カレンダー',kind:'calendar',description:'定例業務・イベントを日付ごとに登録し、月・週・年度一覧で確認します。',
  sections:[{id:'events',label:'年間予定',titleKey:'title',fields:[{key:'title',label:'予定名',required:true},{key:'date',label:'日付',type:'date',required:true},{key:'time',label:'開始時刻',type:'time'},{key:'kind',label:'種別',type:'select',options:['定例業務','イベント'],required:true},{key:'owner',label:'担当者'},{key:'location',label:'場所'},{key:'details',label:'内容・備考',type:'textarea'}]}],
  help:['年間予定に予定名・日付・種別を入力します。種別は定例業務とイベントから選べます。定例業務も実施日ごとに登録してください。','月表示・週表示・年度一覧を切り替えられます。週は月曜日から日曜日、年度は選択した日付が属する4月から翌年3月です。表示する日付または前後の期間ボタンで移動します。','カレンダーの予定を押すと編集できます。狭い画面では日付ごとの縦並びで表示します。表示中の一覧の印刷は期間と検索条件に合う全件、全データの印刷は全年度を対象とします。'],
} satisfies BusinessConfig;
