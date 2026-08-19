/**
 * How a `Digital Content Orders.csv` row is rendered for the golden
 * fixture: the header, the sentinel-filled defaults, and the two builders.
 *
 * Split from the fixture itself so the rows a test cares about are not
 * buried under the machinery that turns them into text.
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

export type Column = (typeof HEADER)[number];

/** Every column Amazon fills with a sentinel rather than leaving empty. */
export const DIGITAL_ROW_DEFAULTS: Record<Column, string> = {
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
  const row = { ...DIGITAL_ROW_DEFAULTS, ...overrides };
  return HEADER.map((column) => quote(row[column])).join(',');
}

export function digitalCsvWithRows(rows: readonly string[]): string {
  // The real file opens with a UTF-8 BOM, and it lands on the first header
  // name rather than being consumed as an encoding marker.
  return `﻿${HEADER.map(quote).join(',')}\n${rows.join('\n')}\n`;
}
