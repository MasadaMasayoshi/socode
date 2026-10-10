# Editing conventions

- Write developer documentation, comments and test descriptions in concise English.
- Preserve Japanese UI copy, educational content, source quotations, clinical matching vocabulary and fixture/assertion strings.
- Read relevant symbols via `rg` or `scripts/FILE-MAP.md`; avoid loading every module or repeating historical progress reports.
- Preserve script order and shared patient/learning behavior. AI is image-OCR only; other processing stays local.
- Do not generate missing expected answers from app output, hide failures or claim clinical approval.
- Runtime asset changes require `npm run stamp -- <version>`. Run relevant checks; publication evidence must match the latest candidate commit.
- Do not merge or deploy without explicit owner direction. Current publication criteria are in `docs/release-conditions.json`.
