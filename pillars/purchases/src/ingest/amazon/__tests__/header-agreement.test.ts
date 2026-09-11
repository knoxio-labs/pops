/**
 * `findHeaderDisagreement`/`reportHeaderDisagreement` in isolation, against
 * synthetic fields rather than a real Amazon column — the two adapters that
 * actually use this already cover the CSV-shaped cases end to end
 * (`order-history.test.ts`, `digital-orders.test.ts`); this file is about
 * the comparison itself.
 */
import { describe, expect, it } from 'vitest';

import {
  findHeaderDisagreement,
  reportHeaderDisagreement,
  type HeaderField,
} from '../header-agreement.js';

import type { AmazonAnomaly, Row } from '../columns.js';

/** Upper-cased text, with a missing cell read as `'UNSPECIFIED'` rather than skipped. */
const WAREHOUSE: HeaderField = {
  column: 'Warehouse',
  normalize: (raw) => (raw === undefined ? 'UNSPECIFIED' : raw.trim().toUpperCase()),
};

/** A column skipped when unreadable, the way every real header field behaves. */
const STATUS: HeaderField = {
  column: 'Status',
  normalize: (raw) => raw?.trim().toLowerCase() ?? null,
};

describe('findHeaderDisagreement', () => {
  it('returns null for no rows at all', () => {
    expect(findHeaderDisagreement([], [STATUS])).toBeNull();
  });

  it('returns null for a group of one row, whatever it says', () => {
    const rows: Row[] = [{ Status: 'shipped' }];
    expect(findHeaderDisagreement(rows, [STATUS])).toBeNull();
  });

  it('returns null when every row states the same value', () => {
    const rows: Row[] = [{ Status: 'shipped' }, { Status: 'shipped' }, { Status: 'shipped' }];
    expect(findHeaderDisagreement(rows, [STATUS])).toBeNull();
  });

  it('treats differing case and surrounding whitespace as agreement', () => {
    const rows: Row[] = [{ Status: '  Shipped ' }, { Status: 'SHIPPED' }];
    expect(findHeaderDisagreement(rows, [STATUS])).toBeNull();
  });

  it('treats two spellings of the same instant as agreement', () => {
    const dateField: HeaderField = {
      column: 'Order Date',
      normalize: (raw) => (raw === undefined ? null : new Date(raw).toISOString()),
    };
    const rows: Row[] = [
      { 'Order Date': '2025-01-01T00:00:00Z' },
      { 'Order Date': '2025-01-01T00:00:00.000Z' },
    ];
    expect(findHeaderDisagreement(rows, [dateField])).toBeNull();
  });

  it('skips a field whose first-row value cannot be read, rather than comparing it', () => {
    // The first row's Status is unreadable, so the field is never a source
    // of disagreement even though a later row plainly states something.
    const rows: Row[] = [{ Status: undefined }, { Status: 'shipped' }];
    expect(findHeaderDisagreement(rows, [STATUS])).toBeNull();
  });

  it('reports the first field to disagree when several are checked, not a later one', () => {
    const rows: Row[] = [
      { Status: 'shipped', Warehouse: 'depot-a' },
      { Status: 'shipped', Warehouse: 'DEPOT-B' },
    ];
    expect(findHeaderDisagreement(rows, [STATUS, WAREHOUSE])).toMatchObject({
      column: 'Warehouse',
    });
  });

  it('reports a missing first-row cell as an empty string, when the field itself treats it as a fact', () => {
    const rows: Row[] = [{}, { Warehouse: 'DEPOT-B' }];
    expect(findHeaderDisagreement(rows, [WAREHOUSE])).toStrictEqual({
      column: 'Warehouse',
      first: '',
      other: 'DEPOT-B',
    });
  });

  it('reports a missing later cell as an empty string, the same way', () => {
    const rows: Row[] = [{ Warehouse: 'DEPOT-A' }, {}];
    expect(findHeaderDisagreement(rows, [WAREHOUSE])).toStrictEqual({
      column: 'Warehouse',
      first: 'DEPOT-A',
      other: '',
    });
  });
});

describe('reportHeaderDisagreement', () => {
  it('returns false and pushes nothing when the rows agree', () => {
    const anomalies: AmazonAnomaly[] = [];
    const rows: Row[] = [{ Status: 'shipped' }, { Status: 'shipped' }];

    expect(reportHeaderDisagreement(rows, [STATUS], 'ORDER-1', anomalies)).toBe(false);
    expect(anomalies).toHaveLength(0);
  });

  it('reports a disagreement as a dropped-order anomaly naming both values', () => {
    const anomalies: AmazonAnomaly[] = [];
    const rows: Row[] = [{ Status: 'shipped' }, { Status: 'cancelled' }];

    expect(reportHeaderDisagreement(rows, [STATUS], 'ORDER-2', anomalies)).toBe(true);
    expect(anomalies).toStrictEqual([
      {
        kind: 'dropped-order',
        sourceOrderId: 'ORDER-2',
        detail: 'rows disagree on Status: "shipped" vs "cancelled"',
      },
    ]);
  });
});
