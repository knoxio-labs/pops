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
import { AsyncLocalStorage } from 'node:async_hooks';

import { pillar } from '@pops/pillar-sdk/server';

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
 * The acting-device header inventory's `POST /sync/mutations` honours
 * (`pillars/inventory/src/api/sync/actor.ts`'s `ACTOR_HEADER`) — not
 * imported, for the same reason {@link INVENTORY_PROTOCOL_HEADER} is not.
 */
export const INVENTORY_ACTOR_HEADER = 'pops-actor';

/**
 * Where {@link createInventoryPillarHandleFactory}'s `extraHeaders` closure
 * reads the current call's `Pops-Actor` value from.
 *
 * A per-call header, unlike the protocol version above, so it cannot be baked
 * into the factory the way that constant is: the sdk's `extraHeaders` is
 * scoped to the HANDLE, read fresh on every outbound request but with no
 * per-call argument of its own. `withInventoryActor` runs the mutations call
 * inside this store instead of building a second gateway per request; Node's
 * `AsyncLocalStorage` follows the call through every `await` in between, so
 * the closure below sees exactly the value the mutations handler set for
 * THIS request and none other, however many run concurrently.
 */
const actorHeaderStorage = new AsyncLocalStorage<string>();

/**
 * Run `send` with `actorHeader` visible to every inventory call it makes,
 * so `POST /sync/mutations` is recorded against the device the caller
 * resolved rather than as an anonymous service call. Every other inventory
 * route ignores the header entirely, so calling this around a read is
 * harmless — nothing outside `client.ts`'s `mutations` call reads the store.
 */
export function withInventoryActor<T>(actorHeader: string, send: () => Promise<T>): Promise<T> {
  return actorHeaderStorage.run(actorHeader, send);
}

/**
 * A {@link PillarHandleFactory} that forwards whatever pillar id the gateway
 * call supplies — always `inventory`, since `client.ts` is the only caller
 * that constructs this gateway — and always sends this build's sync protocol
 * version, plus `Pops-Actor` when {@link withInventoryActor} is on the stack.
 *
 * `pillar()` takes the `pillarId` parameter rather than a literal constant
 * of its own so this file has no reference to `client.ts` at all: importing
 * `client.ts`'s `INVENTORY_PILLAR_ID` back here, or redeclaring it as a
 * module-level const, both recreate problems `dependency-cruiser`'s
 * `no-circular` rule and `check-cross-pillar-expectations.mjs` already catch
 * (a two-file import cycle, and a call site whose producer resolves but
 * whose bare `TRouter` still cannot — see `UNPINNABLE_CALL_SITES`'s entry
 * for this file).
 *
 * `Pops-Inventory-Protocol` is not the caller's business: it names the wire
 * shape THIS BUILD understands, not anything the phone sent — the phone
 * never sees this header, since `/mobile/inventory/*` has its own contract,
 * versioned independently through bfm's own OpenAPI and Swift codegen.
 */
export function createInventoryPillarHandleFactory(): PillarHandleFactory {
  return <TRouter>(pillarId: string) =>
    pillar<TRouter>(pillarId, {
      extraHeaders: () => {
        const headers: Record<string, string> = {
          [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
        };
        const actor = actorHeaderStorage.getStore();
        if (actor !== undefined) headers[INVENTORY_ACTOR_HEADER] = actor;
        return headers;
      },
    });
}
