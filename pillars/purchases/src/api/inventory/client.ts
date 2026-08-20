/**
 * The one leg on which purchases WRITES into another pillar.
 *
 * Every other outbound call this pillar makes reads. This one creates an
 * inventory item, on a human's explicit accept, because the alternative —
 * the accepting surface creating the row and then telling purchases about
 * it — cannot see whether the slot is still unanswered, and so cannot stop
 * a second accept minting a second asset for one physical thing. That
 * check lives in this pillar's own tables, so the create has to sit
 * between the check and the write.
 *
 * **This widens what purchases can do to inventory, and the grant cannot
 * say so.** Scopes match by dot prefix, so the `inventory.items` this
 * pillar already carries for the nightly `items.get` authorises
 * `items.create`, `items.update` and `items.delete` too — the capability
 * was there before this leg and no narrower scope exists to express "read
 * items, write none". Nothing in the registry therefore changes when this
 * leg lands, which is precisely why the leg is written down instead: in
 * `src/api/pillars/service-account.ts`, in the pillar README's outbound
 * table, and here.
 *
 * The corollary is that this code must never treat the grant as a
 * guarantee. A refusal is a first-class outcome, reported by name and
 * logged with the account, exactly as the read legs report theirs — an
 * unauthorized create folded into "unavailable" would look like an outage
 * that clears on its own, and this one never clears without an operator.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialled,
  credentialRejectedMessage,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';
import {
  InventoryItemCreatedSchema,
  inventoryItemUri,
  toInventoryItemCreateBody,
  type InventoryItemCreateBody,
} from './asset.js';

import type { InventoryProposal } from '../../db/index.js';

export const INVENTORY_PILLAR_ID = 'inventory';

/** The operation this file calls, declared here for the cross-pillar gate. */
export type InventoryWriteRouter = {
  items: {
    create: (input: InventoryItemCreateBody) => Promise<unknown>;
  };
};

/**
 * What became of one create attempt.
 *
 * Five outcomes rather than ok/failed, because the remedies differ and a
 * caller that cannot tell them apart reports the wrong one to the person
 * standing in front of it. `unreadable` is the subtle one: inventory
 * answered success and the body carried no id, so a row may exist that
 * nothing can name — the only outcome that can strand an asset without a
 * URI to complete it with, and therefore the one that must never be folded
 * into `unavailable`.
 */
export type InventoryAssetCreateResult =
  | { readonly kind: 'created'; readonly inventoryItemUri: string }
  | { readonly kind: 'unauthorized'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface InventoryAssetCreator {
  create(proposal: InventoryProposal): Promise<InventoryAssetCreateResult>;
}

function classify(result: CallResult<unknown>): InventoryAssetCreateResult {
  if (isOk(result)) {
    const parsed = InventoryItemCreatedSchema.safeParse(result.value);
    return parsed.success
      ? { kind: 'created', inventoryItemUri: inventoryItemUri(parsed.data.data.id) }
      : { kind: 'unreadable', reason: 'no-item-id' };
  }
  switch (result.kind) {
    case 'unauthorized':
      return { kind: 'unauthorized', reason: UNAUTHORIZED_REASON };
    // Inventory looked at the body and said no. Permanent from here: the
    // payload is derived from a proposal, so a retry sends the same thing.
    case 'bad-request':
    case 'refused':
    case 'conflict':
      return { kind: 'refused', reason: result.kind };
    case 'not-found':
    case 'unavailable':
    case 'degraded':
    case 'contract-mismatch':
    case 'rate-limited':
      return { kind: 'unavailable', reason: result.kind };
  }
}

/**
 * Live creator over the inventory pillar.
 *
 * The handle is built per call rather than at construction, for the reason
 * the cron's legs are: `pillar()` from `@pops/pillar-sdk/server` refuses to
 * build one without a service-account key, and building eagerly would turn
 * a missing key into a pillar that will not boot.
 *
 * @param handle Pre-built handle, for tests that drive a real socket.
 */
export function createInventoryAssetCreator(
  handle?: PillarHandle<InventoryWriteRouter>
): InventoryAssetCreator {
  return {
    async create(proposal: InventoryProposal): Promise<InventoryAssetCreateResult> {
      const inventory =
        handle ??
        credentialled(INVENTORY_PILLAR_ID, () => pillar<InventoryWriteRouter>(INVENTORY_PILLAR_ID));
      if (inventory === null) {
        return { kind: 'unauthorized', reason: NO_CREDENTIAL_REASON };
      }

      let result: CallResult<unknown>;
      try {
        result = await inventory.items.create(toInventoryItemCreateBody(proposal));
      } catch (err) {
        return { kind: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
      }

      const outcome = classify(result);
      if (outcome.kind === 'unauthorized') {
        console.error(credentialRejectedMessage(INVENTORY_PILLAR_ID, 'items.create'));
      }
      return outcome;
    },
  };
}
