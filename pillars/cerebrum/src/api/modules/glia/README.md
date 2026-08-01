# Glia trust router

Records every curation action as a row in `glia_actions` and tracks, per action
type, how much autonomy that type has earned. The three-phase model and why it
exists are in
[ADR-021](../../../../docs/architecture/adr-021-glia-trust-graduation.md).

## The action ladder

Who moves a row, in order:

1. `action-service.ts` `createAction` writes it. The current phase decides the
   starting status: `propose` writes `pending` for review; `act_report` and
   `silent` write straight to `executed`.
2. `decideAction` moves a `pending` row to `approved` or `rejected` (409 from
   any other status).
3. `executeAction` moves an `approved` row to `executed`.
4. `revertAction` moves an `executed` row to `reverted`; an already-`reverted`
   row is returned unchanged, `audit` is rejected with 400, anything else 409.
   The DB flip and the file-level undo in `revert-operations.ts` are separate
   steps and `glia-handlers.ts` runs the DB flip first, so a failed undo leaves
   a `reverted` row whose files were not restored.

## Nothing feeds it on a running system

`GliaActionService.createAction` has no caller outside the test suites. The four
scanners in `../workers` build their own in-memory `GliaAction` objects and
return them from the `run*` endpoints without inserting anything. `glia_actions`
therefore stays empty in production, and the proposal queue and audit-trail
pages render nothing however many worker runs are triggered.

`seedTrustStates()` is likewise only called by tests — no boot hook and no
migration runs it.

## Thresholds

`toml-config.ts` is the pillar's only reader of `glia.toml`, and no section
other than `[trust.graduation]` is consulted anywhere. Lowering a threshold
never graduates retroactively: `checkGraduation` runs only from the decide and
revert handlers, so a fresh decision or revert is what fires a transition.
