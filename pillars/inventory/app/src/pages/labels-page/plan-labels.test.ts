import { describe, expect, it } from 'vitest';

import { customLayout, sheetLayout } from '@pops/inventory/labels';

import { planLabels } from './plan-labels';

import type { LabelContent, PrintSubject } from '@pops/inventory/labels';

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

describe('recorded fragility', () => {
  it.each<LabelContent>([
    { kind: 'auto' },
    { kind: 'parts', parts: ['qr', 'code'], fields: [] },
    { kind: 'parts', parts: ['code'], fields: ['box.room'] },
  ])('omits recorded warnings when the Fragile field is unselected: %j', (content) => {
    const plan = planLabels({
      ...job,
      content,
      layout: sheetLayout('L7169'),
      fragility: new Map([
        [
          marked.id,
          { fragile: true, recorded: true, fields: new Set(['box.Fragile']), error: null },
        ],
      ]),
    });
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries.find((entry) => entry.subject.id === marked.id)?.fragile).toBeUndefined();
  });

  it('prints the recorded true as one symbol without the selected text field', () => {
    const field = { id: 'box.Fragile', label: 'Fragile', value: 'Yes' };
    const plan = planLabels({
      ...job,
      fragileIds: new Set(),
      layout: sheetLayout('L7165'),
      content: { kind: 'parts', parts: ['qr', 'name', 'code'], fields: [field.id] },
      details: new Map([[marked.id, { typeName: 'Box', fields: [field], contents: [] }]]),
      fragility: new Map([
        [marked.id, { fragile: true, recorded: true, fields: new Set([field.id]), error: null }],
      ]),
    });
    const entry = plan.entries.find((value) => value.subject.id === marked.id);
    expect(entry?.fragile).toBe(true);
    expect(entry?.label.fields).toEqual([]);
    expect(entry?.label.parts).toEqual(['qr', 'name', 'code']);
  });

  it('does not allow the manual fallback to override a recorded false', () => {
    const plan = planLabels({
      ...job,
      content: { kind: 'parts', parts: ['qr', 'code'], fields: ['box.Fragile'] },
      layout: sheetLayout('L7165'),
      fragility: new Map([
        [
          marked.id,
          { fragile: false, recorded: true, fields: new Set(['box.Fragile']), error: null },
        ],
      ]),
    });
    expect(plan.entries.find((value) => value.subject.id === marked.id)?.fragile).toBeUndefined();
  });

  it('keeps the manual fallback when no recorded field exists', () => {
    const plan = planLabels({
      ...job,
      layout: sheetLayout('L7165'),
      fragility: new Map([
        [marked.id, { fragile: false, recorded: false, fields: new Set<string>(), error: null }],
      ]),
    });
    expect(plan.entries.find((value) => value.subject.id === marked.id)?.fragile).toBe(true);
  });
});
