# Golden baseline review log

## 2026-10-14 (v.52) re-baseline
The old baseline had drifted: 579 differences accumulated from earlier intended improvements and was never re-approved, so real regressions could not be told apart. Reviewed by category before re-baselining:

- Titles, names and header lines losing tags (89 cards): intended (source-structure rules).
- Tag removals (67), e.g. lab-only or identity cards no longer tagged 9.環境: intended.
- Tag additions (24) and swaps (48): mostly intended; the swaps listed below are NOT confirmed and need a human look.
- Cards listed as disappeared/new (224/127): text normalisation or card splitting changed, not content loss; spot-checked.

Unconfirmed (確認不能 — judge in the original record): pain-scale cards inside a 疼痛 scene receiving 3.排泄; 創痛 receiving 5.睡眠; 出血量 receiving 1.呼吸 by keyword; infusion order receiving 2.食事. Isolated, the pain cards get no tag, so the tags come from scene context.

Process: after any classification change run `npm run golden`, read each difference, add a short line here for intended ones, fix the code for regressions, then `npm run golden:update`. Add notebook examples to criteria-examples.json.

## 2026-10-14 (v.52) lab-group card format
Only the grouped lab cards changed (19 cards): one regular form per item, "name a→b unit（reference）", unit written once when shared, items separated by " ／ ", "（入院時のみ）" kept for single points. Values, units, references and card IDs are unchanged; the structured labRows used for abnormal-value detection are untouched.

## 2026-10-15 (v.73) coagulation / platelet lab cards
5 cards (患者34, 患者36, 胃がん_A氏58歳): PT%, APTT, D-dimer, PLT, PT changed 2.食事 → 9.環境. Intended: the notebook puts coagulation and platelet values under 9 (bleeding/safety) and not 2; `labCategoryTags` had still returned 2. Approved with `golden:update`.

## 2026-10-15 (v.76) new cases 事例8–10
Added three fictional cases (血液透析導入, パーキンソン病, 急性骨髄性白血病) as new golden cases; no existing case changed. Generic fixes found by them: lab names Ca / P(mg/dL) / LDH / 好中球数 are recognised; "K 1,500mg以下" (diet limit) is no longer read as a blood value; パーキンソン症状 words (筋固縮・振戦・すくみ足・小刻み歩行…) tag 4; 白血病・リンパ腫・骨髄腫 diagnosis hints tag 1,9.

## 2026-10-16 (v.97) merge of short cases
Merged two short cases into longer cases of the same system and format; golden is 27 -> 25 cases, no new differences.
- 脳梗塞_A氏75歳 (591 chars) -> 事例4_脳梗塞_架空 (1268 -> 1862 chars; the short case's heading lines come first, its day blocks are appended).
- 胃がん_B氏65歳 (638 chars) -> 事例2_大腸がん術後_架空 (1619 -> 2260 chars; same placement).
Expected data: only the short case's own expected cards (type/tags/text) were moved; only the timestamp of 3 heading cards changed from 日時不明 to 入院前 because the merged text puts them before the first day block. No conflict between the two expectations (the texts differ).
Not merged: 学生記録5_小児肺炎 (465 chars) into 事例6_小児喘息: the title line "小児看護学実習 記録 (10/14)" is classified 不必要 at the top of a record but O in the middle of another (a real context difference, reported, not hidden). 学生記録4 (478 chars) has no same-family target and 学生記録1–3 are longer; they stay separate because each covers a different record format (行動計画, ヘンダーソン用紙, 日々の記録, プロセスレコード) with no same-format target.
Note: tests/golden/cases and expected are in .gitignore on purpose (teaching material). The originals are therefore NOT recoverable from git; copies of the removed originals were delivered with the v.97 files.


## 2026-10-16 (v.101) generic cue words for untagged cards
Intended golden diffs (3 cards, all tag additions, no type change): 涙ぐむ is now a need-10 cue (emotional state shown), so "母親は涙ぐんでいた" (事例 骨髄検査) and "こんなことも一人でできないのね と涙ぐむ" (事例4) gain 10; 学校生活 is a need-12 cue (role as a student), so the 小児喘息 admission card gains 12. 泣く/泣いた were tried and removed: an infant's or child's crying during care is not a communication finding.
New structure rules (worksheet instructions, table captions/headers, generic statements about other patients, wrapped-line fragments contained in another line) only affect cards that had no tag; the fragment rule skips lines with digits or brackets so lab and header lines are unchanged.

## 2026-10-16 (v.103) card segmentation
No golden change. The new split applies only to a card holding a staff explanation (role + quotation, or 'staff ... explained'); a quotation-internal label word no longer becomes a field label.
