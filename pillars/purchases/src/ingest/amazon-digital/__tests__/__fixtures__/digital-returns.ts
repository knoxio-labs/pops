/**
 * Golden CSV text for the Amazon digital-returns parser.
 *
 * Same component grain as `Digital Content Orders.csv` — one row per
 * monetary piece of a reversal — which is why a return is the sum of its
 * rows and never one row's amount.
 */
import { ORDER_FOREIGN, ORDER_PAID, ORDER_PROMOTION_OFFSET } from './digital-orders.js';

const HEADER = [
  'Amount Refunded',
  'Base Currency',
  'Digital Order Item ID',
  'Monetary Component Type',
  'Order ID',
  'Return Date',
  'Return Status',
  'Transaction Amount',
] as const;

type Column = (typeof HEADER)[number];

const DEFAULTS: Record<Column, string> = {
  'Amount Refunded': 'Not Available',
  'Base Currency': 'AUD',
  'Digital Order Item ID': 'ITEM0000000000000001',
  'Monetary Component Type': 'Price Amount',
  'Order ID': ORDER_PAID,
  'Return Date': '2025-04-07T08:44:00Z',
  'Return Status': 'Customer Return Complete',
  'Transaction Amount': '6.35',
};

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function returnRowWith(overrides: Partial<Record<Column, string>>): string {
  const row = { ...DEFAULTS, ...overrides };
  return HEADER.map((column) => quote(row[column])).join(',');
}

export function returnsCsvWithRows(rows: readonly string[]): string {
  return `﻿${HEADER.map(quote).join(',')}\n${rows.join('\n')}\n`;
}

/** A return that names an order the orders file does not yield. */
export const RETURN_ORPHAN = 'D01-0000000-0000404';
/** A return the file states as unfinished. */
export const RETURN_INCOMPLETE = 'D01-0000000-0000005';
/** A return whose stated total disagrees with its own components. */
export const RETURN_DISAGREEING = 'D01-0000000-0000006';

export const DIGITAL_RETURNS_CSV = returnsCsvWithRows([
  // Money really came back: the components net positive and `Amount
  // Refunded` states the same figure.
  returnRowWith({
    'Order ID': ORDER_PAID,
    'Amount Refunded': '6.99',
    'Monetary Component Type': 'Price Amount',
    'Transaction Amount': '6.35',
  }),
  returnRowWith({
    'Order ID': ORDER_PAID,
    'Amount Refunded': '6.99',
    'Monetary Component Type': 'Tax',
    'Transaction Amount': '0.64',
  }),

  // A credit came back, not money: the promotion pair nets the reversal to
  // zero, and the file states no `Amount Refunded` at all.
  returnRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Base Currency': 'Not Available',
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Monetary Component Type': 'Price Amount',
    'Transaction Amount': '13.59',
  }),
  returnRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Base Currency': 'Not Available',
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Monetary Component Type': 'Price Amount',
    'Transaction Amount': '-13.59',
  }),
  returnRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Base Currency': 'Not Available',
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Monetary Component Type': 'Tax',
    'Transaction Amount': '1.36',
  }),
  returnRowWith({
    'Order ID': ORDER_PROMOTION_OFFSET,
    'Base Currency': 'Not Available',
    'Digital Order Item ID': 'ITEM0000000000000002',
    'Monetary Component Type': 'Tax',
    'Transaction Amount': '-1.36',
  }),

  returnRowWith({
    'Order ID': ORDER_FOREIGN,
    'Base Currency': 'USD',
    'Amount Refunded': '19.23',
    'Digital Order Item ID': 'ITEM0000000000000004',
    'Transaction Amount': '19.23',
  }),

  returnRowWith({
    'Order ID': RETURN_ORPHAN,
    'Amount Refunded': '5.00',
    'Digital Order Item ID': 'ITEM0000000000000404',
    'Transaction Amount': '5.00',
  }),

  returnRowWith({
    'Order ID': RETURN_INCOMPLETE,
    'Return Status': 'Return Requested',
    'Amount Refunded': '9.99',
    'Digital Order Item ID': 'ITEM0000000000000005',
    'Transaction Amount': '9.99',
  }),

  returnRowWith({
    'Order ID': RETURN_DISAGREEING,
    'Amount Refunded': '10.00',
    'Digital Order Item ID': 'ITEM0000000000000006',
    'Transaction Amount': '5.00',
  }),
]);

/** A file whose columns are not this export's. */
export const DIGITAL_RETURNS_CSV_WRONG_SHAPE = 'Order ID,Refund Amount\nD01-1,5.00\n';
