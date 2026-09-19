/**
 * A pillar handle for inventory's sync mutation protocol, and the helpers
 * every placement/container/lifecycle tool in this directory shares: fetch
 * an item's current revision, then send one command as a one-mutation batch
 * and return its outcome.
 *
 * Separate from `pillar-client.ts`'s default handle because every sync route
 * requires an outbound `Pops-Inventory-Protocol` header the default handle has
 * no reason to send (Inventory ADR-002 D10) -- mirrors bfm's
 * `pillars/bfm/src/api/inventory/handle-factory.ts`, which carries the same
 * header for the same reason. A call made here carries no `Pops-Actor`
 * header, so the inventory pillar records it against this build's own
 * service account (`service:<account>`, `rest-sync.ts`) rather than against
 * a device -- exactly how an MCP-driven change should read in an item's
 * history.
 */
import { getPillar } from '../pillar-client.js';

import type { CallResult } from '@pops/pillar-sdk/client';
import type { PillarHandle } from '@pops/pillar-sdk/server';

const INVENTORY_PROTOCOL_HEADER = 'pops-inventory-protocol';

/**
 * The sync wire shape this build understands. Mirrors the producer's own
 * seeded minimum (`min_protocol` in `0012_items_single_identity.sql`); raise
 * both together if the mapping here ever depends on a newer shape.
 */
const INVENTORY_SYNC_PROTOCOL_VERSION = '1';

/** One mutation, exactly as `POST /sync/mutations` expects it on the wire. */
export interface InventoryMutationEnvelope {
  mutationId: string;
  op: string;
  entityId: string;
  baseRevision: number | null;
  dependsOn: string[];
  clientTime: string;
  args: unknown;
}

/** One mutation's result, as the sync protocol reports it. */
export type MutationOutcome =
  | { mutationId: string; status: 'applied'; revision: number; seq: number; converged: boolean }
  | { mutationId: string; status: 'conflict'; kind: string; [key: string]: unknown }
  | { mutationId: string; status: 'rejected'; reason: string; message: string }
  | { mutationId: string; status: 'deferred'; waitingOn: string };

type InventorySyncShape = {
  sync: {
    mutations: (input: { mutations: InventoryMutationEnvelope[] }) => {
      outcomes: MutationOutcome[];
      highWaterSeq: number;
    };
  };
  web: {
    get: (input: { id: string }) => { item: { id: string; revision: number } };
  };
};

function inventorySync(): PillarHandle<InventorySyncShape> {
  return getPillar<InventorySyncShape>('inventory', {
    extraHeaders: () => ({ [INVENTORY_PROTOCOL_HEADER]: INVENTORY_SYNC_PROTOCOL_VERSION }),
  });
}

/** The revision an item is at right now, for a `baseRevision` check-then-write. */
export async function fetchItemRevision(id: string): Promise<CallResult<number>> {
  const result = await inventorySync().web.get({ id });
  if (result.kind !== 'ok') return result;
  return { kind: 'ok', value: result.value.item.revision };
}

/**
 * Send one command as a one-mutation batch and return its outcome.
 * `mutationId` is minted fresh per call: MCP tools are one-shot LLM actions,
 * not a queued replica replaying the same change until it is acknowledged,
 * so there is no idempotency key worth preserving across a retry.
 */
export async function sendItemMutation(
  entityId: string,
  op: string,
  args: unknown,
  baseRevision: number | null
): Promise<CallResult<MutationOutcome>> {
  const envelope: InventoryMutationEnvelope = {
    mutationId: crypto.randomUUID(),
    op,
    entityId,
    baseRevision,
    dependsOn: [],
    clientTime: new Date().toISOString(),
    args,
  };
  const result = await inventorySync().sync.mutations({ mutations: [envelope] });
  if (result.kind !== 'ok') return result;
  const outcome = result.value.outcomes[0];
  if (outcome === undefined) {
    return { kind: 'bad-request', pillar: 'inventory', message: 'mutation returned no outcome' };
  }
  return { kind: 'ok', value: outcome };
}

/**
 * Fetch `id`'s current revision and, only once that succeeds, run `send`
 * with it as the mutation's `baseRevision`. A revision-fetch failure (most
 * often `not-found`) short-circuits and is returned as-is.
 */
export async function withCurrentRevision(
  id: string,
  send: (baseRevision: number) => Promise<CallResult<MutationOutcome>>
): Promise<CallResult<MutationOutcome>> {
  const revision = await fetchItemRevision(id);
  if (revision.kind !== 'ok') return revision;
  return send(revision.value);
}
