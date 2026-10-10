# Quality safeguards — 2026-10-10

Historical implementation milestone; current scope/policy is in [remaining work](remaining-tasks-20261010.md). Earlier test counts and environment failures remain in Git history.

- Fulfillment caches track content/time/type/period/exclusion, not text length.
- Current problems require current observations; pre-admission-only records, deleted/AI-proposed cards and plan prose alone do not establish current findings.
- New plans link only unique exact-match evidence cards and retain content/time/type/period snapshots. No ambiguous ID inference or automatic migration of legacy plans.
- Changed/deleted/excluded evidence is rechecked after reload. Review shows old/current evidence, detects confirmation races and retains up to 20 updates with a plan-review prompt.
- Reevaluate saved plan validation against current data. Quality checks reuse existing untagged/basic-information rules and explain candidates without automatic diagnosis/tag changes.
- Check duplicate OP/TP/EP, unsupported inferred causal edges and map/plan problem-name differences. Observations at different times/types/admission periods are not duplicates.
- Patient-scoped text Undo preserves other patients' Redo and refuses later edits.
- Test discovery is explicit and cross-platform; quiet runners reject failures, bad targets, interruption and incomplete output. Proxy bypass is limited to test localhost.

The original milestone had 764 passes, 13 failures and one skip because private originals/expectations were absent; DOM mocks were not real-browser evidence. [Migration](public-regression-migration-20261010.md) subsequently established authored public specifications and separate failing legacy comparators. Latest full regression/browser evidence belongs to the exact candidate commit in PR #1, not to these historical counts.
