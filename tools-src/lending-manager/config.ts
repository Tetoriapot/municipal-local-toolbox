import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'lending-manager',name:'貸出・返却管理',kind:'lending',description:'備品と貸出者を登録し、貸出・返却予定・返却日を管理します。',
  sections:[
    {id:'assets',label:'備品一覧',titleKey:'name',unique:'assetNumber',fields:[{key:'assetNumber',label:'管理番号',required:true,maxLength:100},{key:'name',label:'備品名',required:true},{key:'location',label:'保管場所'},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'borrowers',label:'貸出者',titleKey:'name',fields:[{key:'name',label:'氏名・担当名',required:true},{key:'department',label:'所属'},{key:'contact',label:'連絡先'},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'loans',label:'貸出・返却履歴',titleKey:'assetId',fields:[{key:'assetId',label:'備品',type:'reference',reference:'assets',required:true},{key:'borrowerId',label:'貸出者',type:'reference',reference:'borrowers',required:true},{key:'loanDate',label:'貸出日',type:'date',required:true},{key:'dueDate',label:'返却予定日',type:'date',required:true},{key:'returnedAt',label:'返却日',type:'date'},{key:'notes',label:'備考',type:'textarea'}]},
  ],
  help:['備品一覧と貸出者を登録してから、貸出・返却履歴に貸出を登録します。貸出中の備品を重ねて貸し出すことはできません。','返却時は「返却日を入力」から日付を登録します。返却済みの記録も履歴に残ります。返却予定日を過ぎた未返却の記録を「延滞」と表示します。判定日はこの端末の日付です。','貸出履歴から参照されている備品や貸出者は削除できません。履歴を残したまま名称・連絡先を編集できます。'],
} satisfies BusinessConfig;
