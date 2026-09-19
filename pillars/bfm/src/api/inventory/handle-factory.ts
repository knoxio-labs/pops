/**
 * The one place bfm builds a `PillarHandle` for inventory directly (rather
 * than through {@link PillarGateway}'s generic default), because this leg
 * needs an outbound header the shared gateway has no way to add: see
 * {@link createInventoryPillarHandleFactory}.
 *
 * Kept apart from `client.ts` on purpose. `check-cross-pillar-expectations.mjs`
 * cannot resolve a `pillar<TRouter>()` call whose router type is a bare
 * generic parameter — this factory builds a handle without calling any
 * operation on it, so there is nothing for that guard to pin — and it excuses
 * a whole FILE at a time (`UNPINNABLE_CALL_SITES`). Folding this into
 * `client.ts` would excuse every real, pinnable operation call in it too.
 */
import { pillar } from '@pops/pillar-sdk/server';

import { INVENTORY_PILLAR_ID } from './client.js';

import type { PillarHandleFactory } from '../pillars/gateway.js';

/**
 * The header inventory's sync protocol requires on every route, lower-cased
 * as the SDK's outbound `fetch` sends it. Mirrors
 * `pillars/inventory/src/contract/rest-sync.ts`'s `PROTOCOL_HEADER` — not
 * imported, because bfm has no build-time dependency on the inventory pillar
 * (each is discovered over its published OpenAPI, not linked as a package).
 */
export const INVENTORY_PROTOCOL_HEADER = 'pops-inventory-protocol';

/**
 * The sync wire shape this build of bfm understands. Raised only when
 * `client.ts`'s mapping changes to depend on a newer shape than `1` — see
 * `pillars/inventory/migrations/0012_items_single_identity.sql`, which seeds
 * the producer's own minimum at the same value.
 */
export const INVENTORY_SYNC_PROTOCOL_VERSION = 1;

/**
 * A {@link PillarHandleFactory} that always resolves to inventory and always
 * sends this build's sync protocol version.
 *
 * `Pops-Inventory-Protocol` is not the caller's business: it names the wire
 * shape THIS BUILD understands, not anything the phone sent — the phone
 * never sees this header, since `/mobile/inventory/*` has its own contract,
 * versioned independently through bfm's own OpenAPI and Swift codegen.
 * `pillar()` is called with the literal {@link INVENTORY_PILLAR_ID} rather
 * than the `pillarId` a generic factory is handed, because that literal is
 * the one thing worth being able to grep for.
 */
export function createInventoryPillarHandleFactory(): PillarHandleFactory {
  return <TRouter>() =>
    pillar<TRouter>(INVENTORY_PILLAR_ID, {
      extraHeaders: () => ({
        [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
      }),
    });
}
