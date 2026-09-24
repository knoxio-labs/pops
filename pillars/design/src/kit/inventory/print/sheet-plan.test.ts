import { describe, expect, it } from 'vitest';

import { codeFitsOneLine, fitCodePt } from './code-fit';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  clampStartAt,
  describeLayout,
  labelsPerSheet,
  SHEET_LAYOUTS,
  sheetLayout,
  slotOrigin,
} from './sheet-layouts';
import { expandCopies, nextStartAt, pageCount, planSheets } from './sheet-plan';

const eight = sheetLayout('a4-8');
const fourteen = sheetLayout('a4-14');
const twentyOne = sheetLayout('a4-21');

describe('sheet layouts', () => {
  it('counts the labels on each sheet', () => {
    expect(labelsPerSheet(eight)).toBe(8);
    expect(labelsPerSheet(fourteen)).toBe(14);
    expect(labelsPerSheet(twentyOne)).toBe(21);
  });

  it('names a sheet by count and label size', () => {
    expect(describeLayout(fourteen)).toBe('14 per sheet, 99.1 × 38.1 mm');
  });

  it.each(SHEET_LAYOUTS)('keeps every $sizeCode label on the A4 page', (layout) => {
    const last = slotOrigin(layout, labelsPerSheet(layout) - 1);
    expect(last.xMm + layout.labelWidthMm).toBeLessThanOrEqual(A4_WIDTH_MM + 0.01);
    expect(last.yMm + layout.labelHeightMm).toBeLessThanOrEqual(A4_HEIGHT_MM + 0.01);
    expect(layout.pitchXMm).toBeGreaterThanOrEqual(layout.labelWidthMm);
    expect(layout.pitchYMm).toBeGreaterThanOrEqual(layout.labelHeightMm);
  });

  it.each(SHEET_LAYOUTS)('centres the $sizeCode grid on the page', (layout) => {
    const last = slotOrigin(layout, labelsPerSheet(layout) - 1);
    const right = A4_WIDTH_MM - (last.xMm + layout.labelWidthMm);
    const bottom = A4_HEIGHT_MM - (last.yMm + layout.labelHeightMm);
    expect(right).toBeCloseTo(layout.marginLeftMm, 1);
    expect(bottom).toBeCloseTo(layout.marginTopMm, 1);
  });

  it.each(SHEET_LAYOUTS)('fits the $sizeCode QR inside its label', (layout) => {
    const { paddingMm, qrMm } = layout.scale;
    expect(qrMm + paddingMm * 2).toBeLessThanOrEqual(layout.labelHeightMm);
    expect(qrMm + paddingMm * 2).toBeLessThan(layout.labelWidthMm);
  });

  it('numbers labels across a row, then down', () => {
    expect(slotOrigin(twentyOne, 0)).toEqual({ xMm: 7.21, yMm: 15.15 });
    expect(slotOrigin(twentyOne, 2).yMm).toBe(15.15);
    expect(slotOrigin(twentyOne, 3)).toEqual({ xMm: 7.21, yMm: 15.15 + 38.1 });
  });

  it('refuses a slot off the sheet', () => {
    expect(() => slotOrigin(eight, 8)).toThrow(RangeError);
    expect(() => slotOrigin(eight, -1)).toThrow(RangeError);
    expect(() => slotOrigin(eight, 1.5)).toThrow(RangeError);
  });

  it('pulls a start back onto a smaller sheet', () => {
    expect(clampStartAt(14, eight)).toBe(8);
    expect(clampStartAt(0, eight)).toBe(1);
    expect(clampStartAt(Number.NaN, eight)).toBe(1);
    expect(clampStartAt(5.7, eight)).toBe(5);
  });
});

