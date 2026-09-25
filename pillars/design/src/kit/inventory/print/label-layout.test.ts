import { describe, expect, it } from 'vitest';

import { customLayout, MIN_QR_MM, sheetLayout } from '@pops/inventory/labels';

import { estimateLines, fillQrMm, fitList, fitNamePt, fitToSheet, planLabel } from './label-layout';

import type { PrintSubject } from '@pops/inventory/labels';

import type { LabelPart, ResolvedLabel } from './label-content';

const kitchen: PrintSubject = {
  id: '8c1e4f2a-5b7d-4a9e-b3c6-000000000001',
  name: 'Kitchen 12',
  code: 'B412',
  suggestedCode: null,
  kind: 'container',
  place: 'Kitchen',
  quantity: 1,
};

function showing(parts: LabelPart[], extra: Partial<ResolvedLabel> = {}): ResolvedLabel {
  return { parts, fields: [], contents: [], fallback: false, ...extra };
}

const narrow = customLayout({
  columns: 5,
  rows: 9,
  labelWidthMm: 38,
  labelHeightMm: 30,
  marginTopMm: 13.5,
  marginLeftMm: 6,
  pitchXMm: 40,
  pitchYMm: 30,
});

const tiny = customLayout({
  columns: 5,
  rows: 13,
  labelWidthMm: 38.1,
  labelHeightMm: 21.2,
  marginTopMm: 10.7,
  marginLeftMm: 4.75,
  pitchXMm: 40.64,
  pitchYMm: 21.2,
});

describe('estimateLines', () => {
  it('breaks between words and splits a word longer than a line', () => {
    expect(estimateLines('Kitchen 12', 10, 60)).toBe(1);
    expect(estimateLines('aaaa bbbb cccc', 10, 10)).toBe(3);
    expect(estimateLines('a'.repeat(8), 10, 10)).toBe(2);
    expect(estimateLines('a'.repeat(9), 10, 10)).toBe(3);
  });
});

describe('fitNamePt', () => {
  it('picks a smaller size for a longer name in the same box', () => {
    const box = { widthMm: 59.5, heightMm: 34.1 };
    const limits = { minPt: 8, maxPt: 60, maxLines: 4 };
    const short = fitNamePt('Kitchen 12', box, limits);
    const long = fitNamePt(
      'Kitchen 14, glasses and the good plates from the top cupboard',
      box,
      limits
    );
    expect(long.pt).toBeLessThan(short.pt);
    expect(long.lines).toBeLessThanOrEqual(4);
  });

  it('never goes below the minimum', () => {
    const fitted = fitNamePt(
      'x'.repeat(400),
      { widthMm: 20, heightMm: 10 },
      {
        minPt: 8,
        maxPt: 20,
        maxLines: 2,
      }
    );
    expect(fitted).toEqual({ pt: 8, lines: 2 });
  });
});

describe('fitList', () => {
  it('keeps every line when they fit', () => {
    expect(fitList(['a', 'b'], 2, 8)).toEqual({ pt: 8, shown: ['a', 'b'], more: 0 });
  });

  it('gives the last line to "+N more" when they do not', () => {
    expect(fitList(['a', 'b', 'c', 'd'], 3, 8)).toEqual({ pt: 8, shown: ['a', 'b'], more: 2 });
  });
});

describe('fitToSheet', () => {
  it('keeps a QR alone on a label too narrow for text beside it', () => {
    expect(fitToSheet(showing(['qr']), narrow)).toEqual(showing(['qr']));
  });

  it('steps a QR with a name down to QR and code where the name has no room', () => {
    const wanted = showing(['qr', 'name', 'code'], { contents: ['x'] });
    expect(fitToSheet(wanted, narrow)).toEqual(showing(['qr', 'code']));
  });

  it('refuses a QR on labels too small for one to scan, but not text alone', () => {
    expect(fillQrMm(tiny)).toBeLessThan(MIN_QR_MM);
    expect(fitToSheet(showing(['qr']), tiny)).toBeNull();
    expect(fitToSheet(showing(['code']), tiny)).toEqual(showing(['code']));
  });
});

describe('planLabel', () => {
  it('fills the label with a QR shown alone', () => {
    const layout = sheetLayout('L7165');
    const plan = planLabel(showing(['qr']), kitchen, layout);
    expect(plan.arrangement).toBe('qr-fill');
    expect(plan.qrMm).toBe(fillQrMm(layout));
    expect(plan.qrMm).toBeGreaterThan(layout.scale.qrMm);
  });

  it('keeps the approved scale for QR, name and code', () => {
    const layout = sheetLayout('L7160');
    const plan = planLabel(showing(['qr', 'name', 'code']), kitchen, layout);
    expect(plan.arrangement).toBe('qr-beside');
    expect(plan.qrMm).toBe(layout.scale.qrMm);
    expect(plan.name).toEqual({ pt: layout.scale.namePt, lines: layout.scale.nameLines });
    expect(plan.code?.pt).toBe(layout.scale.codePt);
  });

  it('sets a code or a name shown alone larger than the shared scale', () => {
    const layout = sheetLayout('L7160');
    expect(planLabel(showing(['code']), kitchen, layout).code?.pt).toBeGreaterThan(
      layout.scale.codePt
    );
    expect(planLabel(showing(['name']), kitchen, layout).name?.pt).toBeGreaterThan(
      layout.scale.namePt
    );
  });

  it('gives contents fewer lines when a name and code share the label', () => {
    const contents = Array.from({ length: 40 }, (_, index) => `Thing ${index}`);
    const layout = sheetLayout('L7163');
    const alone = planLabel(showing(['contents'], { contents }), kitchen, layout).contents;
    const shared = planLabel(
      showing(['qr', 'name', 'code', 'contents'], { contents }),
      kitchen,
      layout
    ).contents;
    expect(alone?.more).toBeGreaterThan(0);
    expect(shared?.shown.length).toBeLessThan(alone?.shown.length ?? 0);
    expect((shared?.shown.length ?? 0) + (shared?.more ?? 0)).toBe(40);
  });

  it('shows fields ahead of contents when both compete for lines', () => {
    const contents = Array.from({ length: 40 }, (_, index) => `Thing ${index}`);
    const fields = [
      { id: 'a.room', label: 'Room', value: 'Kitchen' },
      { id: 'a.packed', label: 'Packed', value: '22 Sep' },
    ];
    const plan = planLabel(
      showing(['name', 'contents'], { contents, fields }),
      kitchen,
      sheetLayout('L7160')
    );
    expect(plan.fields?.shown).toEqual(fields);
    expect(plan.contents?.more).toBeGreaterThan(0);
  });
});
