import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'inventory-manager',name:'消耗品在庫管理',kind:'inventory',description:'品目ごとの初期在庫と入出庫記録から現在庫を計算し、最低在庫を下回る品目を表示します。',
  sections:[
    {id:'items',label:'品目・在庫一覧',titleKey:'name',unique:'code',fields:[{key:'code',label:'管理番号',required:true,maxLength:100},{key:'name',label:'品名',required:true},{key:'unit',label:'単位'},{key:'initialQuantity',label:'初期在庫',type:'number',required:true},{key:'minimum',label:'最低在庫',type:'number',required:true},{key:'location',label:'保管場所'},{key:'notes',label:'備考',type:'textarea'}]},
    {id:'movements',label:'入出庫記録',titleKey:'itemId',fields:[{key:'itemId',label:'品目',type:'reference',reference:'items',required:true},{key:'date',label:'入出庫日',type:'date',required:true},{key:'direction',label:'区分',type:'select',options:['入庫','出庫'],required:true},{key:'quantity',label:'数量',type:'number',min:1,default:'1',required:true},{key:'person',label:'担当者'},{key:'notes',label:'用途・備考',type:'textarea'}]},
  ],
  help:['品目・在庫一覧に管理番号・品名・初期在庫・最低在庫を登録し、その後の増減を入出庫記録に入力します。現在庫は初期在庫＋入庫−出庫で計算します。','在庫数は整数で管理します。現在庫が最低在庫を下回ると「在庫不足」を表示します。最低在庫と同数の場合は不足としません。','入出庫は日付順、同日は登録順に計算します。途中で在庫が負になる変更は拒否します。初期在庫の変更や履歴の削除時も再計算します。履歴がある品目は削除できません。'],
} satisfies BusinessConfig;
