# Knowledge review and publication evidence

Updated 2026-10-10. Active policy: [release-conditions.json](release-conditions.json); procedures: [publication-runbook.md](publication-runbook.md). Commit-specific results: [PR #1](https://github.com/MasadaMasayoshi/socode/pull/1).

## Knowledge status

The catalog contains 29 candidates with source-text correspondence notes and owner development approval. Clinical expert approvals: **0**. Notes do not prove clinical safety, latest-edition equivalence, domestic guidance, facility adoption or individual applicability. `clinical-knowledge/claims.json` remains empty; candidates are not imported into patient diagnoses, maps or plans. No personal patient data was used.

Implemented: source notes and scope corrections; ID/type/content/source/date/expiry audits; exact source-URL correspondence; patient-field exclusion; catalog filters, notes and JSON export; read-only/non-AI regressions; CI audit integration. Formal approval follows [governance](clinical-knowledge-governance.md).

## Publication criterion

The owner accepted successful latest-code full public regression and real Chromium workflows as sufficient on 2026-10-10. Readiness requires matching candidate commit evidence, complete summaries and zero failures/skips/cancellations. Stale CI or mocked/browser-incomplete evidence cannot pass. Merge and deployment require separate owner direction.

Live-provider OCR, facility ranges, clinical-source review, comprehensive accessibility, broader reversibility and curriculum remain pending/partial follow-up, not falsely completed. Mocked OCR verifies request/UI recovery only. Independent expert review is waived as a prerequisite; its approval count stays zero.

## Evidence scope

Browser checks cover 390/768/1440px, seven fictional scenarios, classification/assessment/plans/labs/maps, source-card navigation, evidence identity, recovery/history, knowledge differences, modal/focus behavior, OCR input handling and practice. They do not establish optical accuracy, comprehensive accessibility or clinical correctness.

[Public regression migration](public-regression-migration-20261010.md) records missing historical originals and the replacement specification scope. Legacy comparison remains separate and fails when originals/approved expectations are missing. Public success must not be relabeled legacy or clinical success.

```bash
node scripts/audit-clinical-knowledge.js
npm test
node scripts/browser-smoke.js
```

See [implementation audit](release-work-20261010.md) for implemented safeguards and exact limitations. Earlier milestone counts remain in Git history rather than duplicating outdated status here.
