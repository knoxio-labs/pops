/**
 * The `purchase_sources.id` each shipped adapter writes under, and which of
 * them name one merchant for every order they create.
 *
 * Sources are rows rather than a compiled enum (ADR-035), so this is not the
 * set of sources that can exist — it is what the adapters in this tree are
 * known to do. Amazon writes the literal `Amazon`; the Woolworths adapter
 * writes one chain's stores, which print the same product names from the
 * same catalogue. The receipt path is the escape hatch: one source id for
 * every shop a user photographs, so two shops' lines share a source and
 * nothing else.
 *
 * A source that is not listed is treated as naming many merchants, which is
 * the direction that over-splits rather than over-merges — the choice
 * `src/ingest/README.md` argues for, and the one that keeps a new adapter
 * from silently conflating two shops the day it is added.
 */

/** `purchase_sources.id` the Amazon DSAR bundle adapter writes under. */
export const AMAZON_SOURCE_ID = 'amazon';

/** `purchase_sources.id` the Woolworths export adapter writes under. */
export const WOOLWORTHS_SOURCE_ID = 'woolworths';

/** `purchase_sources.id` every uploaded receipt is written under, whatever shop it is from. */
export const RECEIPT_SOURCE_ID = 'receipt';

const ONE_MERCHANT_SOURCES: ReadonlySet<string> = new Set([AMAZON_SOURCE_ID, WOOLWORTHS_SOURCE_ID]);

/**
 * Whether every order under this source comes from the same merchant.
 *
 * What it licenses is comparing printed text across the source: a name is
 * only interpretable against the till that printed it, so two lines may be
 * compared on their names alone when the source guarantees one till system
 * printed both.
 */
export function sourceNamesOneMerchant(source: string): boolean {
  return ONE_MERCHANT_SOURCES.has(source);
}
