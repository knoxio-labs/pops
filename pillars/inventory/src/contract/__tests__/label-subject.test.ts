import { describe, expect, it } from 'vitest';

import {
  inventoryCodeUri,
  itemUri,
  labelQrUri,
  labelQrExtent,
  labelQrMinimumMm,
  labelQrLayout,
  MIN_QR_MODULE_MM,
  QR_EXTENT_MODULES,
  sheetLayout,
  fitToSheet,
  customLayout,
} from '../labels/index.js';

describe('inventory label deep links', () => {
  it('keeps stable item references independent of code-based links', () => {
    expect(itemUri('item-123')).toBe('pops://inventory/item/item-123');
    expect(inventoryCodeUri('CAB-014')).toBe('pops-i://CAB-014');
    expect(inventoryCodeUri('A /?#@界')).toBe('pops-i://A%20%2F%3F%23%40%E7%95%8C');
  });

  it('preserves the assigned inventory code', () => {
    expect(labelQrUri({ id: 'item-123', code: 'cab-014' })).toBe('pops-i://cab-014');
  });

  it.each([null, ''])('uses item identity when code is %s', (code) => {
    expect(labelQrUri({ id: 'item-123', code })).toBe('pops://inventory/item/item-123');
  });
});

describe('payload-dependent QR dimensions', () => {
  const compact = { id: '8c1e4f2a-5b7d-4a9e-b3c6-000000000001', code: 'CAB-014' };
  const uncoded = { ...compact, code: null };

  it('makes a short code QR smaller while retaining the existing physical module scale', () => {
    const layout = sheetLayout('L7160');
    const smaller = labelQrLayout(compact, layout);
    expect(labelQrExtent(compact)).toBeLessThan(labelQrExtent(uncoded));
    expect(labelQrExtent(uncoded)).toBe(QR_EXTENT_MODULES);
    expect(smaller.scale.qrMm).toBeLessThan(layout.scale.qrMm);
    expect(smaller.scale.qrMm / labelQrExtent(compact)).toBeCloseTo(
      layout.scale.qrMm / QR_EXTENT_MODULES
    );
    expect(labelQrLayout(uncoded, layout)).toEqual(layout);
  });

  it('uses the printable minimum on short stock instead of scaling modules below it', () => {
    const minimum = labelQrMinimumMm(compact);
    const layout = customLayout({
      columns: 1,
      rows: 1,
      labelWidthMm: 60,
      labelHeightMm: minimum + 3,
      marginTopMm: 0,
      marginLeftMm: 0,
      pitchXMm: 60,
      pitchYMm: minimum + 3,
    });
    const actual = labelQrLayout(compact, layout);
    expect(actual.scale.qrMm).toBe(minimum);
    const label = {
      parts: ['qr', 'code'] as ('qr' | 'code')[],
      fields: [],
      contents: [],
      fallback: false,
    };
    expect(fitToSheet(label, actual, minimum)).toEqual(label);
    expect(fitToSheet(label, layout)).toBeNull();
  });

  it('measures percent-encoded codes instead of assuming a short code', () => {
    const long = { ...compact, code: '界/?#@'.repeat(12) };
    expect(labelQrUri(long)).toBe(`pops-i://${encodeURIComponent(long.code)}`);
    expect(labelQrMinimumMm(long)).toBeGreaterThan(labelQrMinimumMm(uncoded));
  });

  it('fits exactly the physical module boundary and rejects a smaller QR', () => {
    const minimum = labelQrMinimumMm(compact);
    expect(minimum / labelQrExtent(compact)).toBe(MIN_QR_MODULE_MM);
    const layout = customLayout({
      columns: 1,
      rows: 1,
      labelWidthMm: 60,
      labelHeightMm: minimum + 3,
      marginTopMm: 0,
      marginLeftMm: 0,
      pitchXMm: 60,
      pitchYMm: minimum + 3,
    });
    const qrOnly = { parts: ['qr'] as const, fields: [], contents: [], fallback: false };
    const label = { ...qrOnly, parts: [...qrOnly.parts] };
    expect(fitToSheet(label, layout, minimum)).toEqual(label);
    expect(
      fitToSheet(label, { ...layout, labelHeightMm: layout.labelHeightMm - 0.01 }, minimum)
    ).toBeNull();
    expect(fitToSheet(label, layout, labelQrMinimumMm(uncoded))).toBeNull();
  });
});
