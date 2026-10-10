# Editing conventions

- Write developer documentation, comments and test descriptions in concise English.
- Preserve Japanese UI copy, educational content, source quotations, clinical matching vocabulary and fixture/assertion strings.
- Read relevant symbols via `rg` or `scripts/FILE-MAP.md`; avoid loading every module or repeating historical progress reports.
- Use `npm run context -- FILE --symbol NAME`, `--line N` or `--search TEXT`; reads are bounded to 100 lines/8,000 characters and report omitted content.
- `npm test` prints counts and a full-log path. Read only failed diagnostics; use `npm run test:verbose` when full console output is needed. CI retains the full log even on failure.
- Keep OCR instructions concise English and transcription in the original language. Never truncate source/export text, skip checks or change clinical meaning to save tokens.
- Preserve script order and shared patient/learning behavior. AI is image-OCR only; other processing stays local.
- Do not generate missing expected answers from app output, hide failures or claim clinical approval.
- Runtime asset changes require `npm run stamp -- <version>`. Run relevant checks; publication evidence must match the latest candidate commit.
- Do not merge or deploy without explicit owner direction. Current publication criteria are in `docs/release-conditions.json`.
