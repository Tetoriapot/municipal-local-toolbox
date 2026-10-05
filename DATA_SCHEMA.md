# 保存データとJSONバックアップ

## 配色・操作日時・下書き・サンプル

v1.1.0では確定済みデータのschemaVersionと保存キーを変更していません。配色は`municipal-toolbox:theme:v1`に`light`または`dark`を保存します。JSON書出し操作日時は`municipal-toolbox:export-operation:v1:<toolId>`にISO日時を保存します。どちらも業務データのJSONには含みません。

編集下書きは`municipal-toolbox:draft:v1:<toolId>`に1件保存します。schemaVersionは1で、toolId、section、id、base、values、updatedAtを持ちます。idは元の記録IDまたはnull、baseは編集開始時の記録をJSON化した文字列またはnull、valuesは項目名と文字列・真偽値の対応、updatedAtはISO日時です。下書きは600,000文字以内、valuesは40項目以内、文字列値は50,000文字以内です。記録の確定時に削除し、保存失敗時は保持します。通常のJSON・CSV・印刷には含めず、下書き書出しは保管用です。読込み・全削除でも下書きは保持し、専用操作で削除します。

`#sample`で起動した実装済みツールは、同梱のsample.jsonをメモリ上へ展開します。通常の業務データ・下書きのlocalStorageにはアクセスしません。JSONには`sampleData: true`を含め、JSON・CSV・下書きの出力名に`sample-`を付けます。通常画面でサンプルJSONを読み込む場合は置換確認に表示します。

CSV読込みは既存備品への追加です。見出しと項目の対応を利用者が選び、未選択の列は取り込みません。管理番号と備品名は必須で、同じ列を複数項目へ割り当てられません。UTF-8、Shift_JIS、UTF-16LE/BEに対応し、UTF-16の自動判定にはBOMが必要です。ファイル・復号後テキストとも10MB以内、100列・3,000データ行以内です。空行は無視します。引用符・引用符内のカンマや改行・CRLF/LF/CRを扱います。管理番号の先頭0を保持し、日本語の状態を保存用IDへ、YYYY/M/Dの日付をYYYY-MM-DDへ変換します。

CSV内または既存台帳と管理番号が重複する行、列数不一致、必須欄や日付などの不正が1件でもあれば取り込みません。追加後も件数・JSON容量の上限を検証します。IDは新規発行し、既存備品・メモ・不明なキーは変更しません。CSV出力時の数式対策アポストロフィは既定で保持し、明示選択時だけ対象パターンの先頭1文字を除きます。

## 異動引継ぎノートv1.1.0

保存キーは`municipal-toolbox:data:v2:handover-note`です。ブラウザ内保存とバックアップは同じJSON形式です。保存時に`exportedAt`を更新します。HTMLファイル自体にはデータを書き込みません。

```json
{
  "schemaVersion": 2,
  "toolId": "handover-note",
  "exportedAt": "2026-10-05T00:00:00.000Z",
  "text": "",
  "profile": {
    "department": "",
    "predecessor": "",
    "successor": "",
    "handoverDate": ""
  },
  "sections": {
    "duties": [],
    "schedule": [],
    "contacts": [],
    "files": [],
    "notes": [],
    "checklist": []
  }
}
```

`text`は旧版から継続する自由記入メモです。`profile`は自治体・部署名、前任者、後任者、引継ぎ日です。6種類の配列は必須です。レコードには共通項目として`id`、`title`、`completed`を保存します。

| キー | 型・条件 |
| --- | --- |
| id | 1〜100文字の英数字・ハイフン・アンダースコア。同じ分類内で一意。新規作成時はUUID |
| title | 空白のみを除く1〜500文字。分類に応じて「業務名」「予定名」などのラベルで表示 |
| completed | boolean。欠損時はfalse |
| text | 0〜50,000文字 |
| handoverDate / dueDate | 空文字または実在するYYYY-MM-DD形式の日付 |

| 分類ID | 分類名 | title・id・completed以外の項目 |
| --- | --- | --- |
| duties | 担当業務 | overview, procedure, frequency, deadline, owner, contact, location, remarks |
| schedule | 年間予定 | month, timing, owner, details |
| contacts | 関係者 | organization, role, phone, email, remarks |
| files | 資料の保存場所 | location, owner, access, remarks |
| notes | 申し送り事項 | priority, dueDate, owner, details |
| checklist | チェックリスト | dueDate, owner, details |

`month`は"1"〜"12"の文字列で必須です。画面と印刷では4月から翌年3月の順に並べます。`priority`は「通常」「高」「低」で、欠損時は「通常」です。任意の文字列項目がない場合は空文字で補います。既存項目が別の型の場合は読込みを拒否します。

1行入力は500文字、複数行入力は20,000文字までです。複数行の項目は、担当業務のoverview・procedure・location・remarks、年間予定のdetails、関係者のremarks、資料のlocation・access・remarks、申し送りとチェックリストのdetailsです。文字数はJavaScriptの文字列長で数えます。

記録は6分類の合計3,000件までです。JSONはUTF-8で10MiB（画面表記は10MB）までです。書出し時の整形や日時を含めて上限を確認し、超過する変更は確定しません。localStorageの容量はブラウザの設定に依存し、10MiBまで保存できる保証はありません。

