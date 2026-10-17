import { describe, expect, it } from 'vitest';

import { customLayout, planLabel } from '../labels/index.js';

import type { PrintSubject, ResolvedLabel } from '../labels/index.js';

const layout = customLayout({
  columns: 1,
  rows: 1,
  labelWidthMm: 90,
  labelHeightMm: 80,
  marginTopMm: 0,
  marginLeftMm: 0,
  pitchXMm: 90,
  pitchYMm: 80,
});

const subject: PrintSubject = {
  id: 'box-1',
  name: 'Fragile glass pieces',
  code: 'B1',
  suggestedCode: null,
  kind: 'container',
  place: null,
  quantity: 1,
};

const contents = Array.from({ length: 12 }, (_, index) => `Item ${index + 1}`);
const label: ResolvedLabel = {
  parts: ['qr', 'name', 'code', 'contents'],
  fields: [],
  contents,
  fallback: false,
};

describe('inline reservation', () => {
  it('reserves header text width while measuring contents at full label width', () => {
    const sizedLayout = { ...layout, scale: { ...layout.scale, qrMm: 24 } };
    const unreserved = planLabel(label, subject, sizedLayout);
    const reserved = planLabel(label, subject, sizedLayout, 25.5);
    expect(unreserved.arrangement).toBe('qr-header');
    expect(reserved.arrangement).toBe('qr-header');
    expect(reserved.header?.columns).toBe(2);
    expect(reserved.contents?.shown).toEqual(contents);
    expect(reserved.name?.lines).toBeGreaterThan(unreserved.name?.lines ?? 0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid reservation %s', (mm) => {
    expect(() => planLabel(label, subject, layout, mm)).toThrow(RangeError);
  });
});
