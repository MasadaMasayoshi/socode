# Publication and recovery runbook

## Prepared release scope

The development branch is `review/nursing-classification-stage1`; PR #1 contains the candidate. Preparing an artifact does not merge, publish, enable shared access or establish clinical validity. On 2026-10-10 the owner accepted successful latest-code public regression and real-browser tests as sufficient for publication readiness. Independent expert review is also waived. Pending source/live-provider checks remain unverified follow-up work, not clinical approvals. Use fictional, de-identified educational observations for verification. Never put credentials, patient exports or historical private fixtures in the public payload.

## Required evidence

The `OCR-only regression checks` workflow must succeed on the exact candidate commit. Its `regression-validation-evidence` artifact records the tested commit and test counts; the `browser-smoke-screenshots` artifact includes `validation-evidence.json` and screenshots. Browser evidence covers Chromium at 390/768/1440px and seven fictional workflows. Its intercepted OCR transport explicitly does not establish live OCR success.

Download both evidence JSON files and run:

```bash
node scripts/check-release-readiness.js CANDIDATE_SHA regression.json browser.json docs/release-conditions.json
```

Exit status 1 means the active publication policy is unmet. The owner explicitly chose the test-based policy on 2026-10-10: complete successful public regression and real-browser evidence for the exact candidate commit are required. Old/failed/incomplete evidence still blocks publication. Pending live OCR, facility, clinical-source, manual accessibility and broader roadmap checks keep their original statuses as follow-up work. They are not relabeled verified or approved. Without a recorded owner policy the checker retains the previous strict requirements.

For live OCR, use a readable fictional image and a valid owner-configured Gemini credential through the existing image-input consent flow. Compare the response with a separately transcribed expected text. Record the candidate SHA, model, date and differences; do not record the credential. Check success, retry and failure recovery. A key connection test alone is insufficient.

Facility ranges require adopted values, units, methods, population and version/source. Graph/plan source review must check causal direction, patient ownership, timeline, pre-/post-admission separation and applicable populations. Existing candidates remain reference-only, with zero clinical approvals. Real-device/screen-reader review and the remaining operations/curriculum scope are tracked in `release-conditions.json`.

## Static release payload

The workflow produces `static-release-payload` without deploying it. An explicit allowlist includes runtime HTML/CSS/JS, fonts, knowledge assets and vendor licenses. It excludes the server, data directory, tests, private fixtures, configuration and developer documentation. Local HTML asset references and nonempty regular files are checked; `release-manifest.json` records paths, sizes and SHA-256 hashes.

For a local reproduction, use a new directory outside the repository:

```bash
npm ci
npm test
node scripts/prepare-release.js /tmp/nursing-public-candidate
```

Do not copy the whole repository into a static web host. Preserve relative asset paths and licenses. Prepare the artifact from the tested clean commit; any runtime modification needs fresh validation.

## Hosting and data boundary

GitHub Pages serves the static interface. The existing frontend points GitHub Pages hosts at the configured Render backend; other hosts use same-origin `/api`. Static packaging does not create a backend or authentication. Do not promise local-only storage on GitHub Pages: sharing/synchronization uses the configured backend. Do not expose real patient information through the shared educational backend. CORS is not authentication or authorization.

If backend deployment is included in the eventual release, verify its environment separately: `MONGODB_URI`, `MONGODB_DB_NAME`, allowed origins and durable storage/backup. Keep secrets in host configuration; never in a commit or artifact. Verify persistence across restart and isolate test data. A static artifact alone does not prove backend deployment readiness.

## Release and rollback

After all applicable conditions are met, record the exact commit, workflow URL, evidence reports and payload manifest in PR #1/issue #2. Obtain the owner's integration/publication instruction; this runbook does not authorize deployment. Preserve the previous published commit and asset manifest before any release.

Before changing a backend, save a recoverable database backup and verify a restore into an isolated test store. Do not erase existing browser records or shared data as a deployment step. If the release fails, redeploy the previous complete payload with its own version markers. Do not mix old and new JS files. Avoid database rollback unless a migration occurred and a verified recovery plan exists. Confirm the five primary views, fictional classification, save/reload and asset-version checks after rollback.
