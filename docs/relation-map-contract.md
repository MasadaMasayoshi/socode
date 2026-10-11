# Relation-map data and persistence contract

Preserve existing SVG rendering, patient synchronization, `cp.relationMap.version: 2`, node `type/label/x/y/itemIds` and edge `source/target/relation`. Clinical extensions use `schemaVersion: "1.0.0"`. Reject other-patient/unknown-schema imports without altering stored data; opening an older rule-version map does not regenerate it.

## Clinical metadata

Add `vital`, `medication`, `assessment` to the existing eight types. Nodes retain `epistemicStatus` (observed/reported/assessed/inferred/predicted/planned), certainty, origin, effective time and `sourceRefs: {sourceType: "card" | "assessment", sourceId, patientId}`. Preserve relative time; never invent an absolute timestamp.

Observations use `{name, value, unit}`; medication uses `{name, eventType}` with order/administered/reported/stopped/unknown. A drug name without explicit administration remains unknown. Inferences are not source facts; future risks are predicted. Record generation enriches related nodes; standalone import can add medication/assessment nodes without fabricating causal edges. Preserve extracted units/times and flag isolated nodes.

## Evidence and interaction

Traverse support/cause/influence edges for evidence, excluding contradiction, chronology and mere association. Track visited IDs to terminate cycles. Exclude deleted/other-patient cards from plan evidence; carry IDs into `mapEvidenceRefs` and retain legacy text evidence. List/edit views show node state/time/evidence and edge meaning. Screen/print/PNG identify inferred, predicted and planned content. Bidirectional interactions prompt review rather than automatic deletion.

## Conflicts

Existing patient PUT/bulk sync owns persistence. Server-managed `relationMapRevision` is checked inside serialized JSON writes or MongoDB CAS. GET `/api/patients/:id/relation-map` returns map/revision and strong `ETag: "relation-map-N"`. PUT uses `If-Match`; stale revisions return 412. Body revision checks also protect older clients and exit synchronization.

Keep conflicting local maps unsaved. Before accepting the latest server map, verify a localStorage checkpoint; abort replacement if saving fails. Retain multiple checkpoints and JSON export.

## Verification and limits

`relation-map-clinical.test.js` covers metadata round trips, epistemic states, cycles, ownership, escaping and imports. `relation-map-conflict.test.js` covers actual HTTP concurrency, bulk sync, damaged references and replacement. Existing plan/map/MongoDB checks remain.

Historical fixture status is documented in [migration](public-regression-migration-20261010.md); missing legacy originals are not silently replaced. Proposed renderer replacement, patient authorization, audit requirements, FHIR, structured dose/route/frequency, facility ranges and complete clinical review are not implemented by this extension. Unverifiable attachment reference IDs are not treated as verified laws, dates or library-size facts.
