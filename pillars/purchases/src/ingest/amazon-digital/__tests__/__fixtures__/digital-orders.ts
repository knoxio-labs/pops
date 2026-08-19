/**
 * Golden CSV text for the Amazon digital-orders parser.
 *
 * Synthetic values — no real order id, item id or ASIN appears — but every
 * *structural* quirk is reproduced from the real 226-row bundle: one row
 * per monetary component, the promotion pair that cancels a price to zero,
 * `Not Applicable` in place of an empty cell, and a foreign-currency order.
 *
 * It lives in a `.ts` module rather than a `.csv` file because `*.csv` is
 * gitignored repo-wide (AGENTS.md, Security), so a committed `.csv` fixture
 * would silently not exist for anyone else.
 */

const HEADER = [
  'ASIN',
  'Base Currency Code',
  'Component Type',
  'Digital Order Item ID',
  'Marketplace',
  'Order Date',
  'Order ID',
  'Order Status',
  'Price',
  'Product Name',
  'Quantity Ordered',
  'Transaction Amount',
] as const;

type Column = (typeof HEADER)[number];

/** Every column Amazon fills with a sentinel rather than leaving empty. */
const DEFAULTS: Record<Column, string> = {
  ASIN: 'B000000001',
  'Base Currency Code': 'AUD',
  'Component Type': 'Price Amount',
  'Digital Order Item ID': 'ITEM0000000000000001',
  Marketplace: 'www.amazon.com.au',
  'Order Date': '2025-02-18T11:30:00Z',
  'Order ID': 'D01-0000000-0000001',
  'Order Status': 'SUCCESS',
  Price: '14.95',
  'Product Name': 'A Digital Thing',
  'Quantity Ordered': '1',
  'Transaction Amount': '13.59',
};

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function digitalRowWith(overrides: Partial<Record<Column, string>>): string {
  const row = { ...DEFAULTS, ...overrides };
  return HEADER.map((column) => quote(row[column])).join(',');
}

export function digitalCsvWithRows(rows: readonly string[]): string {
  // The real file opens with a UTF-8 BOM, which lands on the first header
  // name and defeats an exact-match column check that does not strip it.
  return `﻿${HEADER.map(quote).join(',')}\n${rows.join('\n')}\n`;
}

/** A subscription renewal: one price component, one tax component. */
export const ORDER_PAID = 'D01-0000000-0000001';
/** An audiobook redeemed against a credit: the promotion cancels the price. */
export const ORDER_PROMOTION_OFFSET = 'D01-0000000-0000002';
/** A genuinely free item — every component states zero. */
export const ORDER_FREE = 'D01-0000000-0000003';
/** Priced and settled in a currency the account is not denominated in. */
export const ORDER_FOREIGN = 'D01-0000000-0000004';
/** A purchase that did not go through. */
export const ORDER_FAILED = 'D01-0000000-0000005';
/** A component type this parser has never seen. */
export const ORDER_UNKNOWN_COMPONENT = 'D01-0000000-0000006';
/** A component whose money cannot be read. */
export const ORDER_UNPARSEABLE = 'D01-0000000-0000007';
/** No usable order date. */
export const ORDER_UNDATED = 'D01-0000000-0000008';

/**
 * A digital order id that is byte-identical to a physical one.
 *
 * Not present in the reference bundle — its 90 digital ids and 748 physical
 * ids do not overlap, and the digital ones all carry a `D01-` prefix. That
 * absence is a property of one download rather than a guarantee Amazon
 * makes, and the whole namespace argument rests on what happens when it
 * stops holding, so the fixture forces the case.
 */
export const ORDER_COLLIDES_WITH_PHYSICAL = '249-1512883-0105415';

