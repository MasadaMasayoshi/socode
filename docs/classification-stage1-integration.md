# Classification stage 1 — integration notes (review branch)

This branch records the proposed improvements without changing the live application's layout or patient data.

## Required changes to the current modular codebase

The current site uses `js/01–15` modules and marks root `app.js` as unused. The earlier stage-1 patch targets an older monolithic `app.js` and **must not be copied directly over current files**.

1. Do not classify a patient quotation as Henderson 10 (communication) merely because it is a quotation. Classify based on its meaning.
2. Do not automatically assign multiple Henderson needs based solely on disease names in diagnosis/history fields. Retain disease knowledge as suggestions that require evidence review.
3. Do not assign Henderson 2 (eating/drinking) solely because a record is a laboratory value or vital sign.
4. Preserve meaningful respiratory observations and the user-specified rule that insurance information belongs to Henderson 9 (environment).
5. Add tests using synthetic cases against the actively loaded modular classification functions.

## Safety and scope

- No personal patient information.
- No changes to site layout, positioning, or visuals.
- No patient-specific classification rules.
- Keep distinctions between observed facts, inferred risk, and general clinical knowledge.
- Do not promote a single correction into a global rule without contextual checks.

## Implementation status

This is the historical integration proposal. The modular classification changes and fictional regressions have since been implemented; see `release-work-20261010.md` and `public-regression-migration-20261010.md` for current scope. The older monolithic patch remains unsuitable for direct replacement.
