import { describe, expect, it } from 'vitest';

import { customLayout, sheetLayout } from '@pops/inventory/labels';

import { planLabels } from './plan-labels';

import type { PrintSubject } from '@pops/inventory/labels';

const marked: PrintSubject = {
  id: 'marked',
  name: 'Glass box',
  code: 'B1',
  suggestedCode: null,
  kind: 'container',
  place: null,
  quantity: 1,
};
const ordinary: PrintSubject = { ...marked, id: 'ordinary', name: 'Other box' };

const job = {
  subjects: [marked, ordinary],
  copies: { container: 1, item: 1 },
  content: { kind: 'auto' as const },
  details: new Map(),
  fragileIds: new Set([marked.id]),
};

describe('label fit failure causes', () => {
  it('does not blame a fitting fragile label for another label’s oversized QR', () => {
    const stock = sheetLayout('L7165');
    const layout = { ...stock, scale: { ...stock.scale, qrMm: stock.labelHeightMm } };
    const plan = planLabels({ ...job, layout });
    expect(plan.entries.map((entry) => entry.subject.id)).toEqual([marked.id]);
    expect(plan.tooSmall).toBe(true);
    expect(plan.fragileTooSmall).toBe(false);
  });

  it('reports when the marked label actually cannot fit', () => {
    const layout = customLayout({
      columns: 1,
      rows: 1,
      labelWidthMm: 25,
      labelHeightMm: 30,
      marginTopMm: 0,
      marginLeftMm: 0,
      pitchXMm: 25,
      pitchYMm: 30,
    });
    const plan = planLabels({
      ...job,
      layout,
      content: { kind: 'parts', parts: ['code'], fields: [] },
    });
    expect(plan.entries.map((entry) => entry.subject.id)).toEqual([ordinary.id]);
    expect(plan.tooSmall).toBe(true);
    expect(plan.fragileTooSmall).toBe(true);
  });

  it('reports no failure for fitting marked and unmarked labels', () => {
    const plan = planLabels({ ...job, layout: sheetLayout('L7165') });
    expect(plan.entries).toHaveLength(2);
    expect(plan.tooSmall).toBe(false);
    expect(plan.fragileTooSmall).toBe(false);
  });
});
