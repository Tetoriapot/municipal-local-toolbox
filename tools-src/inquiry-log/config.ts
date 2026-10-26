import type { BusinessConfig } from '../business/model.ts';
export default {
  id:'inquiry-log',name:'問い合わせ記録',kind:'inquiry',csv:true,description:'受付日・分類・問い合わせ内容・回答・対応状況を記録し、検索やCSV出力で確認します。',
  sections:[{id:'inquiries',label:'問い合わせ一覧',titleKey:'content',fields:[{key:'receivedAt',label:'受付日',type:'date',required:true},{key:'category',label:'分類'},{key:'content',label:'問い合わせ内容',type:'textarea',required:true},{key:'owner',label:'対応者'},{key:'answer',label:'回答',type:'textarea'},{key:'status',label:'状態',type:'select',options:['未対応','対応中','完了'],required:true}]}],
  help:['問い合わせ一覧に受付日・内容・状態を登録し、対応者と回答を追記します。編集から分類や状態も変更できます。','キーワードは全項目を検索します。スペースで区切るとすべての語を含む記録を表示します。状態の絞り込みと組み合わせられます。','CSVは表示条件に合う全件をUTF-8 BOM付きで書き出します。改行・引用符を保持し、数式として解釈される可能性がある値にはアポストロフィを付けます。メモ・ID・拡張項目を含む復元にはJSONを使用してください。'],
} satisfies BusinessConfig;
