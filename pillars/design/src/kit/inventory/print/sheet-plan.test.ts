import { describe, expect, it } from 'vitest';

import { codeFitsOneLine, fitCodePt } from './code-fit';
import { parseCustomSheet } from './custom-sheet-storage';
import { DEFAULT_COPIES, resolveTemplate } from './print-subject';
import { geometryOf, sheetGeometryProblems } from './sheet-geometry';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  clampStartAt,
  customLayout,
  deriveScale,
  describeLayout,
  labelsPerSheet,
  MIN_QR_MM,
  MIN_TEXT_MM,
  slotOrigin,
  templateFits,
  textWidthMm,
} from './sheet-layouts';
import { expandCopies, nextStartAt, pageCount, planSheets } from './sheet-plan';
import { DEFAULT_SHEET_ID, findPreset, SHEET_PRESETS, sheetLayout } from './sheet-presets';

import type { SheetGeometry, SheetLayout } from './sheet-layouts';

const eight = sheetLayout('L7165');
const fourteen = sheetLayout('L7163');
const twentyOne = sheetLayout('L7160');

const custom27: SheetGeometry = {
  columns: 3,
  rows: 9,
  labelWidthMm: 63.5,
  labelHeightMm: 29.6,
  marginTopMm: 15.3,
  marginLeftMm: 7.21,
  pitchXMm: 66.04,
  pitchYMm: 29.6,
};

const narrow: SheetGeometry = {
  columns: 5,
  rows: 9,
  labelWidthMm: 38,
  labelHeightMm: 30,
  marginTopMm: 13.5,
  marginLeftMm: 6,
  pitchXMm: 40,
  pitchYMm: 30,
};

const addressLabels: SheetGeometry = {
  columns: 5,
  rows: 13,
  labelWidthMm: 38.1,
  labelHeightMm: 21.2,
  marginTopMm: 10.7,
  marginLeftMm: 4.75,
  pitchXMm: 40.64,
  pitchYMm: 21.2,
};

const PRESET_COUNTS: [string, number, number, number][] = [
  ['L7159', 24, 63.5, 33.9],
  ['L7160', 21, 63.5, 38.1],
  ['L7161', 18, 63.5, 46.6],
  ['L7162', 16, 99.1, 33.9],
  ['L7163', 14, 99.1, 38.1],
  ['L7173', 10, 99.1, 57],
  ['L7165', 8, 99.1, 67.7],
  ['L7166', 6, 99.1, 93.1],
  ['L7169', 4, 99.1, 139],
  ['L7168', 2, 199.6, 143.5],
  ['L7167', 1, 199.6, 289.1],
];

const EVERY_LAYOUT: SheetLayout[] = [...SHEET_PRESETS, customLayout(custom27)];

