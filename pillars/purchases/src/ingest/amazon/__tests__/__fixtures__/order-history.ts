/**
 * Golden CSV text for the Amazon order-history parser.
 *
 * The values are synthetic — no real product, address, tracking number or
 * order id appears here — but every *structural* quirk is reproduced
 * verbatim from a real 943-row DSAR bundle, because those are what the
 * parser exists to survive: shipment-level columns repeated across a
 * shipment's rows, apostrophe-wrapped discounts, `Not Available` sentinels,
 * concatenated ship dates, and an embedded newline in a quoted field.
 *
 * It lives in a `.ts` module rather than a `.csv` file because `*.csv` is
 * gitignored repo-wide (AGENTS.md, Security), so a committed `.csv` fixture
 * would silently not exist for anyone else.
 */

const HEADER = [
  'ASIN',
  'Billing Address',
  'Carrier Name & Tracking Number',
  'Currency',
  'Gift Message',
  'Gift Recipient Contact',
  'Gift Sender Name',
  'Item Serial Number',
  'Order Date',
  'Order ID',
  'Order Status',
  'Original Quantity',
  'Payment Method Type',
  'Product Condition',
  'Product Name',
  'Purchase Order Number',
  'Ship Date',
  'Shipment Item Subtotal',
  'Shipment Item Subtotal Tax',
  'Shipment Status',
  'Shipping Address',
  'Shipping Charge',
  'Shipping Option',
  'Total Amount',
  'Total Discounts',
  'Unit Price',
  'Unit Price Tax',
  'Website',
].join(',');

/** A clean single-line order whose components reconcile exactly. */
export const ORDER_SINGLE = '249-0000001-0000001';

/** Two lines in ONE shipment: the columns that repeat are the whole point. */
export const ORDER_TWO_LINES_ONE_SHIPMENT = '249-0000002-0000002';

/** One order delivered in two boxes on different dates. */
export const ORDER_TWO_SHIPMENTS = '249-0000003-0000003';

/** Discount arrives wrapped in literal apostrophes. */
export const ORDER_APOSTROPHE_DISCOUNT = '249-0000004-0000004';

/** Cancelled: sentinels everywhere, quantity 0, and money anyway. */
export const ORDER_CANCELLED = '249-0000005-0000005';

/** Amazon's own string-concatenation bug in Ship Date / Shipment Status. */
export const ORDER_CONCATENATED_SHIP_DATE = '249-0000006-0000006';

/** Embedded newline in a quoted field, and a non-AUD currency. */
export const ORDER_FOREIGN_CURRENCY = '249-0000007-0000007';

/** Components that do not reconcile — the cents-to-dollars drift. */
export const ORDER_COMPONENT_DRIFT = '249-0000008-0000008';

/** Thousands-separated money inside the apostrophe wrapping. */
export const ORDER_THOUSANDS_SEPARATOR = '249-0000009-0000009';

