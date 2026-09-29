import { describe, expect, it } from 'vitest';

import { customLayout, MIN_QR_MM, planLabel } from '../labels/index.js';

import type { LabelPart, ResolvedLabel } from '../labels/index.js';
import type { PrintSubject } from '../labels/label-subject.js';

const subject: PrintSubject = {
  id: '8c1e4f2a-5b7d-4a9e-b3c6-000000000001',
  name: 'Kitchen 12',
  code: 'B412',
  suggestedCode: null,
  kind: 'container',
  place: 'Kitchen',
  quantity: 1,
};

const wide = customLayout({
  columns: 1,
  rows: 1,
  labelWidthMm: 140,
  labelHeightMm: 100,
  marginTopMm: 0,
  marginLeftMm: 0,
  pitchXMm: 140,
  pitchYMm: 100,
});

const narrow = customLayout({
  columns: 1,
  rows: 1,
  labelWidthMm: 55,
  labelHeightMm: 45,
  marginTopMm: 0,
  marginLeftMm: 0,
  pitchXMm: 55,
  pitchYMm: 45,
});

function showing(
  parts: LabelPart[],
  contents: string[],
  fields: ResolvedLabel['fields'] = []
): ResolvedLabel {
  return { parts, fields, contents, fallback: false };
}

function contents(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Thing ${index + 1}`);
}

describe('QR header label planning', () => {
  it('uses one, two, then three content columns at capacity boundaries', () => {
    const first = planLabel(showing(['qr', 'name', 'contents'], contents(1)), subject, wide);
    expect(first.arrangement).toBe('qr-header');
    expect(first.header?.columns).toBe(1);
    const rows = first.header?.rows;
    if (rows === undefined || rows < 2) throw new Error('wide layout must fit at least two rows');

    const two = planLabel(showing(['qr', 'name', 'contents'], contents(rows + 1)), subject, wide);
    expect(two.header?.columns).toBe(2);
    expect(two.contents?.shown.length).toBe(rows + 1);

    const twoFull = planLabel(
      showing(['qr', 'name', 'contents'], contents(rows * 2)),
      subject,
      wide
    );
    expect(twoFull.header?.columns).toBe(2);
    expect(twoFull.contents?.more).toBe(0);

    const three = planLabel(
      showing(['qr', 'name', 'contents'], contents(rows * 2 + 1)),
      subject,
      wide
    );
    expect(three.header?.columns).toBe(3);
    expect(three.contents?.shown.length).toBe(rows * 2 + 1);
  });

  it('caps columns at three and preserves order with a single overflow count', () => {
    const baseline = planLabel(showing(['qr', 'contents'], contents(1)), subject, wide);
    const rows = baseline.header?.rows;
    if (rows === undefined) throw new Error('wide layout must fit a header');
    const values = contents(rows * 4 + 2);
    const plan = planLabel(showing(['qr', 'contents'], values), subject, wide);
    expect(plan.header?.columns).toBe(3);
    expect(plan.contents?.shown).toEqual(values.slice(0, rows * 3 - 1));
    expect(plan.contents?.more).toBe(values.length - (rows * 3 - 1));
  });

  it('keeps three columns at the inclusive forty millimetre width boundary', () => {
    const layout = customLayout({
      ...wide,
      labelWidthMm: 132,
      pitchXMm: 132,
    });
    const plan = planLabel(showing(['qr', 'contents'], contents(100)), subject, layout);
    expect(plan.header?.columns).toBe(3);
    expect((layout.labelWidthMm - layout.scale.paddingMm * 2 - 6) / 3).toBeGreaterThanOrEqual(40);

    const below = customLayout({ ...layout, labelWidthMm: 131.9, pitchXMm: 131.9 });
    const belowPlan = planLabel(showing(['qr', 'contents'], contents(100)), subject, below);
    expect(belowPlan.header?.columns).toBe(2);
  });

  it('reduces body rows when header fields are present', () => {
    const withoutFields = planLabel(
      showing(['qr', 'name', 'contents'], contents(1)),
      subject,
      wide
    );
    const withFields = planLabel(
      showing(
        ['qr', 'name', 'contents'],
        contents(1),
        Array.from({ length: 7 }, (_, index) => ({
          id: `field-${index}`,
          label: `Field ${index}`,
          value: `Value ${index}`,
        }))
      ),
      subject,
      wide
    );
    expect(withFields.header?.rows).toBeLessThan(withoutFields.header?.rows ?? 0);

    const threeFields = planLabel(
      showing(
        ['qr', 'name', 'contents'],
        contents(1),
        Array.from({ length: 3 }, (_, index) => ({
          id: `field-${index}`,
          label: `Field ${index}`,
          value: `Value ${index}`,
        }))
      ),
      subject,
      wide
    );
    expect(threeFields.header?.rows).toBe(withoutFields.header?.rows);
  });

  it('requires readable widths for two columns and reserves overflow within one column', () => {
    const layout = customLayout({ ...wide, labelWidthMm: 89, pitchXMm: 89 });
    const atBoundary = planLabel(showing(['qr', 'contents'], contents(100)), subject, layout);
    expect(atBoundary.header?.columns).toBe(2);
    const below = customLayout({ ...layout, labelWidthMm: 88.9, pitchXMm: 88.9 });
    const plan = planLabel(showing(['qr', 'contents'], contents(100)), subject, below);
    expect(plan.header?.columns).toBe(1);
    expect(plan.contents?.shown.length).toBe((plan.header?.rows ?? 0) - 1);
    expect((plan.contents?.shown.length ?? 0) + (plan.contents?.more ?? 0)).toBe(100);
  });

  it('reserves body space even when fields overflow the header', () => {
    const fields = Array.from({ length: 100 }, (_, index) => ({
      id: `f${index}`,
      label: 'Field',
      value: 'Value',
    }));
    const plan = planLabel(
      showing(['qr', 'name', 'code', 'contents'], contents(100), fields),
      subject,
      wide
    );
    expect(plan.arrangement).toBe('qr-header');
    expect(plan.header?.rows).toBeGreaterThanOrEqual(1);
    expect(plan.fields?.more).toBeGreaterThan(0);
    expect((plan.fields?.shown.length ?? 0) + (plan.fields?.more ?? 0)).toBe(fields.length);
    expect((plan.contents?.shown.length ?? 0) + (plan.contents?.more ?? 0)).toBe(100);
  });

  it('preserves existing plans for no contents and no QR', () => {
    expect(planLabel(showing(['qr', 'name'], []), subject, wide).arrangement).toBe('qr-beside');
    expect(planLabel(showing(['name', 'contents'], []), subject, wide).arrangement).toBe('text');
    expect(planLabel(showing(['qr', 'contents'], []), subject, wide).arrangement).toBe('qr-beside');
  });

  it('keeps the QR at or above the minimum scan size', () => {
    const plan = planLabel(showing(['qr', 'contents'], contents(20)), subject, wide);
    expect(plan.qrMm).toBeGreaterThanOrEqual(MIN_QR_MM);
  });

  it('falls back on a small label when a QR header cannot fit', () => {
    const plan = planLabel(
      showing(['qr', 'name', 'contents'], contents(4)),
      subject,
      customLayout({
        ...narrow,
        labelWidthMm: 38.1,
        labelHeightMm: 21.2,
        pitchXMm: 38.1,
        pitchYMm: 21.2,
      })
    );
    expect(plan.arrangement).not.toBe('qr-header');
  });
});
