# Forty-feature implementation inventory

Updated 2026-10-10, branch `review/nursing-classification-stage1`. AI is image-OCR only; quality checks are local rules. Warnings do not automatically change patient classifications or establish diagnoses. References remain unapproved for clinical application.

| # | Area | Current scope / limit |
| --- | --- | --- |
| 1 | Classification evidence | Validation helpers; not fully integrated |
| 2 | Multiple tags | Existing rules; broader accuracy review pending |
| 3 | Untagged analysis | Reasons and candidates; incomplete explanation coverage |
| 4 | Timeline | Reversed-time detection; broader integration pending |
| 5 | Duplicates | Source comparison and duplicate detection |
| 6 | Source omissions | Candidates and manual-review warnings |
| 7 | S/O | Semantic Henderson misuse warnings; broader accuracy review pending |
| 8 | Edit history | Summary and improvement candidates |
| 9 | Fulfillment evidence | Independent pre-/post-admission checks |
| 10 | Contradictions | Same-time/item difference candidates |
| 11 | Reference ranges | Units, bounds, provenance, version and population checks |
| 12 | Assessment writing | Missing evidence/interpretation/prediction checks |
| 13 | Missing-information priorities | Urgency hints integrated into patient checks |
| 14 | State comparison | Time reversal only; broader comparison pending |
| 15 | Evidence tracing | Same-patient source/card/map/plan navigation and stale/deleted reference detection; clinical review pending |
| 16 | Uncertainty | Overconfident prediction warnings |
| 17 | Problem evidence | Missing evidence-ID warnings |
| 18 | Problem priority | Simple urgency hints; clinical validation pending |
| 19 | Problem duplicates | Same-name detection |
| 20 | Map causality | Isolation, endpoints and evidence checks |
| 21 | Map evidence | Missing-reference warnings |
| 22 | Map/plan alignment | Problem-name mismatch warnings |
| 23 | OP/TP/EP | Missing and exact-duplicate checks integrated |
| 24 | Measurable goals | Simple heuristics |
| 25 | Knowledge categories | Type filters |
| 26 | Domestic references | Four official reference links; no patient-specific approval |
| 27 | Applicability | Missing population/time/context warnings |
| 28 | Revision differences | Local exported/current JSON comparison; no remote latest-edition or clinical interpretation |
| 29 | Knowledge conflicts | Multiple sources surfaced; no automatic clinical contradiction judgment |
| 30 | Evidence level | Source type retained; research-quality grading pending |
| 31 | Reference versions | Source year, correspondence date and review deadline |
| 32 | Bibliography | Deduplicated source export |
| 33 | OCR ambiguity | Confusable characters, decimals and units checks |
| 34 | OCR comparison | Local image/transcription/OCR-text comparison; live-provider accuracy unverified |
| 35 | Mobile | Three-width/seven-case Chromium regression; comprehensive review pending |
| 36 | Autosave | Full readback; three import checkpoints and preview/collision guards |
| 37 | Undo/Redo | Patient-scoped field/map/board/structural plan/record histories; not every operation |
| 38 | Fictional practice | 36 authored questions, all 14 needs; bounded curriculum |
| 39 | Process rubric | Missing educational input counts; no clinical grading |
| 40 | Adaptive practice | Topic results, weaker-topic selection and verified local progress; broader curriculum pending |

Implementation details: [release audit](release-work-20261010.md), [curriculum](practice-curriculum.md), [remaining work](remaining-tasks-20261010.md). Checks live in `quality-checks.js`, `review-plus.js`, patient modules and their tests. Manual quality input is fictional; no identifiable patients are used.

This inventory does not declare all forty roadmap areas complete. Current publication policy accepts latest-code full public regression and real-browser success; external/broader checks remain follow-up. Commit-specific evidence is in [PR #1](https://github.com/MasadaMasayoshi/socode/pull/1).
