import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'meeting-minutes',name:'会議メモ・議事録',kind:'meeting',description:'会議情報・議題・メモ・決定事項と、会議ごとのTODOを管理します。',
  sections:[
    {id:'meetings',label:'会議・議事録',titleKey:'title',fields:[{key:'title',label:'会議名',required:true},{key:'date',label:'開催日',type:'date',required:true},{key:'time',label:'開始時刻',type:'time'},{key:'location',label:'場所'},{key:'attendees',label:'出席者',type:'textarea'},{key:'agenda',label:'議題',type:'textarea'},{key:'notes',label:'メモ',type:'textarea'},{key:'decisions',label:'決定事項',type:'textarea'}]},
    {id:'todos',label:'TODO',titleKey:'title',fields:[{key:'meetingId',label:'会議',type:'reference',reference:'meetings',required:true},{key:'title',label:'作業内容',required:true},{key:'owner',label:'担当者'},{key:'dueDate',label:'締切',type:'date'},{key:'status',label:'状態',type:'select',options:['未着手','対応中','完了'],required:true},{key:'notes',label:'備考',type:'textarea'}]},
  ],
  help:['会議・議事録に基本情報、出席者、議題、メモ、決定事項を登録します。複数の議題・出席者は改行して入力できます。','TODOは登録済みの会議と関連付け、担当・締切・状態を記録します。会議と状態で絞り込めます。「完了にする」で更新し、必要なら未着手へ戻せます。','TODOが参照する会議は削除できません。全データの印刷には議事録とTODOを含みます。表示中の一覧の印刷は選択中の分類と絞り込み条件が対象です。'],
} satisfies BusinessConfig;
