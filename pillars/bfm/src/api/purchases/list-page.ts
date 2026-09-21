/**
 * Turning one over-fetched `purchase.list` answer into a mobile page,
 * merchant identities resolved.
 *
 * Split out of `client.ts` to keep that file under the pillar's line cap —
 * this is the batching arithmetic {@link ListPurchasesRequest}'s handler
 * runs, not a second concern.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { encodePurchasesCursor } from './list-cursor.js';
import { toMobilePurchase, type PurchasesListRow } from './list-wire.js';

import type { MobilePurchasesPage } from '../../contract/rest-schemas.js';
import type { MobileContactsClient } from '../contacts/client.js';

/**
 * Trim the probe row off the over-fetched page.
 *
 * Separate from {@link toPage} so the merchant-identity batch lookup can run
 * against the rows the app will actually see — including the probe row would
 * resolve a merchant that never reaches the phone on this request.
 */
export function servedRows(
  rows: readonly PurchasesListRow[],
  limit: number
): readonly PurchasesListRow[] {
  return rows.length > limit ? rows.slice(0, limit) : rows;
}

/** Every distinct, non-null `merchantEntityId` a set of rows carries. */
export function distinctEntityIds(rows: readonly { merchantEntityId: string | null }[]): string[] {
  return [...new Set(rows.map((row) => row.merchantEntityId).filter((id) => id !== null))];
}

/**
 * Resolve `ids` to their contacts names in ONE call, degrading to an empty
 * map — never failing the response — on any non-ok outcome. A page whose
 * contacts lookup failed still renders: every `entity`-resolution row falls
 * back to `entityId` with no name, per `merchant-identity.ts`'s
 * `toMerchantIdentity`.
 */
export async function resolveMergedNames(
  contacts: MobileContactsClient,
  ids: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const outcome = await contacts.lookupEntities(ids);
  return isGatewayOk(outcome) ? outcome.value : new Map();
}

/**
 * Mint the next cursor from the last row actually served.
 *
 * The cursor names the LAST ROW SERVED, not the probe: naming the probe row
 * would anchor the next page one row too far forward, since the app never saw
 * it and could not have served it.
 */
export function toPage(
  served: readonly PurchasesListRow[],
  hasMore: boolean,
  mergedNames: ReadonlyMap<string, string>,
  total: number | undefined
): MobilePurchasesPage {
  const last = served.at(-1);

  return {
    data: served.map((row) => toMobilePurchase(row, mergedNames)),
    nextCursor:
      hasMore && last !== undefined
        ? encodePurchasesCursor({ orderedAt: last.orderedAt, id: last.id })
        : null,
    total: total ?? null,
  };
}
