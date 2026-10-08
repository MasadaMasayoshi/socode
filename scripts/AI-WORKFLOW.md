# AI（Claude）でプログラムを直すときの手順（トークンを減らす）

1. **探す**：`scripts/FILE-MAP.md` を Grep（関数名・画面名）して `ファイル:行` を知る。js 全体や FILE-MAP 全体は読まない。
2. **読む**：Read は `offset` と `limit` で必要な行だけ。大きいファイル（js/05, 07, 08, 15 は3000行前後）を丸ごと読まない。
3. **直す**：Edit で差分だけ書き換える（ファイル全体を書き直さない）。
4. **確かめる**：まず関係するテストだけ `npm run test:quiet -- tests/○○.test.js`。最後に `npm run test:quiet`（いつもの失敗9件以外だけ表示）。
5. **地図の更新**：関数を足した・名前を変えたときだけ `npm run map`。
6. **納品**：`node scripts/stamp-version.js 版` → `node scripts/ship.js /mnt/user-data/outputs/rNN`（変わったファイルだけ CRLF で写し、一覧を表示）→ その一覧だけを SendUserFile・書き込み・コミット。
