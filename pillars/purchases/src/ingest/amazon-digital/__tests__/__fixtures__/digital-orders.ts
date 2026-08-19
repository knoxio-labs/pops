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
import {
  DIGITAL_ROW_DEFAULTS,
  digitalCsvWithRows,
  digitalRowWith,
  type Column,
} from './digital-csv.js';

export { digitalCsvWithRows, digitalRowWith } from './digital-csv.js';

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
/** What Amazon writes in place of an order id it has none for. */
export const ORDER_ID_SENTINEL = 'Not Applicable';
/** Two `Digital Order Item ID`s under one Order ID. */
export const ORDER_TWO_ITEMS = 'D01-0000000-0000010';
/** Components that net below zero, which is not spend in any direction. */
export const ORDER_NET_NEGATIVE = 'D01-0000000-0000011';

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

/**
 * Every row the golden file states, as overrides rather than rendered
 * text, so the test that asserts every input order id is accounted for can
 * read the ids off the fixture instead of restating them.
 */
const FIXTURE_ROWS: readonly Partial<Record<Column, string>>[] = [
  {
    'Order ID': ORDER_PAID,
    'Component Type': 'Tax',
    'Transaction Amount': '0.64',
    Price: '6.99',
    'Product Name': 'Prime Membership Fee',
  },
  {
    'Order ID': ORDER_PAID,
    'Component Type': 'Price Amount',
    'Transaction Amount': '6.35',
    Price: '6.99',
    'Product Name': 'Prime Membership Fee',
  },

  // Row order is deliberately shuffled: the real file interleaves the
  // promotion pair with the charge pair in no fixed order.
  {
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Price Amount',
    'Transaction Amount': '13.59',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  },
  {
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Tax',
    'Transaction Amount': '-1.36',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  },
  {
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Tax',
    'Transaction Amount': '1.36',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  },
  {
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Component Type': 'Price Amount',
    'Transaction Amount': '-13.59',
    'Product Name': 'A Borrowed Audiobook',
    Marketplace: 'www.audible.com.au',
  },

  {
    'Order ID': ORDER_FREE,
    'Digital Order Item ID': 'ITEM0000000000000003',
    'Component Type': 'Price Amount',
    'Transaction Amount': '0.0',
    Price: '0.0',
    'Product Name': 'A Free Sample',
  },
  {
    'Order ID': ORDER_FREE,
    'Digital Order Item ID': 'ITEM0000000000000003',
    'Component Type': 'Tax',
    'Transaction Amount': '0.0',
    Price: '0.0',
    'Product Name': 'A Free Sample',
  },

  {
    'Order ID': ORDER_FOREIGN,
    'Digital Order Item ID': 'ITEM0000000000000004',
    'Base Currency Code': 'usd',
    'Component Type': 'Price Amount',
    'Transaction Amount': '19.23',
    'Product Name': 'Beginner Portuguese',
    Marketplace: 'www.amazon.com',
  },
  {
    'Order ID': ORDER_FOREIGN,
    'Digital Order Item ID': 'ITEM0000000000000004',
    'Base Currency Code': 'usd',
    'Component Type': 'Tax',
    'Transaction Amount': '0.0',
    'Product Name': 'Beginner Portuguese',
    Marketplace: 'www.amazon.com',
  },

  {
    'Order ID': ORDER_FAILED,
    'Digital Order Item ID': 'ITEM0000000000000005',
    'Order Status': 'FAILURE',
    'Transaction Amount': '9.99',
  },

  {
    'Order ID': ORDER_UNKNOWN_COMPONENT,
    'Digital Order Item ID': 'ITEM0000000000000006',
    'Component Type': 'Gift Certificate',
    'Transaction Amount': '5.00',
  },

  {
    'Order ID': ORDER_UNPARSEABLE,
    'Digital Order Item ID': 'ITEM0000000000000007',
    'Transaction Amount': 'Not Available',
  },

  {
    'Order ID': ORDER_UNDATED,
    'Digital Order Item ID': 'ITEM0000000000000008',
    'Order Date': 'Not Applicable',
  },

  // Amazon never writes an empty cell, so a row missing its order id says
  // so with a sentinel rather than with nothing.
  { 'Order ID': ORDER_ID_SENTINEL, ASIN: 'B000000099' },

  {
    'Order ID': ORDER_COLLIDES_WITH_PHYSICAL,
    'Digital Order Item ID': 'ITEM0000000000000009',
    'Component Type': 'Price Amount',
    'Transaction Amount': '4.99',
    'Product Name': 'An Order Id Amazon Reused',
  },
  {
    'Order ID': ORDER_COLLIDES_WITH_PHYSICAL,
    'Digital Order Item ID': 'ITEM0000000000000009',
    'Component Type': 'Tax',
    'Transaction Amount': '0.50',
    'Product Name': 'An Order Id Amazon Reused',
  },

  // Not in the reference bundle, where every order has one item. Nothing in
  // the file's shape forbids two, and reading them as one would name the
  // line after the first product while giving it both products' money.
  // Interleaved on purpose: the items must be split on their own id rather
  // than on where they sit in the file.
  {
    'Order ID': ORDER_TWO_ITEMS,
    'Digital Order Item ID': 'ITEM0000000000000010',
    'Component Type': 'Price Amount',
    'Transaction Amount': '4.00',
    'Product Name': 'The First Of Two',
    ASIN: 'B000000010',
  },
  {
    'Order ID': ORDER_TWO_ITEMS,
    'Digital Order Item ID': 'ITEM0000000000000011',
    'Component Type': 'Price Amount',
    'Transaction Amount': '6.00',
    'Product Name': 'The Second Of Two',
    ASIN: 'B000000011',
  },
  {
    'Order ID': ORDER_TWO_ITEMS,
    'Digital Order Item ID': 'ITEM0000000000000010',
    'Component Type': 'Tax',
    'Transaction Amount': '0.40',
    'Product Name': 'The First Of Two',
    ASIN: 'B000000010',
  },
  {
    'Order ID': ORDER_TWO_ITEMS,
    'Digital Order Item ID': 'ITEM0000000000000011',
    'Component Type': 'Tax',
    'Transaction Amount': '0.60',
    'Product Name': 'The Second Of Two',
    ASIN: 'B000000011',
  },

  {
    'Order ID': ORDER_NET_NEGATIVE,
    'Digital Order Item ID': 'ITEM0000000000000012',
    'Component Type': 'Price Amount',
    'Transaction Amount': '5.00',
    'Product Name': 'A Thing Refunded Past Its Price',
  },
  {
    'Order ID': ORDER_NET_NEGATIVE,
    'Digital Order Item ID': 'ITEM0000000000000012',
    'Component Type': 'Price Amount',
    'Transaction Amount': '-9.00',
    'Product Name': 'A Thing Refunded Past Its Price',
  },
];

/** Every Order ID the rows above state, in file order, without repeats. */
export const ORDER_IDS_IN_FIXTURE: readonly string[] = [
  ...new Set(FIXTURE_ROWS.map((row) => row['Order ID'] ?? DIGITAL_ROW_DEFAULTS['Order ID'])),
];

export const DIGITAL_ORDERS_CSV = digitalCsvWithRows(FIXTURE_ROWS.map(digitalRowWith));

/** A file whose columns are not this export's. */
export const DIGITAL_ORDERS_CSV_WRONG_SHAPE = 'Order ID,Order Date\nD01-1,2025-01-01T00:00:00Z\n';
