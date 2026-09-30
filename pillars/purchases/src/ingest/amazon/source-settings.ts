/**
 * The `purchase_sources` settings the Amazon adapter registers.
 *
 * Here rather than inline in the CLI because migrations update the same row
 * in databases that already hold it, and tests pin those values together: the
 * CLI's upsert is a full replace, so a value that lived only in a migration
 * would be undone by the next ingest.
 */

const AMAZON_DESCRIPTOR_PATTERNS = ['AMAZON%AU%', 'AMAZON%AMZN.COM/BILL%'] as const;

/**
 * The descriptors Amazon's retail orders bill under: `AMAZON MARKETPLACE
 * AU`, `AMAZON RETA* AMAZON AU`, `AMAZON.COM.AU`, `Amazon AU`.
 *
 * Not `AMAZON%`, which also admits `AMAZON WEB SERVICES` — a cloud bill on
 * the same card, a few dollars a month, that stage 3 happily part-paid an
 * order with (POPS-4650). Separate LIKE alternatives keep AWS out while
 * admitting both AU retail charges and US-billed `AMZN.COM/BILL` charges.
 */
export const AMAZON_DESCRIPTOR_PATTERN = `any-of:${JSON.stringify(AMAZON_DESCRIPTOR_PATTERNS)}`;

/**
 * ±10 days around `orderedAt` (POPS-4647).
 *
 * Replayed against a year of production orders together with the card
 * filter: 10 days lost two correct links, both orders charged exactly 21
 * days after they were placed, and gained ten. Every width from 10 to 14
 * gave the same result; 9 and below lost two more correct links each.
 */
export const AMAZON_SETTLEMENT_WINDOW_DAYS = 10;