describe('sheet presets', () => {
  it.each(PRESET_COUNTS)('%s has %i labels of %f × %f mm', (id, count, width, height) => {
    const layout = sheetLayout(id);
    expect(labelsPerSheet(layout)).toBe(count);
    expect(layout.labelWidthMm).toBe(width);
    expect(layout.labelHeightMm).toBe(height);
  });

  it('offers exactly the listed presets, most labels per sheet first', () => {
    expect(SHEET_PRESETS.map((layout) => layout.id)).toEqual(PRESET_COUNTS.map(([id]) => id));
  });

  it('opens on a preset it knows', () => {
    expect(findPreset(DEFAULT_SHEET_ID)).not.toBeNull();
  });

  it('names a sheet by code, count and label size', () => {
    expect(describeLayout(fourteen)).toBe('L7163 · 14 per sheet, 99.1 × 38.1 mm');
    expect(describeLayout(customLayout(custom27))).toBe('Custom · 27 per sheet, 63.5 × 29.6 mm');
  });

  it('refuses an id it does not know', () => {
    expect(findPreset('a4-8')).toBeNull();
    expect(() => sheetLayout('L9999')).toThrow(RangeError);
  });

  it.each(SHEET_PRESETS)('$id is a printable geometry', (layout) => {
    expect(sheetGeometryProblems(geometryOf(layout))).toEqual([]);
  });

  it.each(SHEET_PRESETS)('centres the $id grid on the page', (layout) => {
    const last = slotOrigin(layout, labelsPerSheet(layout) - 1);
    const right = A4_WIDTH_MM - (last.xMm + layout.labelWidthMm);
    const bottom = A4_HEIGHT_MM - (last.yMm + layout.labelHeightMm);
    expect(right).toBeCloseTo(layout.marginLeftMm, 1);
    expect(bottom).toBeCloseTo(layout.marginTopMm, 1);
  });

  it.each(EVERY_LAYOUT)('fits the $id QR inside its label above the minimum', (layout) => {
    const { paddingMm, qrMm } = layout.scale;
    expect(qrMm).toBeGreaterThanOrEqual(MIN_QR_MM);
    expect(qrMm + paddingMm * 2).toBeLessThanOrEqual(layout.labelHeightMm);
    expect(textWidthMm(layout)).toBeGreaterThanOrEqual(MIN_TEXT_MM.container);
    expect(templateFits(layout, 'container')).toBe(true);
    expect(templateFits(layout, 'item')).toBe(true);
  });

  it('keeps the scales the owner reviewed on the three original sheets', () => {
    expect(eight.scale.qrMm).toBe(48);
    expect(fourteen.scale.codePt).toBe(20);
    expect(twentyOne.scale.namePt).toBe(8);
  });
});