export const DIGITAL_ORDERS_CSV = digitalCsvWithRows([
  digitalRowWith({
    'Order ID': ORDER_PAID,
    'Component Type': 'Tax',
    'Transaction Amount': '0.64',
    Price: '6.99',
    'Product Name': 'Prime Membership Fee',
  }),
  digitalRowWith({
    'Order ID': ORDER_PAID,
    'Component Type': 'Price Amount',
    'Transaction Amount': '6.35',
    Price: '6.99',
    'Product Name': 'Prime Membership Fee',
  }),

  // Row order is deliberately shuffled: the real file interleaves the
  // promotion pair with the charge pair in no fixed order.
  digitalRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Price Amount',
    'Transaction Amount': '13.59',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  }),
  digitalRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Tax',
    'Transaction Amount': '-1.36',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  }),
  digitalRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Tax',
    'Transaction Amount': '1.36',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  }),
  digitalRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Price Amount',
    'Transaction Amount': '-13.59',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  }),

  digitalRowWith({
    'Order ID': ORDER_FREE,
    'Digital Order Item ID': 'ITEM0000000000000003',
    'Component Type': 'Price Amount',
    'Transaction Amount': '0.0',
    Price: '0.0',
    'Product Name': 'A Free Sample',
  }),
  digitalRowWith({
    'Order ID': ORDER_FREE,
    'Digital Order Item ID': 'ITEM0000000000000003',
    'Component Type': 'Tax',
    'Transaction Amount': '0.0',
    Price: '0.0',
    'Product Name': 'A Free Sample',
  }),

  digitalRowWith({
    'Order ID': ORDER_FOREIGN,
    'Digital Order Item ID': 'ITEM0000000000000004',
    'Base Currency Code': 'usd',
    'Component Type': 'Price Amount',
    'Transaction Amount': '19.23',
    'Product Name': 'Beginner Portuguese',
    Marketplace: 'www.amazon.com',
  }),
  digitalRowWith({
    'Order ID': ORDER_FOREIGN,
    'Digital Order Item ID': 'ITEM0000000000000004',
    'Base Currency Code': 'usd',
    'Component Type': 'Tax',
    'Transaction Amount': '0.0',
    'Product Name': 'Beginner Portuguese',
    Marketplace: 'www.amazon.com',
  }),

  digitalRowWith({
    'Order ID': ORDER_FAILED,
    'Digital Order Item ID': 'ITEM0000000000000005',
    'Order Status': 'FAILURE',
    'Transaction Amount': '9.99',
  }),

  digitalRowWith({
    'Order ID': ORDER_UNKNOWN_COMPONENT,
    'Digital Order Item ID': 'ITEM0000000000000006',
    'Component Type': 'Gift Certificate',
    'Transaction Amount': '5.00',
  }),

  digitalRowWith({
    'Order ID': ORDER_UNPARSEABLE,
    'Digital Order Item ID': 'ITEM0000000000000007',
    'Transaction Amount': 'Not Available',
  }),

  digitalRowWith({
    'Order ID': ORDER_UNDATED,
    'Digital Order Item ID': 'ITEM0000000000000008',
    'Order Date': 'Not Applicable',
  }),

  // Amazon never writes an empty cell, so a row missing its order id says
  // so with a sentinel rather than with nothing.
  digitalRowWith({ 'Order ID': 'Not Applicable', ASIN: 'B000000099' }),

  digitalRowWith({
    'Order ID': ORDER_COLLIDES_WITH_PHYSICAL,
    'Digital Order Item ID': 'ITEM0000000000000009',
    'Component Type': 'Price Amount',
    'Transaction Amount': '4.99',
    'Product Name': 'An Order Id Amazon Reused',
  }),
  digitalRowWith({
    'Order ID': ORDER_COLLIDES_WITH_PHYSICAL,
    'Digital Order Item ID': 'ITEM0000000000000009',
    'Component Type': 'Tax',
    'Transaction Amount': '0.50',
    'Product Name': 'An Order Id Amazon Reused',
  }),
]);

/** A file whose columns are not this export's. */
export const DIGITAL_ORDERS_CSV_WRONG_SHAPE = 'Order ID,Order Date\nD01-1,2025-01-01T00:00:00Z\n';
