# US-07: Post-Ingest Review and Edit

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Not started

## Description

As a user who just captured an engram in capture mode (US-01) or via the global hotkey (US-09), I want the result view to surface what the curation worker inferred and let me edit any of it inline so that I can correct mistakes without leaving the capture flow and without ever filling a form upfront.

## Acceptance Criteria

- [ ] Immediately after `cerebrum.ingest.quickCapture` succeeds, the result view shows the engram id, file path, source, and the fallback scope assigned at write time
- [ ] The result view subscribes to enrichment status for the engram id and updates in place when the curation worker finishes — without a manual refresh
- [ ] When enrichment completes, the inferred `type`, `template`, `scopes`, and `tags` appear as editable chips/fields on the same card; the body of the engram is not re-displayed (the user just typed it)
- [ ] Each chip is editable in place — clicking a chip opens a popover with the same picker semantics as the Advanced form (type selector, scope autocomplete from `cerebrum.scopes.list`, tag autocomplete from `cerebrum.tags.list`)
- [ ] Edits call `cerebrum.engrams.update` with the changed field only and reflect the new value on success without a full re-fetch
- [ ] An "Open in editor" link navigates to the engram detail page (PRD-077) for full body editing, version history, and deletion
- [ ] If enrichment is still pending when the user navigates away, the next visit to the engram detail page shows the same inferred values as soon as they're available (no state lost)
- [ ] If enrichment fails (LLM error, queue failure), the result view shows a "retry enrichment" action that re-enqueues the `classifyEngram` job for the same engram id
- [ ] A "Capture another" action resets the surface to an empty body editor without leaving the page, preserving keyboard focus on the body input

## Notes

- The async enrichment job is `classifyEngram` on the `pops-curation` BullMQ queue, handled by `apps/pops-api/src/jobs/handlers/curation.ts`. The handler is idempotent via the `_enrichedHash` custom field — re-running it on unchanged content is a no-op.
- For enrichment status updates, prefer SSE or polling against a new `cerebrum.ingest.enrichmentStatus` query (input: `engramId`) over adding websockets just for this view. Polling at 1 s for the first 10 s, then 5 s for the next 30 s, then stop and require manual refresh is acceptable.
- The chip edit popovers should reuse the existing `ScopePicker` and `TagPicker` components rather than re-implementing autocomplete.
- The "retry enrichment" action requires exposing a small mutation that enqueues `{ type: 'classifyEngram', engramId }` on the curation queue — this can sit on the existing `cerebrum.ingest` router.
- This US assumes the engram already exists; there is no creation path here. Creation is US-01 (capture mode) or US-02 (agent input).