describe('page count', () => {
  it('needs no sheet for no labels, wherever the start is', () => {
    expect(pageCount(0, 1, eight)).toBe(0);
    expect(pageCount(0, 8, eight)).toBe(0);
  });

  it('fills a sheet exactly without starting another', () => {
    expect(pageCount(8, 1, eight)).toBe(1);
    expect(pageCount(9, 1, eight)).toBe(2);
  });

  it('counts the used labels at the head of the first sheet', () => {
    expect(pageCount(1, 8, eight)).toBe(1);
    expect(pageCount(2, 8, eight)).toBe(2);
    expect(pageCount(25, 7, fourteen)).toBe(3);
    expect(pageCount(22, 1, fourteen)).toBe(2);
  });

  it('refuses a start that is not a label on the sheet', () => {
    expect(() => pageCount(3, 0, eight)).toThrow(RangeError);
    expect(() => pageCount(3, 9, eight)).toThrow(RangeError);
    expect(() => pageCount(3, 2.5, eight)).toThrow(RangeError);
    expect(() => pageCount(-1, 1, eight)).toThrow(RangeError);
  });
});

describe('planSheets', () => {
  it('marks skipped, printed and blank slots', () => {
    const [page] = planSheets(3, 4, eight);
    expect(page?.slots.map((slot) => slot.kind)).toEqual([
      'used',
      'used',
      'used',
      'label',
      'label',
      'label',
      'blank',
      'blank',
    ]);
  });

  it('carries label order across sheets and skips only on the first', () => {
    const pages = planSheets(10, 7, eight);
    expect(pages).toHaveLength(2);
    const labels = pages.flatMap((page) =>
      page.slots.flatMap((slot) => (slot.kind === 'label' ? [slot.label] : []))
    );
    expect(labels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pages[1]?.slots.filter((slot) => slot.kind === 'used')).toHaveLength(0);
    expect(pages[1]?.slots.filter((slot) => slot.kind === 'blank')).toHaveLength(0);
  });

  it('returns no sheets for an empty job', () => {
    expect(planSheets(0, 5, twentyOne)).toEqual([]);
  });
});

describe('nextStartAt', () => {
  it('continues on the same sheet after a partial job', () => {
    expect(nextStartAt(6, 1, eight)).toBe(7);
    expect(nextStartAt(5, 14, twentyOne)).toBe(19);
  });

  it('wraps to a fresh sheet when a job ends on the last label', () => {
    expect(nextStartAt(8, 1, eight)).toBe(1);
    expect(nextStartAt(3, 6, eight)).toBe(1);
  });

  it('continues on the last sheet of a multi-sheet job', () => {
    expect(nextStartAt(25, 7, fourteen)).toBe(4);
  });
});

describe('expandCopies', () => {
  it('keeps copies of one item side by side', () => {
    expect(expandCopies(['a', 'b'], 2)).toEqual(['a', 'a', 'b', 'b']);
  });

  it('refuses fewer than one copy', () => {
    expect(() => expandCopies(['a'], 0)).toThrow(RangeError);
    expect(() => expandCopies(['a'], 1.5)).toThrow(RangeError);
  });
});

describe('fitCodePt', () => {
  it('prints a short code at the layout size', () => {
    expect(fitCodePt('B412', 40, 30, 12)).toBe(30);
  });

  it('shrinks a long code until it fits one line', () => {
    const pt = fitCodePt('BREW-2026-0007-A', 23, 13, 6.5);
    expect(pt).toBeLessThan(13);
    expect(codeFitsOneLine('BREW-2026-0007-A', 23, pt)).toBe(true);
    expect(codeFitsOneLine('BREW-2026-0007-A', 23, pt + 0.5)).toBe(false);
  });

  it('never goes below the minimum, even when that means wrapping', () => {
    expect(fitCodePt('A-VERY-LONG-CODE-THAT-WILL-NOT-FIT', 10, 13, 6.5)).toBe(6.5);
  });

  it('refuses a minimum above the maximum', () => {
    expect(() => fitCodePt('B412', 40, 10, 12)).toThrow(RangeError);
  });
});
