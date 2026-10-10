# Public regression migration — 2026-10-10

Historical originals are unavailable. The owner requested another approach: reproducible fictional inputs and manually authored specification expectations. Current app outputs are not saved as independent answers, and new specifications do not establish historical full-card equivalence or clinical approval.

## Commands

| Command | Scope | Limits |
| --- | --- | --- |
| `npm test`, `npm run test:public` | Repository-contained current specifications | No lost-original equivalence or clinical approval |
| `npm run test:legacy`, `npm run golden` | Original/full expected-card comparison | Fail when originals/approved answers are missing |
| `node scripts/audit-private-fixtures.js` | Read-only presence/format/hash audit | Does not prove original identity/approval |
| `node scripts/browser-smoke.js` | Chromium, 390/768/1440px, seven fictional workflows | Not exhaustive operations, clinical truth or complete accessibility |

Legacy comparators remain in `legacy-classification.test.js` and `legacy-real-record.test.js`. Missing fixtures fail rather than skip/pass; public scope is displayed in the runner/CI. No `continue-on-error` or automatic expected-answer creation is used.

## Coverage mapping

| Historical dependency | Public replacement | Retained contract |
| --- | --- | --- |
| Patient 36, four files | `hip-contract.txt` | Time/admission/S/O context, vitals, procedures, tabular labs, posture/safety/learning; retained assertions on authored input |
| Heart failure, trends/calculation | `circulation-contract.txt` | BNP/K/time trends, narrative-value exclusion, weight/BMI/standard weight/smoking/alcohol/eGFR/BEE; eGFR 37.3 derives from `194×1.42^-1.094×82^-0.287`, not claimed original values |
| Gastric cancer, two map tests | `gastric-contract.txt` | Own disease despite procedure-only diagnosis, exclude family disease, treatment → disease |
| Seven free-text cases | Explicit `public-case-helpers.js` scenarios | Five existing fictional cases plus puerperal/pediatric records; nonempty preservation assertions, numeric preservation after lab prefixes |
| Anonymization/untagged audit | Same seven public cases | Preserve clinical content; inspect candidate/reason/immutability instead of reusing original-specific untagged sets; separate authored need contracts |
| Unused AI long-text input | Remove original read | Retain four JSON/heading/plan compatibility parser tests; replace obsolete AI-classification expectation with OCR-only rejection |
| Previously skipped real-record case | `gastric-lab-contract.txt` | Three pre-/five post-operative abnormal labs, missing information and tennis tag; eight authored item/time/direction checks; original comparator preserved and fails if missing |
| Full-card golden | Explicit archival command | Unprovable without approved answers; 18 authored contracts and ten long-workflow checks are not equivalent |

## Bugs exposed

Added need-9 handling for standalone dorsalis-pedis observations without deciding clinical normality. Excluded explanatory numeric narratives from lab trend tables while retaining measured-only records. Avoided treating surgery names/family history as the patient's disease. Directed cancer-treatment edges to disease; stage/purpose explanations remain distinct.

Long workflows check important S/O quotations, map references, patient isolation, plan duplicates, unperformed/unevaluable states, manual-goal preservation and absence of external API calls. These checks do not certify clinical appropriateness.

## Publication policy

Do not wait for nonexistent originals or conceal legacy incompatibility. The owner's 2026-10-10 policy accepts latest-code full public regression and real-browser success. Facility references, clinical/source review, comprehensive accessibility, broader reversibility and curriculum remain follow-up, not fabricated completion. Independent expert review is waived as a publication prerequisite; clinical approvals remain zero. Merge/deployment remain separate owner actions. See [release policy](release-conditions.json) and [runbook](publication-runbook.md).
