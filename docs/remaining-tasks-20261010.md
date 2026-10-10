# Remaining work — 2026-10-10

Branch: `review/nursing-classification-stage1`. Latest evidence: [PR #1](https://github.com/MasadaMasayoshi/socode/pull/1) and [issue #2](https://github.com/MasadaMasayoshi/socode/issues/2). No merge or deployment performed.

## Publication policy

The owner accepted successful latest-code full public regression and real-browser verification as sufficient. [release-conditions.json](release-conditions.json) records this decision without marking external checks complete. Readiness must be reevaluated after each candidate change; stale or incomplete CI never passes. See [publication runbook](publication-runbook.md).

## Implemented baseline

- Content-based Henderson classification; S quotations are not automatically communication, insurance belongs to need 9, admission periods remain separate.
- Source/card/assessment/map/plan navigation and same-patient references; changed/deleted/excluded evidence warnings and reviewed snapshot updates.
- Verified full-content local writes; three import checkpoints, previews and confirmation race protection.
- Patient-scoped card, assessment, map, plan and record histories; structural operations and dependent-state collision guards; ownership-safe immediate Undo.
- Revision-protected maps with clinical metadata, bounded evidence traversal and conflict recovery.
- Read-only knowledge export/differences, 29 source-correspondence records, zero clinical approvals.
- Lab units/ranges, exclusions and chronological trends; OCR file validation/retry/patient ownership with mocked transport.
- Shared modal keyboard behavior, focus restoration and touch targets.
- 36 authored fictional practice questions covering all 14 needs; distinct/latest-answer coverage and verified local progress/reset.
- One full public regression run plus independent browser CI; isolated 46-asset payload, licenses, hashes and evidence artifacts.

## Follow-up evidence

| Area | Still missing |
| --- | --- |
| Live OCR | Real-provider success and optical accuracy using a usable credential |
| Facility references | Adopted ranges, units, methods, population applicability and source/version |
| Clinical sources | Review of specific diagram/plan claims; references remain unapproved |
| Accessibility | Comprehensive real-device and screen-reader review |
| Reversibility | Coverage beyond implemented histories; whole-patient replacement uses checkpoints |
| Curriculum | Targets and verified content beyond the bounded 36-question baseline |
| Legacy compatibility | Missing historical originals and approved expected JSON; no full-card equivalence claim |

These items remain unverified follow-up under the owner's policy. They do not prevent the accepted test-based publication criterion, but must not be claimed complete. No current-output expectations, hidden failures or clinical approvals may be invented.

[Implementation audit](release-work-20261010.md), [curriculum](practice-curriculum.md), [migration record](public-regression-migration-20261010.md) and [map contract](relation-map-contract.md) retain detailed scope. Earlier incremental reports and counts remain available in Git history.
