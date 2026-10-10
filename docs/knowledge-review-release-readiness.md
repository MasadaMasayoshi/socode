# 看護知識29件：出典照合と先行10工程（2026-10-10）

> Historical implementation and verification record. On 2026-10-10 the owner accepted successful latest-code public regression and real-browser tests as sufficient for publication readiness. The active policy is [release-conditions.json](release-conditions.json); see [publication-runbook.md](publication-runbook.md). Pending clinical/live-provider checks remain unverified follow-up work rather than publication prerequisites.

## 結果と限界
- 候補件数：29。公開ガイドライン／公的資料との本文対応の照合記録を全件に追加した。
- ユーザーによる開発上の承認：29。臨床専門家による正式な審査：**0**。
- 「出典照合済み」は臨床的安全性や最新版との完全一致を保証しない。日本国内の指針、薬剤・施設基準、個別患者への適用も未確認。
- `clinical-knowledge/claims.json` は空を維持。看護診断・関連図・看護計画へ自動取り込みしない。
- 個人患者データは照合・テストに用いていない。

## 次の10工程（コード上の実装・設定）
1. 29件の出典本文対応メモを記録。
2. 推奨番号・適用範囲の誤解を修正（足潰瘍、術後疼痛、褥瘡予防）。
3. 登録ID、分類、本文、出典などの監査ルールを強化。
4. 出典照合URLと登録URLの完全一致を検査。
5. 日付・再確認期限・患者固有フィールドの検査を追加。
6. 29件の照合記録を確認する回帰テストを追加。
7. 資料集に照合状況のフィルターと照合メモを追加。
8. 資料集に監査用JSONエクスポートを追加。
9. CIに知識監査と回帰テストを組み込む設定を追加。
10. 資料集の非AI・閲覧専用テスト、公開前の確認書を追加。

## 公開判定
- [x] ソースコードへの追加とコミット
- [x] 出典の参照・照合メモの登録
- [x] 開発上の承認／臨床専門家審査の分離
- [x] 公開用回帰のGitHub ActionsとNodeテスト合格：失敗0・スキップ0（現行のコミット別検証記録はPR #1参照）。旧全文比較は別検証として未確認
- 独立した専門家審査は公開必須条件としない（2026-10-10のユーザー指示）。審査済み件数は0のまま維持する。
- [ ] 手動ブラウザテスト（スマホ表示、検索、JSON保存、リンク、OCR）
- [ ] ユーザーによる統合・公開判断

## 検証コマンド
```bash
node scripts/audit-clinical-knowledge.js
node --test tests/clinical-knowledge.test.js tests/knowledge-catalog.test.js
npm test
```

公開可能と断定せず、未検証項目は必ず残す。専門家審査前の知識は患者別の自動推奨に使わない。

## 2026-10-10：原本不存在への対応

旧教材の提出待ちを前提にせず、公開可能な架空入力と手記述の現行仕様を検証する方式へ移行。検証範囲・旧テストとの対応・未確認の旧全文互換性は [公開回帰移行記録](public-regression-migration-20261010.md) を参照。公開用回帰の成功を旧教材や臨床審査の成功と読み替えない。

## 根拠参照修正時の実装検証（2026-10-10）

根拠カード参照修正を含むコード `1eee3726e571939e56e97feb1708d0b856c1af6a`：公開用回帰892/892成功、失敗0・スキップ0。実Chromiumは390/768/1440pxの各幅で架空7事例の分類・アセスメント・計画・検査・関連図、生成計画の根拠カード参照を確認し成功。既存の復元・編集履歴・原文照合・資料改訂差分の画面検証も成功。[CI実行記録](https://github.com/MasadaMasayoshi/socode/actions/runs/38018122378)。これは完全なアクセシビリティ点検、実OCR通信、図や計画の臨床的正解を保証しない。

`npm run test:legacy` は原本／期待値不足により2件失敗、スキップ0。旧教材との一致は回復したと扱わない。公開用回帰とは明示的に区別する。施設別基準・残りの実装範囲・統合/公開の判断は未完了のため、まだ公開可能とは判定しない。

## 現行の確認範囲

原文往復、根拠カードの同一患者参照、バックアップ復元、編集履歴、資料差分、7架空事例の5画面操作、欲求ナビのフォーカス保持、検査単位・除外条件・時系列を実ブラウザ回帰へ追加。コミットごとの最新成功証拠は [PR #1](https://github.com/MasadaMasayoshi/socode/pull/1) に記録する。これは上記の手動全画面点検や実OCR通信の完了とは異なる。

## Current evidence requirements

The consolidated English [release implementation audit](release-work-20261010.md) distinguishes implemented recovery/accessibility/OCR input safeguards from live-provider OCR, facility-adopted ranges and comprehensive review. Mocked OCR transport must never be counted as live-provider verification. Independent expert review remains waived; approval counts remain unchanged.
