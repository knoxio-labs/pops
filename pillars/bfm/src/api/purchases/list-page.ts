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
import type { GatewayOutcome } from '../pillars/gateway.js';

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

/**
 * Every distinct, present `merchantEntityId` a set of rows carries.
 *
 * `undefined` (the producer never sent the key) and `null` (it sent no
 * entity) are both "no id" — the row's own field is optional for exactly
 * this reason (`list-wire.ts`'s `PurchasesListRowSchema`), so this is the
 * one place that has to tell "no id" apart from "an id", not from each
 * other.
 */
export function distinctEntityIds(rows: readonly { merchantEntityId?: string | null }[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.merchantEntityId)
        .filter((id): id is string => id !== null && id !== undefined)
    ),
  ];
}

/**
 * Resolving a merchant's name is an ENRICHMENT, never a reason to fail the
 * page it decorates — a contacts outage, a slow answer or a shape this
 * pillar cannot read all cost a resolved NAME, never the purchase itself or
 * its `entityId` (every `entity`-resolution row falls back to `entityId`
 * with no name, per `merchant-identity.ts`'s `toMerchantIdentity`).
 *
 * Bounded by {@link CONTACTS_LOOKUP_TIMEOUT_MS} independently of the SDK's
 * own (30s) call timeout: that ceiling protects the FEDERATION from a
 * hanging connection, not the PHONE from a slow one, and a purchases page
 * is not worth making someone wait 30 seconds for a name it can show
 * without. Whichever way it degrades, this logs ONCE per request — never
 * per row, since every row shares the one lookup this function makes.
 */
export async function resolveMergedNames(
  contacts: MobileContactsClient,
  ids: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();

  let outcome: GatewayOutcome<ReadonlyMap<string, string>> | typeof TIMED_OUT;
  try {
    outcome = await raceTimeout(contacts.lookupEntities(ids), CONTACTS_LOOKUP_TIMEOUT_MS);
  } catch (error) {
    console.warn(
      '[bfm-api] contacts.entities.lookup threw; this page’s entities render with no resolved name',
      { error: error instanceof Error ? error.message : String(error) }
    );
    return new Map();
  }

  if (outcome === TIMED_OUT) {
    console.warn(
      `[bfm-api] contacts.entities.lookup did not answer within ${String(CONTACTS_LOOKUP_TIMEOUT_MS)}ms; this page's entities render with no resolved name`
    );
    return new Map();
  }
  if (!isGatewayOk(outcome)) {
    console.warn(
      `[bfm-api] contacts.entities.lookup failed (${outcome.kind}); this page's entities render with no resolved name`
    );
    return new Map();
  }
  return outcome.value;
}

/**
 * Short relative to the SDK's own 30s call timeout, on purpose — see
 * {@link resolveMergedNames}'s docstring for why the two bound different
 * things.
 */
export const CONTACTS_LOOKUP_TIMEOUT_MS = 2_000;

const TIMED_OUT = Symbol('contacts-lookup-timed-out');

/**
 * Race `promise` against a timer. The timer arm resolves to {@link TIMED_OUT}
 * rather than rejecting, so a slow answer is a value the caller switches on;
 * a genuine rejection from `promise` itself still rejects, since that is a
 * fact `resolveMergedNames`'s own `catch` needs to log accurately rather
 * than one this function should relabel as a timeout.
 */
function raceTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      }
    );
  });
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
