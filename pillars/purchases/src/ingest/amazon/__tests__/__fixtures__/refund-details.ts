/**
 * Golden CSV text for `Your Returns & Refunds/Refund Details.csv`.
 *
 * Synthetic values, real structure — the same rule the order-history
 * fixture beside this file follows, and for the same reason: `*.csv` is
 * gitignored repo-wide (AGENTS.md, Security), so a committed `.csv` fixture
 * would silently not exist for anyone else.
 *
 * The order ids are the order-history fixture's, so the two files join the
 * way the real bundle's do.
 */
import {
  ORDER_APOSTROPHE_DISCOUNT,
  ORDER_CANCELLED,
  ORDER_FOREIGN_CURRENCY,
  ORDER_SINGLE,
  ORDER_THOUSANDS_SEPARATOR,
  ORDER_TWO_SHIPMENTS,
} from './order-history.js';

const HEADER = [
  'Creation Date',
  'Currency',
  'Direct Debit Refund Amount',
  'Disbursement Type',
  'Order ID',
  'Payment Status',
  'Quantity',
  'Refund Amount',
  'Refund Date',
  'Reversal Amount State',
  'Reversal Reason',
  'Reversal Status',
  'Website',
].join(',');

/** An order refunded in full — the common case, 22.00 back on 22.00 spent. */
export const REFUND_FULL = ORDER_SINGLE;

/** Refunded for less than the order cost: one line of several came back. */
export const REFUND_PARTIAL = ORDER_TWO_SHIPMENTS;

/** Two refunds against one order. Not in the reference bundle; the file permits it. */
export const REFUND_TWICE = ORDER_APOSTROPHE_DISCOUNT;

/** Stated in a currency the order is not in, with no rate to convert by. */
export const REFUND_FOREIGN = ORDER_FOREIGN_CURRENCY;

/** Thousands-separated, as one real row of the reference bundle states it. */
export const REFUND_THOUSANDS = ORDER_THOUSANDS_SEPARATOR;

/** Names an order that `Order History.csv` does not carry. */
export const REFUND_ORPHAN = '249-0000404-0000404';

/** Reversal has not completed, so the money is not known to have moved. */
export const REFUND_PENDING = ORDER_CANCELLED;

const ROWS = [
  `2025-03-30T01:02:03.100Z,AUD,0,Refund,${REFUND_FULL},Completed,1,22.00,2025-03-30T01:12:03.100Z,Final,Customer return,Completed,Amazon.com.au`,
  `2025-05-20T00:00:00.000Z,AUD,0,Refund,${REFUND_PARTIAL},Completed,1,16.50,2025-05-20T00:10:00.000Z,Final,Damaged during transit,Completed,Amazon.com.au`,
  `2025-06-20T00:00:00.000Z,AUD,0,Refund,${REFUND_TWICE},Completed,1,10.00,2025-06-20T00:10:00.000Z,Final,Item not satisfactory,Completed,Amazon.com.au`,
  `2025-06-25T00:00:00.000Z,AUD,0,Refund,${REFUND_TWICE},Completed,1,5.00,2025-06-25T00:10:00.000Z,Final,Item shipped late,Completed,Amazon.com.au`,
  // Refund stated in the order's foreign currency's opposite: the order is
  // USD and the disbursement AUD, which no rate in the bundle reconciles.
  `2025-09-20T00:00:00.000Z,AUD,0,Refund,${REFUND_FOREIGN},Completed,1,15.00,2025-09-20T00:10:00.000Z,Final,Customer return,Completed,Amazon.com.au`,
  // Apostrophes and a thousands separator, inside ordinary CSV quoting.
  `2025-11-20T00:00:00.000Z,BRL,0,Refund,${REFUND_THOUSANDS},Completed,1,"'1,495'",2025-11-20T00:10:00.000Z,Final,Customer return,Completed,Amazon.com.br`,
  `2026-01-05T00:00:00.000Z,AUD,0,Refund,${REFUND_ORPHAN},Completed,1,99.00,2026-01-05T00:10:00.000Z,Final,Customer return,Completed,Amazon.com.au`,
  `2025-07-20T00:00:00.000Z,AUD,0,Refund,${REFUND_PENDING},Pending,1,11.25,2025-07-20T00:10:00.000Z,Final,Customer return,Pending,Amazon.com.au`,
];

/** The full fixture, with the UTF-8 BOM Amazon prefixes its exports with. */
export const REFUND_DETAILS_CSV = `﻿${HEADER}\n${ROWS.join('\n')}\n`;

/** Build a well-shaped refunds file from arbitrary rows. */
export function refundCsvWithRows(rows: readonly string[]): string {
  return `﻿${HEADER}\n${rows.join('\n')}\n`;
}

/** A refund row template whose fields can be overridden by column name. */
export function refundRowWith(overrides: Readonly<Record<string, string>>): string {
  const base: Record<string, string> = {
    'Creation Date': '2025-03-30T01:02:03.100Z',
    Currency: 'AUD',
    'Direct Debit Refund Amount': '0',
    'Disbursement Type': 'Refund',
    'Order ID': ORDER_SINGLE,
    'Payment Status': 'Completed',
    Quantity: '1',
    'Refund Amount': '22.00',
    'Refund Date': '2025-03-30T01:12:03.100Z',
    'Reversal Amount State': 'Final',
    'Reversal Reason': 'Customer return',
    'Reversal Status': 'Completed',
    Website: 'Amazon.com.au',
  };
  return HEADER.split(',')
    .map((column) => overrides[column] ?? base[column] ?? '')
    .join(',');
}

/** The same file with the columns the parser reads removed. */
export const REFUND_DETAILS_CSV_WRONG_SHAPE = `﻿Order ID,Disbursement Type\n${ORDER_SINGLE},Refund\n`;
