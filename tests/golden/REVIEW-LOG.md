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
