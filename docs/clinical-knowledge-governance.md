# Clinical knowledge governance

Scope: general knowledge supporting causal maps, problem priorities and OP/TP/EP; exclude personal patient data and layout changes. Preserve existing source references, fact/inference distinctions and validation in `js/15-relation-map.js` and `js/12-missing-checks-and-care-plan.js`.

## Registry contract

1. Register individual claims in `clinical-knowledge/claims.json`, identifying pathophysiology, causation, indications, intervention, contraindication or evaluation criteria.
2. Cite official guidelines, peer-reviewed papers, textbooks or public standards with bibliographic details and official URLs. AI text is not a source. Check the claim against source text and edition.
3. State population, prerequisites, exclusions and limitations. A disease name does not establish observations or a current problem.
4. Assign `status: "approved"` and `reviewer` only after documented review by a qualified clinician/instructor. Unreviewed candidates must remain labeled as such.
5. Record `lastReviewed` and `reviewDue`; expired approvals fail validation. Recheck earlier when significant guidance changes.
6. Run `npm test`; use fictional cases to prevent unsupported inference and preserve valid existing behavior.

## Reasoning contract

Keep source facts, general knowledge and hypotheses separate. Knowledge alone does not establish causation or a current patient problem. Arrows mean cause → effect or treatment → target; chronology/association alone is not causation. Plans must align problems, goals and OP/TP/EP with contraindications, patient state and operator authority. Source existence does not validate a patient intervention. Facility, population and measurement-method ranges take precedence over generic values.

## Current limits

The approved registry is empty; generation does not consume it. Automated checks validate metadata, expiry and review records, not clinical truth. The owner waived independent review as a publication prerequisite on 2026-10-10 and subsequently accepted successful regression/browser tests. This does not create approval records: references remain read-only and cannot become automatic patient recommendations. Registry approval requirements still apply whenever material is labeled clinically approved.
