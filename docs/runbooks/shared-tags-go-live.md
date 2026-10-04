# Runbook: Bring Shared Tags Live

> Audience: the operator completing POPS-5417 after the POPS-5382 implementation is ready.
> Related: [ADR-056](../architecture/adr-056-shared-tags-vocabulary-central-assignments-per-pillar.md), [Take One Pillar Live](pillar-go-live.md), and [Cut a Pops Release](cut-release.md).
> Code references: [`infra/docker-compose.yml`](../../infra/docker-compose.yml), [`infra/litestream/tags.yml`](../../infra/litestream/tags.yml), [`ORCHESTRATOR_SERVICE_ACCOUNT_SCOPES`](../../pillars/orchestrator/src/service-account.ts), and [service-account scope matching](../../libs/sdk/src/server/service-account-scope.ts).

> **Operator-only production procedure.** Every production step below requires an approved change. This page is not authorization and does not claim that any production change or verification has happened. Keep host edits in a reviewed PR to `knoxio/homelab-infra`; never put credentials, key values, host URLs, or account IDs in this repository.

This runbook follows the shared-vocabulary and per-pillar-assignment model in ADR-056. The `tags` pillar owns tag definitions; Finance and Purchases own the assignments on their own rows. POPS-5417 depends on the other POPS-5382 tickets and accepts the end-to-end flow when one finance transaction and one purchase item are returned for the Brazil trip tag, with both carrier statuses `ok`.

## 1. Confirm readiness and approval

Before making a production change, the operator must:

- Obtain approval for the production change and identify the approved rollback owner.
- Confirm the code work required by POPS-5417 is merged through the normal integration and release gates. In particular, the `tags.things.list` and `tags.assignments.attach` / `tags.assignments.detach` MCP tools must be available in the released build; the `shared-tags-integration` branch is staging and does not deploy.
- Confirm there is a verified backup and a usable recovery path for each affected pillar database. These databases are independent; a backup of one does not cover the others. Follow [Take One Pillar Live](pillar-go-live.md) for per-pillar recovery.
- Confirm the deployer can provision the `tags-api` volume and Litestream sidecar from the reviewed homelab change, and that the required secret can be placed in the host vault before a compose change references it.

If approval, a database backup, or a recovery path is missing, stop before changing production.

## 2. Pass the POPS-5394 fleet-compatibility gate

`ManifestPayloadSchema` is strict. An image built before POPS-5394 rejects a registry snapshot containing a carrier's `tags` block. Merging the schema change is not proof that the running fleet has it.

Before promoting or deploying any carrier manifest that declares `tags`:

1. Verify that the POPS-5394-compatible parser build has been published and rolled to every running service that parses the registry snapshot, including every pillar, the shell, and the registry.
2. Verify the running image identity for each such service; do not infer fleet coverage from a merged commit, the `main` tag, or a Watchtower configuration alone.
3. Confirm the registry snapshot can be read by the rolled fleet while no carrier declaration is being introduced by this change.
4. Record the service/image inventory and successful snapshot check on POPS-5382 after the approved rollout.

**Stop** if any snapshot-reading service is still on an older image, is unhealthy, or cannot read the snapshot. Do not promote a carrier declaration until the whole-fleet check passes. Use the normal promotion and release process in [Cut a Pops Release](cut-release.md); never deploy the integration branch directly.

## 3. Coordinate promotion and tags-service rollout

After the compatibility gate passes, promote the reviewed shared-tags implementation through the repository's required CI and PR Review gates. The Finance and Purchases manifests may declare their carrier blocks only after the gate above is recorded. Use the normal release flow; `shared-tags-integration` is staging and does not deploy.

Coordinate that release with a reviewed PR in `knoxio/homelab-infra` that adds the `tags-api` service, its persistent volume, and its Litestream sidecar, mirroring the repository compose and Litestream references above. Apply the host change through the deployer's normal approved release process after the tags image is published; do not edit the running host by hand. Create the orchestrator service account and place its key in the host's file-secret store. Add the vault entry before any compose change references it. The orchestrator reads the mounted file through `POPS_INTERNAL_API_KEY_FILE`; do not copy the key into a compose value, shell history, this runbook, or Huly evidence.

Do not create or assign tags while the tags image is unavailable or the `tags` service is unhealthy. Once the release and host change are applied, verify through the registry that:

- `tags` is registered and healthy.
- Finance declares the `transaction` carrier.
- Purchases declares the `purchase-item` carrier.

Do not proceed if a carrier manifest is rejected, absent, or malformed. Resolve the release or registry issue before adding assignments.

## 4. Grant only the required scopes

The following are the shared-tags operation grants from the integration source. They are proposed grants, not production approval:

