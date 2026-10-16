# Design handoff (design chat -> repository)

Purpose: bring output from a design chat into socode safely, then commit/push with GitHub Desktop.

## What the design chat should deliver
- Visual changes as CSS only: replacement rules for `style.css` (selectors that already exist) or clearly named new classes. Do not change JS behaviour, element ids, data attributes or Japanese text.
- If markup must change, give the exact `index.html` / template-string fragment with old -> new, and list every id/class that changes.
- Colours, spacing and font sizes as CSS variables (`:root`), light and dark (`prefers-color-scheme`) both defined.
- A screenshot or HTML preview of the intended result, with the target screen (tab name) and viewport (phone / tablet / desktop).
- One screen per delivery; list files touched.

## What Claude does with it
1. Applies the CSS/markup to the repo files (never rewrites logic; ids and classes used by js/ stay).
2. Runs only the relevant tests plus `app-files-order` and golden; stamps the version (`scripts/file-versions.json`, `index.html`, `?v=`).
3. Writes the files to both device folders, commits and pushes to `main` with GitHub Desktop, and verifies the deployed `app-version`.

## Prompt to paste into the design chat
"Deliver design changes for the nursing-assessment app as (1) a CSS patch for style.css using existing selectors or new clearly named classes, (2) exact old->new fragments for any markup change, (3) CSS variables with light and dark values, (4) a preview and the target tab and viewport. Do not change JS, ids, data attributes or Japanese wording. Keep it to one screen per delivery."
