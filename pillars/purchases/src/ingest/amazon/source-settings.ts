/**
 * The `purchase_sources` settings the Amazon adapter registers.
 *
 * Here rather than inline in the CLI because migration 0018 writes the same
 * values into a database that already holds the row, and its test pins the
 * two together: the CLI's upsert is a full replace, so a value that lived
 * only in the migration would be undone by the next ingest.
 */

/**
 * The descriptors Amazon's retail orders bill under: `AMAZON MARKETPLACE
 * AU`, `AMAZON RETA* AMAZON AU`, `AMAZON.COM.AU`, `Amazon AU`.
 *
 * Not `AMAZON%`, which also admits `AMAZON WEB SERVICES` — a cloud bill on
 * the same card, a few dollars a month, that stage 3 happily part-paid an
 * order with (POPS-4650). A LIKE pattern cannot exclude, so this requires
 * the `AU` the retail descriptors carry and the AWS one does not. It also
 * drops `AMAZON MKTPL*… AMZN.COM/BILL`, an amazon.com charge that settles
 * no order this adapter has ingested.
 */
export const AMAZON_DESCRIPTOR_PATTERN = 'AMAZON%AU%';

/**
 * ±10 days around `orderedAt` (POPS-4647).
 *
 * Replayed against a year of production orders together with the card
 * filter: 10 days lost two correct links, both orders charged exactly 21
 * days after they were placed, and gained ten. Every width from 10 to 14
 * gave the same result; 9 and below lost two more correct links each.
 */
export const AMAZON_SETTLEMENT_WINDOW_DAYS = 10;
