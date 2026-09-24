/**
 * The inventory-types acceptance scenarios (POPS-4354): which test proves
 * each criterion, which implementation ticket it is evidence for, and which
 * ticket owns the gap when it does not pass.
 *
 * A criterion is matched to a test result by its id: every test title starts
 * with the id followed by a space (`S3.5 derives a volume ...`). A criterion
 * with no matching result is recorded as skipped, never as passed.
 */

/** @typedef {'vitest' | 'playwright' | 'maestro'} Layer */
/**
 * @typedef {{ id: string, description: string, gapTicket?: string }} ScenarioCriterion
 * @typedef {{
 *   id: string,
 *   title: string,
 *   ticket: string,
 *   layer: Layer,
 *   file: string,
 *   implementation: string,
 *   stack: string,
 *   limitations: string,
 *   criteria: ScenarioCriterion[],
 * }} Scenario
 */

/** The umbrella a criterion's gap is deferred to when no narrower ticket owns it. */
export const EPIC = 'POPS-4354';

const MCP_STACK =
  'real registry + inventory processes (and bfm where stated) spawned from the working tree on loopback, each scenario on its own temp sqlite databases; MCP tool handlers called in-process through pillar-client.ts and registry discovery';

/** @type {readonly Scenario[]} */
export const SCENARIOS = [
  {
    id: 'S1',
    title: 'Author a type and manage its items via MCP; verify via Inventory REST and BFM sync',
    ticket: 'POPS-4362',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s1-author-type-and-items.acceptance.test.ts',
    implementation:
      'pillars/mcp/src/tools/inventory-catalogue.ts, inventory-items-write.ts, inventory-item-delete.ts; pillars/inventory/src/catalogue/authoring*.ts; pillars/inventory/src/protocol/rollout.ts; pillars/bfm/src/api/rest/mobile-inventory-handlers.ts',
    stack: `${MCP_STACK}; bfm paired over POST /devices/pair`,
    limitations:
      'Single-process sqlite on loopback; no Cloudflare Access session (MCP service account with the inventory root scope stands in for the owner).',
    criteria: [
      {
        id: 'S1.1',
        description:
          'A draft with fields of every primitive kind (including reference and ordered many) previews without changing, is refused at protocol 2 until the rollout is activated, then publishes at protocol 2.',
      },
      {
        id: 'S1.2',
        description:
          'An item created via MCP carries a value for every kind, read back identically via MCP and Inventory REST.',
      },
      {
        id: 'S1.3',
        description:
          'An MCP edit reorders an ordered many-reference, clears an optional field, and a stale revision is refused.',
      },
      {
        id: 'S1.4',
        description:
          'A paired phone syncs the protocol-2 catalogue revision and the item, values in order, through BFM.',
      },
      {
        id: 'S1.5',
        description:
          'change-type and delete via MCP apply, and the phone sees the tombstone in the BFM change feed.',
      },
    ],
  },
  {
    id: 'S2',
    title: 'Evolve a published type via MCP',
    ticket: 'POPS-4361',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s2-evolve-type.acceptance.test.ts',
    implementation:
      'pillars/inventory/src/catalogue/compatibility*.ts, migration*.ts, authoring-publication.ts, item-value-validation.ts; pillars/mcp/src/tools/inventory-catalogue.ts, inventory-catalogue-read.ts',
    stack: MCP_STACK,
    limitations: 'Only the set_default migration step is exercised end to end.',
    criteria: [
      {
        id: 'S2.1',
        description:
          'A compatible rename publishes without a migration; IDs and values are unchanged.',
      },
      {
        id: 'S2.2',
        description: 'An archived field keeps existing values and refuses new writes.',
      },
      {
        id: 'S2.3',
        description: 'A retired enum option stays on existing items and is refused on new ones.',
      },
      {
        id: 'S2.4',
        description:
          'A migration_required change is refused without a migration and applied with a declared one.',
      },
      {
        id: 'S2.5',
        description:
          'The catalogue audit records every publication, newest first, with its migration.',
      },
    ],
  },
  {
    id: 'S3',
    title: 'Computed fields end to end',
    ticket: 'POPS-4364',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s3-computed-fields.acceptance.test.ts',
    implementation:
      'pillars/inventory/src/catalogue/expression-*.ts, computed-values.ts, effective-item-values.ts, computed-dependency-index.ts; pillars/inventory/src/domain/commands/search-index.ts; pillars/mcp/src/tools/inventory-item-overrides.ts',
    stack: `${MCP_STACK}; bfm paired over POST /devices/pair`,
    limitations: 'Evaluated server-side only; phone-side evaluation is covered by S8.',
    criteria: [
      {
        id: 'S3.1',
        description:
          'Same-item arithmetic, coalesce and a two-hop reference read evaluate; a missing dependency is unavailable.',
      },
      {
        id: 'S3.2',
        description: 'An override replaces the computed value; clearing it resumes computation.',
      },
      {
        id: 'S3.3',
        description:
          'Editing a two-hop dependency re-sends the dependent item to the phone at its own revision.',
      },
      {
        id: 'S3.4',
        description: 'Search finds an item by a computed value no stored field holds.',
      },
      {
        id: 'S3.5',
        description: 'A volume in L derives from width × height × depth in cm.',
      },
    ],
  },
  {
    id: 'S4',
    title: 'Catalogue draft concurrency',
    ticket: 'POPS-4406',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s4-draft-concurrency.acceptance.test.ts',
    implementation:
      'pillars/inventory/src/catalogue/authoring-draft-version.ts, authoring-publication.ts; pillars/inventory/src/api/rest/type-catalogue-handlers.ts',
    stack: MCP_STACK,
    limitations:
      'The publish/edit race outcome is whichever request SQLite serialises first; both outcomes are asserted.',
    criteria: [
      {
        id: 'S4.1',
        description:
          'A stale expectedDraftVersion is refused with 409 and changes nothing; reload and retry succeeds.',
      },
      {
        id: 'S4.2',
        description:
          'A publication racing an edit lets exactly one win; the loser changes nothing.',
      },
      {
        id: 'S4.3',
        description: 'Publishing at a stale draft version is refused and publishes nothing.',
      },
    ],
  },
  {
    id: 'S5',
    title: 'Offline replay across a catalogue publication, through BFM',
    ticket: 'POPS-4405',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s5-offline-replay.acceptance.test.ts',
    implementation:
      'pillars/inventory/src/domain/commands/command-catalogue.ts; pillars/bfm/src/api/inventory/client.ts; pillars/bfm/src/api/rest/mobile-inventory-handlers.ts',
    stack: `${MCP_STACK}; bfm paired over POST /devices/pair`,
    limitations:
      'The phone is simulated by HTTP envelopes shaped like the iOS queue; S8 drives the real app.',
    criteria: [
      {
        id: 'S5.1',
        description:
          'A create authored at N against a renamed field rebases onto N+1 and applies once.',
      },
      {
        id: 'S5.2',
        description:
          'An edit authored at N to an archived-and-replaced field returns catalogue_repair_required and changes nothing.',
      },
      {
        id: 'S5.3',
        description:
          'A mixed offline batch answers per mutation, in order, byte-stable across retries.',
      },
    ],
  },
  {
    id: 'S6',
    title: 'Protocol-1 refusal and protocol-2 success at the BFM boundary',
    ticket: 'POPS-4398',
    layer: 'vitest',
    file: 'pillars/mcp/src/acceptance/s6-protocol-boundary.acceptance.test.ts',
    implementation:
      'pillars/inventory/src/api/sync/protocol.ts, protocol/rollout.ts; pillars/bfm/src/api/rest/inventory-protocol-error.ts, api/inventory/handle-factory.ts',
    stack: `${MCP_STACK}; bfm paired over POST /devices/pair, reaching inventory through a header-rewriting proxy`,
    limitations:
      'A protocol-1 BFM is simulated by rewriting the protocol header in a proxy, not by running an old BFM build.',
    criteria: [
      {
        id: 'S6.1',
        description:
          'Inventory refuses a protocol-1 sync client with 426 client_too_old and serves protocol 2.',
      },
      {
        id: 'S6.2',
        description: 'The phone syncs through a protocol-2 BFM and is told the minimum is 2.',
      },
      {
        id: 'S6.3',
        description:
          'A protocol-1 relay surfaces to the phone as 426 client_too_old on reads and writes.',
      },
      { id: 'S6.4', description: 'The rollout refuses a downgrade and an unsupported protocol.' },
    ],
  },
  {
    id: 'S7',
    title: 'Web type editor against a real Inventory',
    ticket: 'POPS-4363',
    layer: 'playwright',
    file: 'pillars/shell/e2e/inventory-type-editor.acceptance.spec.ts',
    implementation:
      'pillars/inventory/app/src/pages/TypeCataloguePage.tsx, useTypeCataloguePage.ts; pillars/inventory/app/src/catalogue-editor/*',
    stack:
      'Chromium via Playwright against the shell Vite dev server; /inventory-api forwarded to real registry + inventory processes with a service-account key',
    limitations:
      'The browser acts through a service account, not a Cloudflare Access owner session; the shell registry is stubbed as in every other spec.',
    criteria: [
      {
        id: 'S7.1',
        description:
          'Create a type, add a field, preview, and publish at protocol 2 from the browser.',
      },
      {
        id: 'S7.2',
        description:
          'A save against a draft another editor moved shows the conflict; reload then retry succeeds.',
      },
      {
        id: 'S7.3',
        description:
          'A migration_required change is refused in the browser, naming the named-migration route.',
      },
      {
        id: 'S7.4',
        description: 'The migration_required refusal names the MCP publish tool.',
      },
      {
        id: 'S7.5',
        description:
          'The computed expression builder edits a computed field and names the MCP publish route.',
      },
    ],
  },
  {
    id: 'S8',
    title: 'iOS: a user-defined type end to end on the phone',
    ticket: 'POPS-4359',
    layer: 'maestro',
    file: 'clients/ios/.maestro/acceptance/inventory-user-defined-type.yaml',
    implementation:
      'clients/ios/Packages/FeatureInventory/Sources/FeatureInventory/Form/InventoryProtocol2*.swift, Detail/InventoryComputedDetailLine.swift; clients/ios/Packages/InventoryReplica',
    stack:
      'iOS Simulator app built from the working tree, real bfm + real inventory from scripts/ios-e2e/run.mjs, Maestro',
    limitations: 'Runs only on a macOS host with Xcode, a simulator and Maestro.',
    criteria: [
      {
        id: 'S8.1',
        gapTicket: 'POPS-4508',
        description:
          'A user-defined type syncs, an item is created and edited through generic fields, its computed value shows, and an offline edit replays.',
      },
    ],
  },
];
