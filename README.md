# Nursing assessment support

Japanese learning-support app with a shared Node/Express backend. AI is limited to image OCR; classification, assessment, plans and diagrams use local rules. Reference material is not clinical approval.

## Develop

Use Node 20. Run `npm ci`, then `npm start`; open `http://localhost:3000`. Directly opening `index.html` supports local use but cannot persist shared learning or synchronize patients. Keep one working checkout; `scripts/move-to-dev-folder.ps1` can copy a Windows checkout outside OneDrive, including private files. Verify the copy before removing anything.

## Code map

| Path | Responsibility |
| --- | --- |
| `index.html`, `style.css` | Japanese interface and styling |
| `js/01–03` | Henderson vocabulary, reference data, extraction helpers |
| `js/04–05` | Server synchronization, state, UI, shared learning |
| `js/06–10` | Exports, classification, assessment tools, board, startup/OCR |
| `js/11–15` | Own assessment, care plans/records, comparison/history, semantic rules, relation map |
| `clinical-knowledge/` | Read-only references, quality checks, fictional practice |
| `server.js` | Shared persistence and API |
| `vendor/` | Bundled CSS/icons and licenses |
| `scripts/`, `tests/` | Maintenance, packaging, regression and browser checks |

Preserve script order in HTML. Root `app.js` is archival, not the active app. Use `npm run map`, then search `scripts/FILE-MAP.md` for symbols and read only the relevant lines. See [AGENTS.md](AGENTS.md) for editing conventions.

## Data and synchronization

Shared research data deliberately includes raw card text, S/O type, Henderson tags, columns and edit history; it is not automatically anonymized. Do not remove this owner-selected sharing behavior. Patient records and learned classification patterns are separate:

- `learning-dict.json`: preferred type/columns/tags and votes. Learned values precede headings and fixed rules. Automatic creation does not vote; deliberate user corrections do. Text edits carry learned values to the new text. Merges combine votes, retain source entries and exclude deliberately removed tags. Shared learning is server-backed; offline changes are session-only.
- `case-log.json`: timestamped edits; `extraction-log.json`: original text at each classification. Current `sourceText` retains only the latest source.
- `patients.json`: records keyed by patient ID. Per-patient PUT avoids replacing other patients. Cards merge by edit time; deletion tombstones last three days. Non-card fields follow record update time. Archive changes a flag; permanent deletion also deletes the server record.
- Patient data autosaves, debounces text input, merges on startup and synchronizes on exit. Local saves verify full readback; imports use three checkpoints and confirmation guards. Selected tabs are session-local.
- `custom-tag-rules.json`, `extraction-criteria.json`, `card-reports.json`: shared rules, requests and reports. Requests/reference notes do not automatically change local classification or invoke AI. Report items are grouped by tab session. Logs older than 90 days move to archive files.

Board and assessment views redraw from the same saved data. Undo histories are patient-scoped and reject later conflicting edits; imports use checkpoints. See [release implementation audit](docs/release-work-20261010.md) for scope and limits.

## API

| Methods | Path | Purpose |
| --- | --- | --- |
| GET | `/api/learning-dict` | Learned patterns |
| POST | `/api/learning-event` | Record deliberate edits and extraction/merge events |
| GET | `/api/case-log`, `/api/extraction-log`, `/api/card-reports` | Shared histories/reports |
| POST | `/api/extraction-log`, `/api/card-reports` | Add source snapshots/reports |
| GET | `/api/patients` | Patient records |
| PUT, DELETE | `/api/patients/:id` | Save/delete one patient |
| POST | `/api/patients/sync` | Bulk exit synchronization |
| GET | `/api/patients/:id/relation-map` | Revision-protected map read |
| GET, POST | `/api/extraction-criteria` | Shared requests |
| DELETE | `/api/extraction-criteria/:id` | Remove a request |
| POST | `/api/presence/heartbeat`, `/api/presence/leave` | In-memory tab presence |
| GET | `/api/case-log/archive`, `/api/extraction-log/archive`, `/api/card-reports/archive` | Older logs |

Presence counts tabs, not people (20-second heartbeat, 45-second expiry). Server payload/rate limits and field truncation remain enforced; reports allow at most 200 items per session record. Export supports text, Word/PDF, selected cards, assessment tables and practice reports.

## Verify and package

```bash
npm test
node scripts/audit-clinical-knowledge.js
node scripts/browser-smoke.js
node scripts/prepare-release.js /tmp/socode-release
```

Browser checks require Playwright/Chromium. Public tests use authored fictional specifications; server tests use isolated temporary storage. Missing legacy originals/approved answers remain failures under `npm run test:legacy` or `npm run golden`; public success does not establish historical full-card equivalence. Never generate expected answers from current output to fill missing fixtures. `golden:update` is an explicit maintenance command, not independent approval.

After runtime asset changes, use `npm run stamp -- <version>` to update changed asset fingerprints/cache versions. Use `npm run build:css` for bundled Tailwind CSS. `npm run ship -- --list` lists delivery changes; inspect before copying.

## Hosting and publication

GitHub source hosting alone does not run Express. A Node host runs `npm ci` and `npm start`. JSON persistence needs durable disk; set `MONGODB_URI` to use MongoDB on ephemeral hosts. Keep credentials and `data/` private, use HTTPS, and configure database access for the chosen host. Gemini credentials are user-local in the browser; shared patient data is a separate backend boundary.

[Publication runbook](docs/publication-runbook.md) describes the isolated static payload, evidence and rollback. CI packages assets without deploying. The owner accepted latest-code full public regression and real-browser success as sufficient on 2026-10-10; [release policy](docs/release-conditions.json) preserves pending external checks as follow-up. Expert approval remains zero, live OCR remains unverified, and neither merge nor publication has been performed. Current commit-specific evidence is in [PR #1](https://github.com/MasadaMasayoshi/socode/pull/1).
