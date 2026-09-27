/**
 * bfm's inventory leg: the mobile replica sync routes, expressed as calls to
 * the inventory pillar's own sync protocol (its `src/contract/rest-sync.ts`).
 *
 * The inventory pillar built this protocol to be relayed as-is — its own
 * contract header says so — so unlike `finance`/`purchases` there is no
 * reshaping step here: `mobile-inventory-schemas.ts`'s schemas mirror the
 * producer's field-for-field, and `parseOrMismatch` is what stands between a
 * producer rename and a phone reading `undefined`.
 *
 * `Pops-Inventory-Protocol` is not the caller's business: it names the WIRE
 * SHAPE this build of bfm understands, so it travels on every call this
 * client makes, sourced from {@link INVENTORY_SYNC_PROTOCOL_VERSION} rather
 * than from anything the phone sent. A phone never sees this header —
 * `/mobile/inventory/*` has its own contract, versioned independently through
 * bfm's own OpenAPI and Swift codegen.
 */
import {
  MobileCodeSuggestResponseSchema,
  MobileMutationsResponseSchema,
} from '../../contract/mobile-inventory-mutation-schemas.js';
import {
  MobileInventoryChangesSchema,
  MobileInventoryItemHistorySchema,
  MobileInventorySnapshotSchema,
} from '../../contract/mobile-inventory-schemas.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { createMobileInventoryCatalogueClient } from './catalogue-client.js';
import { withInventoryActor } from './handle-factory.js';

import type {
  MobileCodeSuggestResponse,
  MobileMutation,
  MobileMutationsResponse,
} from '../../contract/mobile-inventory-mutation-schemas.js';
import type {
  MobileInventoryChanges,
  MobileInventoryItemHistory,
  MobileInventorySnapshot,
} from '../../contract/mobile-inventory-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';
import type {
  InventoryCatalogueRouter,
  MobileInventoryCatalogueClient,
} from './catalogue-client.js';

/** The inventory pillar id — matches its registered manifest name. */
export const INVENTORY_PILLAR_ID = 'inventory';

/** The subset of inventory's router bfm calls. See `client.ts` header. */
export type InventorySyncRouter = InventoryCatalogueRouter & {
  sync: {
    snapshot: (input: { cursor?: string; limit?: number }) => Promise<unknown>;
    changes: (input: { since: number; epoch: string; limit?: number }) => Promise<unknown>;
    itemEvents: (input: { id: string; cursor?: string; limit?: number }) => Promise<unknown>;
    mutations: (input: { mutations: readonly MobileMutation[] }) => Promise<unknown>;
  };
  codes: {
    suggest: (input: { name: string; typeKey?: string; stem?: string }) => Promise<unknown>;
  };
};

export interface SnapshotRequest {
  readonly cursor: string | null;
  readonly limit: number;
}

export interface ChangesRequest {
  readonly since: number;
  readonly epoch: string;
  readonly limit: number;
}

export interface ItemHistoryRequest {
  readonly itemId: string;
  readonly cursor: string | null;
  readonly limit: number;
}

export interface MutationsRequest {
  readonly mutations: readonly MobileMutation[];
  /**
   * `device:<deviceId>;label=<percent-encoded label>`, built by
   * `api/inventory/actor-header.ts` from the device `requireDevice` resolved.
   * Sent as `Pops-Actor` for the duration of this call only
   * (`handle-factory.ts`'s `withInventoryActor`).
   */
  readonly actorHeader: string;
}

export interface SuggestCodesRequest {
  readonly name: string;
  readonly typeKey: string | null;
  readonly stem: string | null;
}

export interface MobileInventoryClient extends MobileInventoryCatalogueClient {
  snapshot(request: SnapshotRequest): Promise<GatewayOutcome<MobileInventorySnapshot>>;
  changes(request: ChangesRequest): Promise<GatewayOutcome<MobileInventoryChanges>>;
  itemHistory(request: ItemHistoryRequest): Promise<GatewayOutcome<MobileInventoryItemHistory>>;
  mutations(request: MutationsRequest): Promise<GatewayOutcome<MobileMutationsResponse>>;
  suggestCodes(request: SuggestCodesRequest): Promise<GatewayOutcome<MobileCodeSuggestResponse>>;
}

async function callSnapshot(
  gateway: PillarGateway,
  request: SnapshotRequest
): Promise<GatewayOutcome<MobileInventorySnapshot>> {
  const outcome = await gateway.call<InventorySyncRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.sync.snapshot({
      ...(request.cursor === null ? {} : { cursor: request.cursor }),
      limit: request.limit,
    })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileInventorySnapshotSchema,
    'sync.snapshot'
  );
}

async function callChanges(
  gateway: PillarGateway,
  request: ChangesRequest
): Promise<GatewayOutcome<MobileInventoryChanges>> {
  const outcome = await gateway.call<InventorySyncRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.sync.changes({ since: request.since, epoch: request.epoch, limit: request.limit })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileInventoryChangesSchema,
    'sync.changes'
  );
}

async function callItemHistory(
  gateway: PillarGateway,
  request: ItemHistoryRequest
): Promise<GatewayOutcome<MobileInventoryItemHistory>> {
  const outcome = await gateway.call<InventorySyncRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.sync.itemEvents({
      id: request.itemId,
      ...(request.cursor === null ? {} : { cursor: request.cursor }),
      limit: request.limit,
    })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileInventoryItemHistorySchema,
    'sync.itemEvents'
  );
}

async function callMutations(
  gateway: PillarGateway,
  request: MutationsRequest
): Promise<GatewayOutcome<MobileMutationsResponse>> {
  const outcome = await withInventoryActor(request.actorHeader, () =>
    gateway.call<InventorySyncRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
      handle.sync.mutations({ mutations: request.mutations })
    )
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileMutationsResponseSchema,
    'sync.mutations'
  );
}

async function callSuggestCodes(
  gateway: PillarGateway,
  request: SuggestCodesRequest
): Promise<GatewayOutcome<MobileCodeSuggestResponse>> {
  const outcome = await gateway.call<InventorySyncRouter, unknown>(INVENTORY_PILLAR_ID, (handle) =>
    handle.codes.suggest({
      name: request.name,
      ...(request.typeKey === null ? {} : { typeKey: request.typeKey }),
      ...(request.stem === null ? {} : { stem: request.stem }),
    })
  );
  return parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MobileCodeSuggestResponseSchema,
    'codes.suggest'
  );
}

export function createMobileInventoryClient(gateway: PillarGateway): MobileInventoryClient {
  return {
    ...createMobileInventoryCatalogueClient(gateway),
    snapshot: (request) => callSnapshot(gateway, request),
    changes: (request) => callChanges(gateway, request),
    itemHistory: (request) => callItemHistory(gateway, request),
    mutations: (request) => callMutations(gateway, request),
    suggestCodes: (request) => callSuggestCodes(gateway, request),
  };
}
