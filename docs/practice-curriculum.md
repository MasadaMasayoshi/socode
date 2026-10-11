# Practice scope and question coverage

This bounded curriculum supports information organization and evidence verification in the nursing assessment tool. It is not a complete national-examination curriculum or validated assessment of clinical ability.

The bank contains 36 authored fictional questions: 14 content-classification questions, one per Henderson need, and 22 workflow/evidence questions. The content-classification names follow the project's existing `HENDERSON_NEEDS` definitions in `js/01-henderson-keywords.js`; no external clinical guideline or patient record was introduced. Answers and explanations are authored specifications, not saved app output.

| Need | Focus in the fictional example |
| --- | --- |
| 1 Respiration | A respiratory symptom statement |
| 2 Food | Food/fluid intake records |
| 3 Elimination | Urination and bowel movement records |
| 4 Posture | Repositioning and mobility assistance |
| 5 Sleep | A sleep statement |
| 6 Clothing | Dressing assistance |
| 7 Temperature | Measurement time and value |
| 8 Hygiene | Washing and oral hygiene assistance |
| 9 Environment | Insurance and social resources |
| 10 Communication | The person's means of expressing intent |
| 11 Faith | The person's stated faith |
| 12 Work | Roles and accomplishment |
| 13 Leisure | Enjoyed activities |
| 14 Learning | Understanding and learning needs |

These questions ask which need to examine first from the content, not whether all other tags must be excluded. S/O format does not determine the need. Further classification needs context and the original evidence.

The 22 workflow questions cover pre-/post-admission separation, extraction, OCR verification/failure, plans, graph directions, evidence ownership, deleted evidence, units, unknown dates, maternal/newborn separation, provenance and protected restoration. Existing adaptive selection first presents unseen questions, then emphasizes weaker topics.

Coverage counts distinct known question IDs. Each question's last valid answer determines its displayed correctness; repeated answers do not inflate the covered-question count. The interface shows all 14 needs and the workflow group, and retains up to 500 fictional-answer events locally. Saved answers are verified by reading them back. Failed saves/deletions remain visible instead of reporting success. No patient data or AI grading is used.

This completes the explicit 36-question baseline, not the unresolved broader educational roadmap in `release-conditions.json`. Question coverage alone does not establish clinical validity or publication readiness.