describe('slot geometry', () => {
  it('numbers labels across a row, then down', () => {
    expect(slotOrigin(twentyOne, 0)).toEqual({ xMm: 7.21, yMm: 15.15 });
    expect(slotOrigin(twentyOne, 2).yMm).toBe(15.15);
    expect(slotOrigin(twentyOne, 3)).toEqual({ xMm: 7.21, yMm: 15.15 + 38.1 });
  });

  it('places a custom sheet by its own pitch', () => {
    const layout = customLayout(custom27);
    expect(slotOrigin(layout, 4).xMm).toBeCloseTo(7.21 + 66.04, 5);
    expect(slotOrigin(layout, 26).yMm).toBeCloseTo(15.3 + 8 * 29.6, 5);
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

describe('custom sheet geometry', () => {
  it('accepts a sheet that stays on the page', () => {
    expect(sheetGeometryProblems(custom27)).toEqual([]);
  });

  it('accepts a grid that ends exactly at the page edge', () => {
    expect(
      sheetGeometryProblems({
        ...custom27,
        columns: 1,
        rows: 1,
        labelWidthMm: 210,
        labelHeightMm: 297,
        marginLeftMm: 0,
        marginTopMm: 0,
      })
    ).toEqual([]);
  });

  it('refuses labels that run off the right or bottom edge', () => {
    expect(sheetGeometryProblems({ ...custom27, marginLeftMm: 17 })).toEqual([
      'The labels run 2.6 mm off the right edge.',
    ]);
    expect(sheetGeometryProblems({ ...custom27, rows: 10 })).toEqual([
      'The labels run 14.3 mm off the bottom edge.',
    ]);
  });

  it('refuses overlapping labels', () => {
    expect(sheetGeometryProblems({ ...custom27, pitchXMm: 60 })).toContain(
      'Across pitch must be at least the label width, or labels overlap.'
    );
    expect(sheetGeometryProblems({ ...custom27, pitchYMm: 20 })).toContain(
      'Down pitch must be at least the label height, or labels overlap.'
    );
  });

  it('ignores the pitch of a single column or row', () => {
    expect(
      sheetGeometryProblems({ ...custom27, columns: 1, pitchXMm: 0, rows: 1, pitchYMm: 0 })
    ).toEqual([]);
  });

  it('refuses fractional, zero or missing counts and measurements', () => {
    expect(sheetGeometryProblems({ ...custom27, columns: 2.5 })).toContain(
      'Labels across must be a whole number from 1 to 10.'
    );
    expect(sheetGeometryProblems({ ...custom27, rows: 0 })).toContain(
      'Labels down must be a whole number from 1 to 40.'
    );
    expect(sheetGeometryProblems({ ...custom27, labelHeightMm: Number.NaN })).toContain(
      'Every measurement needs a number.'
    );
    expect(sheetGeometryProblems({ ...custom27, labelWidthMm: 0 })).toContain(
      'Labels need a width and a height.'
    );
    expect(sheetGeometryProblems({ ...custom27, marginTopMm: -1 })).toContain(
      'Margins cannot be negative.'
    );
  });

  it('reads back a remembered sheet and forgets a broken one', () => {
    expect(parseCustomSheet(JSON.stringify(custom27))).toEqual(custom27);
    expect(parseCustomSheet(null)).toBeNull();
    expect(parseCustomSheet('{not json')).toBeNull();
    expect(parseCustomSheet(JSON.stringify({ ...custom27, rows: '9' }))).toBeNull();
    expect(parseCustomSheet(JSON.stringify({ ...custom27, rows: 30 }))).toBeNull();
    expect(parseCustomSheet('[]')).toBeNull();
  });
});

describe('templates per sheet', () => {
  it('derives a QR that keeps the item text column', () => {
    const scale = deriveScale(63.5, 29.6);
    expect(scale.qrMm).toBe(26.5);
    expect(scale.paddingMm).toBe(1.5);
  });

  it('hides the box label on labels too narrow for its name', () => {
    const layout = customLayout(narrow);
    expect(templateFits(layout, 'item')).toBe(true);
    expect(templateFits(layout, 'container')).toBe(false);
    expect(resolveTemplate({ kind: 'container' }, 'auto', layout)).toBe('item');
    expect(resolveTemplate({ kind: 'container' }, 'container', layout)).toBe('item');
  });

  it('prints nothing on labels too small for a QR that scans', () => {
    const layout = customLayout(addressLabels);
    expect(layout.scale.qrMm).toBeLessThan(MIN_QR_MM);
    expect(templateFits(layout, 'item')).toBe(false);
    expect(resolveTemplate({ kind: 'item' }, 'auto', layout)).toBeNull();
  });

  it('gives a box the box label and a thing the item label on auto', () => {
    expect(resolveTemplate({ kind: 'container' }, 'auto', twentyOne)).toBe('container');
    expect(resolveTemplate({ kind: 'item' }, 'auto', twentyOne)).toBe('item');
    expect(resolveTemplate({ kind: 'container' }, 'item', twentyOne)).toBe('item');
    expect(resolveTemplate({ kind: 'item' }, 'container', twentyOne)).toBe('container');
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
    expect(pageCount(1, 1, sheetLayout('L7167'))).toBe(1);
    expect(pageCount(2, 1, sheetLayout('L7167'))).toBe(2);
  });

  it('counts the used labels at the head of the first sheet', () => {
    expect(pageCount(1, 8, eight)).toBe(1);
    expect(pageCount(2, 8, eight)).toBe(2);
    expect(pageCount(25, 7, fourteen)).toBe(3);
    expect(pageCount(22, 1, fourteen)).toBe(2);
    expect(pageCount(4, 25, customLayout(custom27))).toBe(2);
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
    expect(nextStartAt(1, 1, sheetLayout('L7167'))).toBe(1);
  });

  it('continues on the last sheet of a multi-sheet job', () => {
    expect(nextStartAt(25, 7, fourteen)).toBe(4);
  });
});

describe('expandCopies', () => {
  it('gives a box two labels and a thing one by default, side by side', () => {
    const subjects = [
      { id: 'box', kind: 'container' as const },
      { id: 'cup', kind: 'item' as const },
      { id: 'jug', kind: 'item' as const },
    ];
    expect(
      expandCopies(subjects, (subject) => DEFAULT_COPIES[subject.kind]).map((s) => s.id)
    ).toEqual(['box', 'box', 'cup', 'jug']);
  });

  it('refuses fewer than one copy', () => {
    expect(() => expandCopies(['a'], () => 0)).toThrow(RangeError);
    expect(() => expandCopies(['a'], () => 1.5)).toThrow(RangeError);
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
