# Developer context budget

Use English for developer comments, diagnostics and instructions. Preserve Japanese interface copy, matching vocabulary, patient/source text, educational material and document exports. Remove repetitive fix history; keep the current contract near its implementation. Git retains the earlier explanations.

## Read narrowly

```bash
npm run context -- js/07-classification.js --outline
npm run context -- js/07-classification.js --symbol classifyTextByRules
npm run context -- js/07-classification.js --search normalize
npm run context -- js/07-classification.js --line 200
```

The reader outputs at most 100 source lines/8,000 characters or 50 outline/search entries. It reports continuation/truncation, rejects unsupported/untracked paths and never edits source. It is a line-based navigation aid, not a full parser; duplicate declarations require line selection. Use `rg -n` to locate a narrower range. Do not ingest the entire generated symbol map, vendor bundle, fixture corpus or full successful test log.

## Output narrowly

`npm test` runs the full public suite but prints six counts and the log path. Failures return nonzero and show a bounded diagnostic excerpt; the complete log is retained. Missing summaries, zero tests, cancellation, skips and TODOs are unsuccessful. `npm run test:verbose` restores full console output. CI uploads summary/evidence and the full log, including on failure.

OCR sends one allowed English instruction and one image. Return the complete transcription in the original language; no summarization, clinical inference or artificial output cap. Request savings do not reduce image tokens. No live-provider accuracy is claimed.

Do not minimize runtime code, erase meaningful Japanese strings, limit exported patient text or manufacture expected answers. Token savings concern developer context and redundant instruction/log text, not evidence completeness.
