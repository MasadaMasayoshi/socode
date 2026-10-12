# Source-based tag review

Scope: owner-supplied correction export and its embedded source only. No external clinical claims or patient record copies are included. The examples below are short matching/verification examples, not additional patient facts.

| Evidence | Domain | Observation |
| --- | --- | --- |
| 検診を欠かさない | 14 | Actual service use; family cancer history alone is not learning. |
| HCV抗体(-)、梅毒(-)、HBV抗原(-) | 9 | Preserve negative safety evidence; do not infer absence of every infection risk. |
| 胸部X線で明らかな病変なし | 1 | Respiratory evidence; the negative image does not settle respiratory sufficiency. |
| 精密検査・胃カメラで胃底部の腫瘍 | 2 | Recorded gastric finding; do not infer the cause of symptoms. |
| 睡眠と排便・排尿の明示的な項目 | 5, 3 | One line can contain more than the first field's domain. |
| Cr (Cre) | 3 | Equivalent renal-test spellings, distinct from CRP. |
| 手術オリエンテーションを受ける | 14 | Actual education; a cancelled/unperformed session is a counterexample. |
| 自主的な体動はない | 4 | Actual activity observation; an isolated resting pain score is insufficient. |
| 呼吸訓練の予防目的や方法を質問する | 1, 14 | Already supported by the patient's questions in the source; retain the shared scene. |
| ゆっくり食べる必要を述べる | 2, 14 | Already classified; retain the explicit dietary understanding. |
| 普通便あり・尿糖陰性・尿蛋白陰性 | 3 | Already classified; normal/negative findings remain evidence. |
| 同居・近所の家族 | 9 | Already classified; proximity alone does not prove willingness/ability to help. |

Deliberate background: identity, blood type, asymptomatic past history and pathology staging are retained. A family diagnosis must not acquire the patient's broad disease tags. Formatting, repeated course titles and explanatory fragments are not patient observations. Missing characters in a wrapped operative note are not repaired by guessing.

Implementation includes short-value field/source matching, structure detection before sentence splitting, complete pathology/stage extraction, preservation of ambiguous pathology spellings in the graph, current rule explanations, and guarded repair of untouched saved cards. Manual edits, learned decisions and approved reviews remain protected. Saved structure cards retain their IDs/text and receive a recorded correction reason. Never replace complete source exports with this review matrix.

Validation: independent assertions cover positive/counterexamples, source ownership, old-card repair, protection, repeated input, event times and pathology graph links. The real-browser workflow checks classification and export at 390/768/1440px. Publication requires passing checks on the exact candidate commit.