const ROWS = [
  // A clean single-line order: 20.00 + 2.00 tax = 22.00.
  `B000000001,Redacted,AMZL_AU(TBA000000000001),AUD,Not Available,Not Available,Not Available,Not Available,2025-03-04T01:02:03Z,${ORDER_SINGLE},Closed,1,Visa - 0000,New,Widget Alpha,Not Applicable,2025-03-05T04:05:06Z,20.00,2.00,Shipped,Redacted,0,std-0,22.00,0,20.00,2.00,Amazon.com.au`,

  // Two lines, ONE shipment. Subtotal 30.00 and tax 3.00 are stated once
  // and repeated on both rows; summing them per row would report 60.00.
  `B000000002,Redacted,AMZL_AU(TBA000000000002),AUD,Not Available,Not Available,Not Available,Not Available,2025-04-01T00:00:00Z,${ORDER_TWO_LINES_ONE_SHIPMENT},Closed,1,Visa - 0000,New,Widget Beta,Not Applicable,2025-04-02T00:00:00Z,30.00,3.00,Shipped,Redacted,0,std-0,11.00,0,10.00,1.00,Amazon.com.au`,
  `B000000003,Redacted,AMZL_AU(TBA000000000002),AUD,Not Available,Not Available,Not Available,Not Available,2025-04-01T00:00:00Z,${ORDER_TWO_LINES_ONE_SHIPMENT},Closed,2,Visa - 0000,New,Widget Gamma,Not Applicable,2025-04-02T00:00:00Z,30.00,3.00,Shipped,Redacted,0,std-0,22.00,0,10.00,1.00,Amazon.com.au`,

  // Two shipments, eight days apart, each with its own components.
  `B000000004,Redacted,AMZL_AU(TBA000000000003),AUD,Not Available,Not Available,Not Available,Not Available,2025-05-01T00:00:00Z,${ORDER_TWO_SHIPMENTS},Closed,1,Visa - 0000,New,Widget Delta,Not Applicable,2025-05-02T00:00:00Z,15.00,1.50,Shipped,Redacted,0,std-0,16.50,0,15.00,1.50,Amazon.com.au`,
  `B000000005,Redacted,Australia Post(AP000000000001),AUD,Not Available,Not Available,Not Available,Not Available,2025-05-01T00:00:00Z,${ORDER_TWO_SHIPMENTS},Closed,1,Visa - 0000,New,Widget Epsilon,Not Applicable,2025-05-09T00:00:00Z,25.00,2.50,Shipped,Redacted,5.00,std-0,32.50,0,25.00,2.50,Amazon.com.au`,

  // Apostrophe-wrapped negative discount: 50.00 + 5.00 - 5.50 = 49.50.
  `B000000006,Redacted,AMZL_AU(TBA000000000004),AUD,Not Available,Not Available,Not Available,Not Available,2025-06-10T00:00:00Z,${ORDER_APOSTROPHE_DISCOUNT},Closed,1,Visa - 0000,New,Widget Zeta,Not Applicable,2025-06-11T00:00:00Z,50.00,5.00,Shipped,Redacted,0,std-0,49.50,'-5.5',50.00,5.00,Amazon.com.au`,

  // Cancelled, quantity 0, sentinels throughout — and a real total anyway.
  `B000000007,Redacted,Not Available,AUD,Not Available,Not Available,Not Available,Not Available,2025-07-01T00:00:00Z,${ORDER_CANCELLED},Cancelled,0,Visa - 0000,New,Widget Eta,Not Applicable,Not Available,Not Available,Not Available,Not Available,Redacted,0,std-0,11.25,0,11.25,0,Amazon.com.au`,

  // Amazon's own concatenation bug, in two columns of the same row.
  `B000000008,Redacted,AMZL_AU(TBA000000000005),AUD,Not Available,Not Available,Not Available,Not Available,2025-08-01T00:00:00Z,${ORDER_CONCATENATED_SHIP_DATE},Closed,1,Visa - 0000,New,Widget Theta,Not Applicable,2025-08-02T00:00:00Z and 2025-08-04T00:00:00Z,40.00,4.00,Shipped and Shipped,Redacted,0,std-0,44.00,0,40.00,4.00,Amazon.com.au`,

  // Quoted field containing a newline, plus a second currency.
  `B000000009,Redacted,UPS(1Z0000000000000001),USD,"Happy birthday\nfrom everyone",Not Available,Not Available,Not Available,2025-09-01T00:00:00Z,${ORDER_FOREIGN_CURRENCY},Closed,1,Visa - 0000,New,Widget Iota,Not Applicable,2025-09-03T00:00:00Z,12.00,0,Shipped,Redacted,3.00,expd-intl-us-aus-ag,15.00,0,12.00,0,Amazon.com`,

  // Components state 11.00; the line total says 12.00.
  `B000000010,Redacted,AMZL_AU(TBA000000000006),AUD,Not Available,Not Available,Not Available,Not Available,2025-10-01T00:00:00Z,${ORDER_COMPONENT_DRIFT},Closed,1,Visa - 0000,New,Widget Kappa,Not Applicable,2025-10-02T00:00:00Z,10.00,1.00,Shipped,Redacted,0,std-0,12.00,0,10.00,1.00,Amazon.com.au`,

  // Apostrophes AND a thousands separator, as one real BRL row states it.
  // The apostrophes are part of the value; the CSV quoting around them is
  // the ordinary double-quote kind, which is what keeps the comma inside
  // the field instead of splitting it into two.
  `B000000011,Redacted,Not Available,BRL,Not Available,Not Available,Not Available,Not Available,2025-11-01T00:00:00Z,${ORDER_THOUSANDS_SEPARATOR},Closed,1,Visa - 0000,New,Widget Lambda,Not Applicable,2025-11-02T00:00:00Z,"'1,495'",0,Shipped,Redacted,0,std-0,"'1,495'",0,"'1,495'",0,Amazon.com.br`,
];

/** The full fixture, with the UTF-8 BOM Amazon prefixes its exports with. */
export const ORDER_HISTORY_CSV = `﻿${HEADER}\n${ROWS.join('\n')}\n`;

/**
 * Build a well-shaped file from arbitrary rows, for cases that need a
 * single hostile row without perturbing the counts the main fixture asserts.
 */
export function csvWithRows(rows: readonly string[]): string {
  return `﻿${HEADER}\n${rows.join('\n')}\n`;
}

/** A row template whose fields can be overridden by column name. */
export function rowWith(overrides: Readonly<Record<string, string>>): string {
  const base: Record<string, string> = {
    ASIN: 'B000000099',
    'Billing Address': 'Redacted',
    'Carrier Name & Tracking Number': 'AMZL_AU(TBA000000000099)',
    Currency: 'AUD',
    'Gift Message': 'Not Available',
    'Gift Recipient Contact': 'Not Available',
    'Gift Sender Name': 'Not Available',
    'Item Serial Number': 'Not Available',
    'Order Date': '2025-12-01T00:00:00Z',
    'Order ID': '249-0000099-0000099',
    'Order Status': 'Closed',
    'Original Quantity': '1',
    'Payment Method Type': 'Visa - 0000',
    'Product Condition': 'New',
    'Product Name': 'Widget Omega',
    'Purchase Order Number': 'Not Applicable',
    'Ship Date': '2025-12-02T00:00:00Z',
    'Shipment Item Subtotal': '10.00',
    'Shipment Item Subtotal Tax': '1.00',
    'Shipment Status': 'Shipped',
    'Shipping Address': 'Redacted',
    'Shipping Charge': '0',
    'Shipping Option': 'std-0',
    'Total Amount': '11.00',
    'Total Discounts': '0',
    'Unit Price': '10.00',
    'Unit Price Tax': '1.00',
    Website: 'Amazon.com.au',
  };
  return HEADER.split(',')
    .map((column) => overrides[column] ?? base[column] ?? '')
    .join(',');
}

/** The same file with a column removed, for the bundle-shape check. */
export const ORDER_HISTORY_CSV_WRONG_SHAPE = `﻿Order ID,Product Name\n${ORDER_SINGLE},Widget Alpha\n`;