| Consumer           | Shared-tags grants                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Orchestrator (new) | `contacts.search.search`, `purchases.search.search`, `tags.tags`, `finance.tagged`, `purchases.tagged` |
| MCP gateway        | `tags.tags`, `finance.tagged`, `purchases.tagged`                                                      |
| Finance            | `tags.tags`                                                                                            |
| Purchases          | `tags.tags`                                                                                            |

The Orchestrator's full grant set is pinned in [`service-account.ts`](../../pillars/orchestrator/src/service-account.ts). Finance and Purchases also pin their outbound grant arrays in their [Finance](../../pillars/finance/src/api/pillars/service-account.ts) and [Purchases](../../pillars/purchases/src/api/pillars/service-account.ts) service-account modules. MCP's tag vocabulary and assignment tools declare the required scopes in [`tags-shape.ts`](../../pillars/mcp/src/tools/tags-shape.ts) and [`tags-assignments.ts`](../../pillars/mcp/src/tools/tags-assignments.ts). Exact mounted secret references for all four consumers are in the [service-account rotation runbook](shared-tags-service-account-rotation.md).

Every added scope needs explicit owner approval before production use. The narrow `tags.tags` scope covers vocabulary operations; the parent `tags` scope authorizes every `tags.*` operation because scopes match by dotted prefix. Do not silently grant the parent scope or a wildcard.

The Registry admin API has only list, create, and revoke operations; it cannot update an account's scopes in place. Use the [replacement-account rotation workflow](shared-tags-service-account-rotation.md): preserve the full existing scope list, add only approved grants, install and verify the replacement secret while the old account remains active, then revoke the old account only after the consumer is healthy. Never append scopes by editing Registry SQLite or by an undocumented database procedure.

## 5. Verify vocabulary and carrier data

After the service and scopes are in place, use the approved operator path to verify each item below. These are production actions and must be performed by the approved operator:

1. Confirm the `tags` service is healthy and registered, and its Litestream sidecar uses the same tags volume as the API.
2. Confirm Finance's sync has linked `trip:cairns-2026`, `trip:hunter-valley-2026`, and the five existing `hobby:*` values to shared tag IDs. Stop if a value is missing or maps ambiguously; do not invent replacement tags as part of this check.
3. Create the shared tag with facet `trip`, name `Brazil 2026`, window start `2026-11-01`, and region `Brazil`. The contract stores date-only `YYYY-MM-DD` values, so this represents the first day of POPS-5417's requested November 2026 window. Use the ID returned by the tags service; tag names are not identifiers.
4. Attach that ID to one approved finance transaction and one approved purchase item using `tags.assignments.attach`. Confirm each result before proceeding. These are separate pillar writes, not one atomic operation.
5. Call `tags.things.list` for the new tag. Confirm the result contains one finance transaction and one purchase item and reports both carrier pillars as `ok`.

If an attach succeeds for one pillar and fails for the other, stop. Record which write succeeded and reconcile the current assignments before retrying; do not assume the cross-pillar operation rolled back or blindly detach the successful assignment.

## 6. Record evidence

After the smoke check passes, record the evidence on POPS-5382 as required by POPS-5417:

- The release/commit and running image identities used for the POPS-5394 fleet check.
- The successful whole-fleet snapshot-compatibility result.
- The registry status of `tags`, Finance, and Purchases, plus their carrier entity types.
- The tag ID, the returned finance and purchase-item entities, and each pillar's `ok` status.
- The granted scope names and confirmation that pre-existing scopes were preserved; never include secret values.

Keep the evidence limited to what is needed for the acceptance check and follow the applicable data-handling rules for entity references.

## Stop conditions and rollback order

- **Compatibility gate fails:** stop before promotion. Roll out the compatible parser fleet and repeat the checks in section 2.
- **Registry rejects a carrier manifest or an older parser is found after promotion:** stop further promotion. First roll back the carrier services to manifests without `tags` and verify the registry snapshot no longer contains carrier blocks. Only then may an older parser image be restored. Never run an old parser against a snapshot that still contains `tags`.
- **Tags service, Litestream, or a carrier is unhealthy:** stop tag creation and assignments. Preserve current data, resolve health and backup issues through the approved per-pillar recovery procedure, then repeat the read-only checks before continuing.
- **A scope check fails:** stop the tool call. Correct only the missing operation scope through the approved procedure; do not grant a broader or wildcard scope to make the check pass.
- **The approved MCP grant still says `tags`:** stop before minting or updating the production account and resolve the discrepancy above with the ticket owner. Do not use the parent scope merely to satisfy a checklist.
- **Sync or list results are missing, ambiguous, malformed, or report any carrier other than `ok`:** stop. Do not treat a partial result as a successful empty result, and do not add more assignments until the failure is resolved.
- **Any partial assignment or unexpected data change occurs:** stop writes and reconcile each affected pillar independently. Do not clear a database, delete a tag, or restore a database as an improvised rollback; use the approved recovery process.
