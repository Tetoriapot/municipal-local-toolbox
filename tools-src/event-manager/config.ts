import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'event-manager',name:'イベント進行管理',kind:'event',description:'イベントの基本情報と、準備タスク・参加者・資料・当日チェックを関連付けて管理します。',
  sections:[
    {id:'events',label:'イベント基本情報',titleKey:'title',fields:[{key:'title',label:'イベント名',required:true},{key:'date',label:'開催日',type:'date',required:true},{key:'time',label:'開始時刻',type:'time'},{key:'location',label:'会場'},{key:'owner',label:'主担当'},{key:'purpose',label:'目的・内容',type:'textarea'}]},
    {id:'tasks',label:'準備タスク',titleKey:'title',fields:[{key:'eventId',label:'イベント',type:'reference',reference:'events',required:true},{key:'title',label:'タスク',required:true},{key:'owner',label:'担当者'},{key:'dueDate',label:'締切',type:'date'},{key:'status',label:'状態',type:'select',options:['未着手','対応中','完了'],required:true},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'participants',label:'参加者',titleKey:'name',fields:[{key:'eventId',label:'イベント',type:'reference',reference:'events',required:true},{key:'name',label:'氏名・担当名',required:true},{key:'organization',label:'所属'},{key:'status',label:'参加状況',type:'select',options:['出席予定','出席','欠席'],required:true},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'materials',label:'資料',titleKey:'title',fields:[{key:'eventId',label:'イベント',type:'reference',reference:'events',required:true},{key:'title',label:'資料名',required:true},{key:'location',label:'保存場所',type:'textarea'},{key:'owner',label:'担当者'},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'checklist',label:'当日チェックリスト',titleKey:'title',fields:[{key:'eventId',label:'イベント',type:'reference',reference:'events',required:true},{key:'title',label:'確認項目',required:true},{key:'owner',label:'担当者'},{key:'dueDate',label:'確認日',type:'date'},{key:'status',label:'状態',type:'select',options:['未確認','完了'],required:true},{key:'notes',label:'備考',type:'textarea'}]},
  ],
  help:['イベント基本情報を登録してから、準備タスク・参加者・資料・当日チェックを関連付けます。各一覧で対象のイベントを絞り込めます。','準備タスクには担当・締切・状態を記録します。当日チェックは確認後に「完了にする」を押します。状態の絞り込みで未完了の項目を確認できます。','関連する記録があるイベントは削除できません。資料の保存場所は文字として記録します。ファイルの添付やリンク先への接続は行いません。全データの印刷には全分類を含みます。'],
} satisfies BusinessConfig;