## 旧版との互換性

配布確認版は`schemaVersion: 1`、`toolId`、`text`、`exportedAt`を使用します。異動引継ぎノートの旧キーは`municipal-toolbox:preview:v1:handover-note`です。新しい保存領域がない場合にだけ旧キーを読み、メモを新領域へ複製します。旧キーは上書き・削除しません。

旧JSONを読み込むと新形式へ変換します。新しい基本情報と6配列を作成し、メモを維持します。旧JSONの全体を`legacyBackup`にも保持するため、新形式の予約キーと重なる不明な項目も失われません。新形式の読込み・編集・書出しでは、ルート・基本情報・分類オブジェクト・各レコードの不明なキーを保持します。既知の項目を勝手に別名へ変換しません。

新形式を旧版へ読み込むことはできません。未対応のschemaVersion、異なるtoolId、重複ID、欠損した分類、無効な値は拒否します。拒否したファイルで既存データを書き換えません。

## ファイル検証とデータ保護

読込み対象は.json拡張子で、空ではないJSONファイルです。拡張子の大文字・小文字は区別しません。UTF-8のBOMに対応します。MIMEはapplication/json、text/json、text/plain、application/octet-stream、または空欄を受け付けます。日本語や空白を含むファイル名を使用できます。

読み込んだ内容を検証した後、置換の確認を表示します。キャンセルすれば現在のデータを維持します。ユーザー入力は文字として描画し、HTML・スクリプト・URLとして実行しません。

保存前にlocalStorageが最後に読んだ値と同じかを確認します。異なる場合は上書きを止め、画面内の編集内容を保持します。保存はタブ間の同時トランザクションではないため、共同編集には使用できません。

破損した保存データは自動で上書きしません。利用者が有効なJSONの読込みを確定するか、全削除を実行するまで保護します。全削除では有効な空データを新キーに保存し、旧メモの再移行を防ぎます。旧版の領域と書き出したJSONは残します。

## 備品管理台帳v1.1.0

保存キーは`municipal-toolbox:data:v2:equipment-manager`です。旧キーは`municipal-toolbox:preview:v1:equipment-manager`です。

```json
{
  "schemaVersion": 2,
  "toolId": "equipment-manager",
  "exportedAt": "2026-10-05T00:00:00.000Z",
  "text": "",
  "items": [
    {
      "id": "stable-item-id",
      "assetNumber": "PC-001",
      "name": "ノートパソコン",
      "category": "情報機器",
      "location": "総務課",
      "purchaseDate": "2025-04-01",
      "status": "in-use",
      "notes": ""
    }
  ]
}
```

| キー | 型・条件 |
| --- | --- |
| id | 1〜100文字の英数字・ハイフン・アンダースコア。一覧内で一意。新規作成時はUUID |
| assetNumber | 空白のみを除く1〜100文字。NFKC・前後空白除去・英字小文字化による比較で一意 |
| name | 空白のみを除く1〜500文字 |
| category / location | 0〜500文字。任意の文字列。独立したカテゴリ設定データは持たない |
| purchaseDate | 空文字または実在するYYYY-MM-DD形式の日付 |
| status | in-use（使用中）、stored（保管中）、repair（修理中）、disposed（廃棄済み）、unknown（未確認）。欠損時はunknown |
| notes | 0〜20,000文字 |
| text | 自由記入メモ。0〜50,000文字 |
| items | 必須の配列。最大3,000件 |

任意の文字列項目が欠損した場合は空文字で補います。既知の項目が別の型なら拒否します。JSONは整形後の出力で10MiBまでです。ファイル検証、BOM、MIMEの条件は引継ぎノートと同じです。

旧版のJSONは`schemaVersion: 1`から移行します。メモと不明なキーを保持し、旧JSON全体を`legacyBackup`にも保存します。新形式のルートと各備品にある不明なキーは編集・書出し後も保持します。旧領域の保護、別画面の変更検出、破損データの上書き停止、全削除後に旧メモを再移行しない扱いも引継ぎノートと同じです。

CSV列は「管理番号、備品名、カテゴリ、設置場所、購入日、状態、備考」の順です。状態は日本語ラベルで出力します。UTF-8のBOM付き、レコード区切りはCRLF、全セルをダブルクォートで囲み、セル中のダブルクォートを二重にします。カンマや改行を含むセルも出力できます。

先頭の空白・制御文字などに続く=、+、-、@、または先頭のタブ・改行を検出したセルには、アポストロフィを前置します。台帳とJSONの値は変更しません。管理番号の先頭0はCSV内では保持しますが、表計算ソフトで文字列として取り込まなければ数値へ変換されることがあります。CSVにはID・メモ・不明なキーを含めず、復元にはJSONを使います。

## 他の6種類の配布確認版

保存キーは`municipal-toolbox:preview:v1:{toolId}`です。schemaVersionは1、メモは50,000文字までです。JSONの読込み・書出し上限は1MiB（画面表記は1MB）です。ツールID・形式・文字数・容量を検証し、不明なキーは保存し直すときも保持します。別の画面で保存内容が変更された場合は上書きと削除を止めます。
