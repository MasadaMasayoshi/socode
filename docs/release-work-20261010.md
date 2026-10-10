# Release implementation audit — 2026-10-10

Development branch: `review/nursing-classification-stage1`. No merge or publication is authorized by this work. This audit replaces estimates with explicit evidence; it does not declare all roadmap items complete.

## Implemented in this batch

| Area | Result | Verification |
| --- | --- | --- |
| Structural plan recovery | Patient-scoped undo/redo for creation, deletion, movement, problem-triggered regeneration, rule/map imports, model filling and OP/TP movement | Real implementation tests and browser operations |
| Record recovery | Record creation/deletion and response-card creation can be restored together | Whole-operation snapshots; 40-operation session history |
| Collision protection | Later plan, card, assessment, missing-check or map edits block structural restoration | Cross-patient, deletion and dependency-change regressions |
| Confirmation races | Goal examples, missing OP and care reasons refuse changed patients/plans/evidence after asynchronous confirmation | Accepted-target and changed-target tests |
| Modal keyboard access | Shared focus containment, modal naming and focus restoration, preserving dedicated confirmation/API handlers | Browser checks for modal surfaces at three widths |
| Touch access | 44px touch targets and visible keyboard focus | Touch-enabled narrow browser contexts; viewport checks |
| OCR input recovery | Supported image MIME types, nonempty 10MB limit, read errors/abort recovery, same-file retry and patient captured before API-key confirmation | Actual file-input UI with intercepted OCR transport; patient-switch/error tests |
| Education | 22 fictional questions; original-answer identity retained when choices rotate | Existing grading/adaptive-selection/privacy tests |
| CI cost | One full public regression run per workflow, rather than rerunning its constituent test files in separate steps | Syntax and independent metadata audit retained; no failures ignored |

## Existing work retained

- Content-based Henderson tags, separate pre-/post-admission evidence, source/card navigation and untagged reasons.
- Patient-owned map/plan evidence, response-card links and changed/deleted evidence detection.
- Three import checkpoints, preview/confirmation guards and patient-scoped field/map histories.
- Read-only catalog JSON differences, source/review metadata and exports.
- Laboratory unit comparison, unverified reference provenance, inactive/AI/newborn exclusion, chronological comparison and normalized trend display.
- Fictional public specifications and seven end-to-end scenarios, with historical comparators explicitly separate.

## Requirements that code cannot establish from the available evidence

| Requirement | Exact missing evidence | Current behavior |
| --- | --- | --- |
| Live OCR | Successful request/response from the real provider using a configured usable credential | Intercepted transport verifies UI/request format/retry only; it is not optical accuracy or live-provider success |
| Facility-adopted reference ranges | The facility's adopted ranges, units, measurement methods, applicable ages/sexes and version/source | Explicit recorded ranges and clearly labeled generic references remain; no facility approval is invented |
| Clinical causal correctness | Documented review of the specific graph/plan claims against applicable source material | No independent expert is required under the owner's waiver, but unreviewed material is not relabeled approved |
| Comprehensive usability | Real-device/screen-reader review and complete workflow coverage | Automated Chromium width, touch, focus, modal and viewport checks cover a defined subset |
| Every reversible operation | Evidence for operations outside the implemented field/map/plan/record histories, including whole-patient replacement and all board/bulk actions | Backups/import previews protect replacement; not every action is represented as Undo |
| Full educational roadmap | A defined target curriculum and verified question/content coverage beyond the current 22 questions | Adaptive topic selection and local progress remain available |

The owner waived independent expert review, not source provenance or truthful verification. Old originals do not exist: public authored specifications replace the current regression scope; `test:legacy` and `golden` remain archival comparators and fail on missing originals/approved answers. No replacement answers are generated from current outputs. Existing candidate knowledge remains reference-only, with zero clinical approvals.

## Reproducible checks

```bash
node --test tests/care-operation-history.test.js tests/confirmation-races.test.js tests/ocr-input-recovery.test.js
node scripts/audit-clinical-knowledge.js
npm test
node scripts/browser-smoke.js
```

The browser command requires installed Chromium. Commit-specific CI evidence is recorded in PR #1 and issue #2. A passing count does not resolve the evidence requirements above.

## Board recovery follow-up

Board operations now offer patient-scoped Undo and Redo for card deletion, bulk removal, missing-information additions, text/type/tag changes, assessment column moves, reordering, merges and splits. Restoration rejects later card or linked assessment/plan/map changes. Canceled or rejected asynchronous dialogs do not register external updates as the user's operation. Immediate deletion-toast restoration also checks its post-deletion snapshot to avoid duplicate restoration. Automated coverage includes successive Undo/Redo, hostile patient identifiers, linked-update protection and Chromium workflow checks. Whole-patient replacement continues through import checkpoints rather than board Undo.

## Publication preparation follow-up

The static packaging command prepares 46 allowlisted runtime assets including vendor licenses, verifies local HTML asset references and emits SHA-256 hashes. Server code, credentials, patient storage, tests/private fixtures and developer documents are excluded. CI uploads the candidate payload without deployment, plus commit-specific public regression and browser evidence. A readiness checker refuses stale/failed/incomplete evidence or pending release conditions. The publication runbook documents hosting, shared-backend boundaries, live OCR verification and rollback. These engineering preparations do not establish the still-missing external evidence listed in `release-conditions.json`.

## Quality follow-up

Page rename and permanent deletion now reject patient switches, target replacement, edits during confirmation and deletion of a newly last remaining page. The operation still requires explicit confirmation; permanent deletion is not silently converted into retained patient backups. Practice expands to 36 authored fictional questions with all 14 needs represented and distinct-question/latest-answer coverage. Local progress saving/deletion is verified and failures remain visible. The bounded curriculum is documented in `practice-curriculum.md`; a complete clinical/national-examination curriculum is not claimed. Browser checks include grading, save/reload, coverage, mobile fit and reset.

Immediate Undo notifications now verify patient identity and the post-operation snapshot, reject later updates/replacements/deletion, synchronize only successful restorations and ignore repeated clicks. Archive restoration uses the same ownership guard. Blocked restoration no longer emits a false success message.
