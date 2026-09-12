/**
 * The purchases pillar id, as registered with the registry.
 *
 * Its own module so `client.ts` and `draft-client.ts` can both import it
 * without importing each other — `draft-client.ts`'s calls are merged into
 * `client.ts`'s `MobilePurchasesClient`, and a constant importing back from
 * its own consumer would be a cycle.
 */
export const PURCHASES_PILLAR_ID = 'purchases';
