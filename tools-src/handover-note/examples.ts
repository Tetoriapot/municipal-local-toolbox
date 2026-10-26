export const HANDOVER_EXAMPLES: Record<string, Record<string, string>> = {
  duties: { title:'年度末の備品照合', overview:'台帳と現物を照合し、相違があれば担当者に確認する。', procedure:'1. 台帳を出力する\n2. 現物の管理番号と場所を確認する\n3. 不一致はその場で削除せず、確認先と対応を記録する。', frequency:'年1回', deadline:'3月中旬', owner:'庶務担当', location:'共有フォルダー／総務／備品台帳', remarks:'不在の備品は貸出記録を確認する。' },
  schedule: { title:'備品の現物確認', timing:'3月上旬に開始し、中旬までに結果をまとめる。', owner:'庶務担当', details:'確認表の準備、現物照合、相違点の確認を行う。' },
  contacts: { title:'庶務担当窓口', organization:'総務課', role:'備品台帳と貸出記録の確認', remarks:'担当者が不在の場合の連絡先も確認する。' },
  files: { title:'備品管理の手順書', location:'共有フォルダー／総務／業務手順', owner:'庶務担当', access:'後任者のアカウントで閲覧できるか確認する。' },
  notes: { title:'貸出中の備品の返却確認', owner:'庶務担当', details:'貸出先に返却予定を確認し、確認日と次の対応を記録する。' },
  checklist: { title:'共有フォルダーの閲覧確認', owner:'後任者', details:'自分のPCから資料を開けることを確認する。' },
};
