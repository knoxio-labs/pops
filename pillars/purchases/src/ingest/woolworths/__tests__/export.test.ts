import { describe, expect, it } from 'vitest';

import { parseWoolworthsExport, WoolworthsExportShapeError } from '../index.js';
import { exportFile, receiptPage, REAL_RECEIPT_LINES } from './fixtures.js';

describe('parseWoolworthsExport', () => {
  it('maps every receipt in the file', () => {
    const file = exportFile([
      { id: 'a', page: receiptPage() },
      {
        id: 'b',
        page: receiptPage({
          transactionDetails: 'POS 066 TRANS 3185 09:15 25/07/2026',
          lines: [{ description: 'Milk 2L', amount: '3.50' }],
          total: '$3.50',
        }),
      },
    ]);
    const result = parseWoolworthsExport(file);
    expect(result.purchases).toHaveLength(2);
    expect(result.anomalies).toEqual([]);
    expect(result.capturedAt).toBe('2026-08-07T00:11:00.000Z');
  });

  it('skips a receipt it cannot map without abandoning the rest of the file', () => {
    // One unreadable receipt out of a year's shopping is not a reason to
    // ingest none of it.
    const file = exportFile([
      { id: 'broken', page: receiptPage({ transactionDetails: null }) },
      { id: 'fine', page: receiptPage() },
    ]);
    const result = parseWoolworthsExport(file);
    expect(result.purchases).toHaveLength(1);
    expect(result.anomalies).toEqual([
      {
        kind: 'dropped-receipt',
        activityDetailsId: 'broken',
        detail: 'no readable transaction line, total or item block',
      },
    ]);
  });

  it('never skips silently', () => {
    // The whole point. A quiet skip means a shop that happened is simply
    // missing from the year, and nothing ever says so.
    const file = exportFile([{ id: 'broken', page: receiptPage({ total: '' }) }]);
    const result = parseWoolworthsExport(file);
    expect(result.purchases).toHaveLength(0);
    expect(result.anomalies).toHaveLength(1);
  });

  it('drops a second capture of the same till transaction', () => {
    // Two API ids can point at one shop. Ingesting both doubles the day's
    // spend, and the (source, sourceOrderId) unique index would reject the
    // second loudly, mid-import.
    const file = exportFile([
      { id: 'first', page: receiptPage() },
      { id: 'second', page: receiptPage() },
    ]);
    const result = parseWoolworthsExport(file);
    expect(result.purchases).toHaveLength(1);
    expect(result.anomalies[0]?.detail).toContain('1034-066-3184-24072026');
  });

  it('keeps two different shops at the same store on the same day apart', () => {
    // Same store, same date, different transaction number. Keying on
    // store+date alone would silently merge them.
    const file = exportFile([
      {
        id: 'morning',
        page: receiptPage({ transactionDetails: 'POS 066 TRANS 3184 09:00 24/07/2026' }),
      },
      {
        id: 'evening',
        page: receiptPage({ transactionDetails: 'POS 066 TRANS 3190 19:00 24/07/2026' }),
      },
    ]);
    expect(parseWoolworthsExport(file).purchases).toHaveLength(2);
  });

  it('carries a receipt-level anomaly through with the purchase it belongs to', () => {
    const file = exportFile([
      { id: 'odd', page: receiptPage({ lines: REAL_RECEIPT_LINES, total: '$99.99' }) },
    ]);
    const result = parseWoolworthsExport(file);
    expect(result.purchases).toHaveLength(1);
    expect(result.anomalies.map((a) => a.kind)).toEqual(['totals-mismatch']);
  });

  it('refuses a file that did not come from the extension', () => {
    expect(() => parseWoolworthsExport({})).toThrow(WoolworthsExportShapeError);
    expect(() =>
      parseWoolworthsExport({ source: 'amazon', formatVersion: 1, capturedAt: '', receipts: [] })
    ).toThrow(WoolworthsExportShapeError);
  });

  it('refuses a format version it does not understand', () => {
    // A future extension changing the file shape must fail here rather than
    // half-parse into purchases with fields quietly missing.
    const file = { ...(exportFile([]) as object), formatVersion: 2 };
    expect(() => parseWoolworthsExport(file)).toThrow(WoolworthsExportShapeError);
  });

  it('accepts an empty capture', () => {
    expect(parseWoolworthsExport(exportFile([])).purchases).toEqual([]);
  });
});
