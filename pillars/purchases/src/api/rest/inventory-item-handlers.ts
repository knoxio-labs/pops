/**
 * `POST /purchases/:id/items/:itemId/inventory-item` — the accept that
 * creates the asset.
 *
 * Its own file rather than a case in `purchase-handlers.ts` because it is
 * the only handler in this pillar that reaches another one mid-request, and
 * the ordering it keeps is the whole point:
 *
 *   1. ask the projection for the offer. A slot already answered is not
 *      offered, so a replayed accept stops here and creates nothing.
 *   2. create the asset in inventory.
 *   3. record the accept against the URI that came back.
 *
 * A decision therefore cannot be recorded for an asset that does not exist
 * — the failure the fan-out is arranged against, since the nightly soft-URI
 * cron would find the reference unresolvable and stamp it stale.
 *
 * The inverse is possible, and step 1 narrows it rather than removing it.
 * Step 2 is a network call, so anything answering the same slot while it is
 * in flight — a decline through the other route, or a second request to
 * this one, which creates its own asset first — reaches step 3 before this
 * request does, and step 3 refuses to overwrite a decision. This request's
 * asset is then real and unreferenced, which the response says in those
 * words and hands back the URI for: a decision cannot be retracted and
 * inventory has no create keyed on the line, so there is nothing to repair
 * it with, and the alternative to naming it is a row appearing in inventory
 * that nothing explains.
 */
import {
  decideInventoryProposal,
  InventoryProposalConflictError,
  listInventoryProposals,
} from '../../db/index.js';
import { createInventoryAssetCreator, type InventoryAssetCreator } from '../inventory/client.js';
import { proposalNotFound } from './purchase-handlers.js';

import type { z } from 'zod';

import type { InventoryAssetRequestSchema } from '../../contract/inventory-proposals.js';
import type { InventoryProposal, PurchasesDb } from '../../db/index.js';
import type { InventoryAssetCreateResult } from '../inventory/client.js';

type AssetRequestBody = z.infer<typeof InventoryAssetRequestSchema>;

/** Why no asset was created, in the vocabulary a caller acts on. */
const FAILURE_CODES = {
  unauthorized: 'INVENTORY_UNAUTHORIZED',
  unavailable: 'INVENTORY_UNAVAILABLE',
  refused: 'INVENTORY_REFUSED',
  unreadable: 'INVENTORY_RESPONSE_UNREADABLE',
} as const;

/**
 * The offer this request answers.
 *
 * A named `unitId` selects the proposal carrying that unit; an unnamed one
 * selects a slot with no unit row, exactly as `decideInventoryProposal`
 * reads the same two cases. Anything else is no offer at all, which the
 * caller sees as a 404 — including the case that matters most here, a slot
 * someone already answered, because a decided slot is not offered.
 */
function findOffer(
  proposals: readonly InventoryProposal[],
  itemId: string,
  unitId: string | undefined
): InventoryProposal | undefined {
  return proposals.find(
    (proposal) =>
      proposal.itemId === itemId &&
      (unitId === undefined ? proposal.unitId === null : proposal.unitId === unitId)
  );
}

function badGateway(message: string, code: string, inventoryItemUri: string | null) {
  return { status: 502 as const, body: { message, code, inventoryItemUri } };
}

/**
 * An attempt that produced no asset this pillar can name.
 *
 * Three of the four leave nothing at all behind and the slot is still
 * offered, so the remedy is to fix what the code names and answer the offer
 * again. `unreadable` is not one of those and does not claim to be: the
 * create may well have succeeded, and what failed was reading the id out of
 * the answer, so a retry can duplicate. It says so rather than being folded
 * into the others.
 */
function nothingRecorded(result: Exclude<InventoryAssetCreateResult, { kind: 'created' }>) {
  const detail =
    result.kind === 'unreadable'
      ? 'the inventory pillar answered success without an item id, so a row may exist that ' +
        'purchases cannot name — look before answering this offer again'
      : 'nothing was created and nothing was recorded; the offer still stands';
  return badGateway(
    `The inventory asset was not created (${result.kind}: ${result.reason}): ${detail}`,
    FAILURE_CODES[result.kind],
    null
  );
}

/**
 * A row exists in inventory and this pillar is about to stop pointing at it.
 *
 * Logged wherever that becomes true, and separately from the response,
 * because the response only reaches whoever made the request. A script that
 * drops a `502` — or a write that fails in a way this route does not answer
 * at all, and leaves as a `500` — would otherwise leave the single trace of
 * that row nowhere on this side: the row itself says which order it came
 * from, but nothing here would say it exists.
 */
function logOrphan(inventoryItemUri: string, reason: string): void {
  console.error('[purchases-api] inventory asset created but its accept was not recorded', {
    inventoryItemUri,
    reason,
  });
}

/**
 * The one failure that leaves an asset behind, named and with its URI.
 *
 * It happens when the slot is answered between the projection and the
 * write. A decision cannot be retracted, so this is not a retry: repeating
 * the request would mint a second asset for one physical thing, and
 * recording the accept afterwards is refused by the same conflict that
 * caused this. The URI is here because it is the only trace of a row
 * purchases holds no reference to, and a person has to decide what happens
 * to it.
 */
function assetOrphaned(inventoryItemUri: string, reason: string) {
  logOrphan(inventoryItemUri, reason);
  return badGateway(
    `Inventory created ${inventoryItemUri}, but the accept could not be recorded (${reason}). ` +
      'That asset exists and purchases holds no reference to it: delete it in inventory, or ' +
      'keep it and reconcile by hand. Do not repeat this request — it would create a second one',
    'ACCEPT_NOT_RECORDED',
    inventoryItemUri
  );
}

export function makeInventoryItemHandlers(
  db: PurchasesDb,
  inventoryAssets: InventoryAssetCreator = createInventoryAssetCreator()
) {
  return {
    createInventoryItem: async ({
      params,
      body,
    }: {
      params: { id: string; itemId: string };
      body: AssetRequestBody;
    }) => {
      const offer = findOffer(listInventoryProposals(db, params.id), params.itemId, body.unitId);
      if (offer === undefined) return proposalNotFound(params.id, params.itemId);

      const created = await inventoryAssets.create(offer);
      if (created.kind !== 'created') return nothingRecorded(created);

      const decision = {
        decision: 'accepted' as const,
        inventoryItemUri: created.inventoryItemUri,
        ...(offer.unitId === null ? {} : { unitId: offer.unitId }),
      };

      let unit;
      try {
        unit = decideInventoryProposal(db, params.id, params.itemId, decision);
      } catch (err) {
        if (err instanceof InventoryProposalConflictError) {
          return assetOrphaned(created.inventoryItemUri, err.message);
        }
        logOrphan(created.inventoryItemUri, err instanceof Error ? err.message : String(err));
        throw err;
      }
      if (unit === undefined) {
        return assetOrphaned(created.inventoryItemUri, 'the line is no longer answerable');
      }

      return { status: 201 as const, body: { inventoryItemUri: created.inventoryItemUri, unit } };
    },
  };
}
