import { describe, expect, it } from 'vitest';

import { labelReadState, requiredLabelReads } from './label-read-state';

import type { PrintSubject } from '@pops/inventory/labels';

import type { LabelReads, LabelReadState } from './label-read-state';

const subject: PrintSubject = {
  id: 'box',
  name: 'Box',
  kind: 'container',
  code: 'B1',
  suggestedCode: null,
  place: null,
  quantity: 1,
};
const ready: LabelReadState = { pending: false, error: null };
const failure = new Error('Unavailable');
const failed: LabelReadState = { pending: false, error: failure };
const reads: LabelReads = {
  items: ready,
  catalogue: failed,
  contents: new Map([['box', failed]]),
  descendants: new Map([['box', failed]]),
};
const fragility = new Map([
  ['box', { fragile: false, recorded: true, fields: new Set(['box.Fragile']), error: failure }],
]);
const fieldErrors = new Map([['box', new Map([['box.Fragile', failure]])]]);

describe('selected label read dependencies', () => {
  it('ignores optional failures and refreshes for QR/code and Auto', () => {
    for (const content of [
      { kind: 'auto' } as const,
      { kind: 'parts', parts: ['qr', 'code'], fields: [] } as const,
    ]) {
      expect(
        requiredLabelReads(content, [subject], {
          reads: reads,
          fragility: fragility,
          fieldErrors: fieldErrors,
        })
      ).toEqual(ready);
      expect(
        requiredLabelReads(content, [subject], {
          reads: {
            ...reads,
            catalogue: { pending: true, error: null },
            contents: new Map([['box', { pending: true, error: null }]]),
            descendants: new Map([['box', { pending: true, error: null }]]),
          },
          fragility: fragility,
          fieldErrors: fieldErrors,
        })
      ).toEqual(ready);
    }
  });

  it('requires fresh selected items for every content choice', () => {
    const content = { kind: 'auto' } as const;
    expect(
      requiredLabelReads(content, [subject], {
        reads: { ...reads, items: failed },
        fragility: fragility,
        fieldErrors: fieldErrors,
      })
    ).toEqual(failed);
    expect(
      requiredLabelReads(content, [subject], {
        reads: { ...reads, items: { pending: true, error: null } },
        fragility: fragility,
        fieldErrors: fieldErrors,
      })
    ).toEqual({ pending: true, error: null });
  });

  it('requires direct contents only when contents print', () => {
    const content = { kind: 'parts', parts: ['contents'], fields: [] } as const;
    expect(
      requiredLabelReads(content, [subject], {
        reads: reads,
        fragility: fragility,
        fieldErrors: fieldErrors,
      })
    ).toEqual(failed);
    expect(
      requiredLabelReads(content, [subject], {
        reads: { ...reads, contents: new Map([['box', ready]]) },
        fragility: fragility,
        fieldErrors: fieldErrors,
      })
    ).toEqual(ready);
  });

  it('requires the catalogue and selected field evaluations', () => {
    const content = { kind: 'parts', parts: ['code'], fields: ['box.Fragile'] } as const;
    expect(
      requiredLabelReads(content, [subject], {
        reads: reads,
        fragility: fragility,
        fieldErrors: fieldErrors,
      })
    ).toEqual(failed);
    const selected = new Map([['box', new Map([['box.Weight', failure]])]]);
    expect(
      requiredLabelReads({ ...content, fields: ['box.Weight'] }, [subject], {
        reads: { ...reads, catalogue: ready },
        fragility: fragility,
        fieldErrors: selected,
      })
    ).toEqual(failed);
    expect(
      requiredLabelReads({ ...content, fields: ['box.Weight'] }, [subject], {
        reads: { ...reads, catalogue: { pending: true, error: null } },
        fragility: fragility,
        fieldErrors: undefined,
      })
    ).toEqual({ pending: true, error: null });
  });

  it('requires descendants only for subjects represented by the selected handling field', () => {
    const content = { kind: 'parts', parts: ['code'], fields: ['box.Fragile'] } as const;
    const available = new Map([['box', { ...fragility.get('box')!, error: null }]]);
    const selectedReads = { ...reads, catalogue: ready };
    expect(
      requiredLabelReads(content, [subject], {
        reads: selectedReads,
        fragility: available,
        fieldErrors: undefined,
      })
    ).toEqual(failed);
    expect(
      requiredLabelReads(content, [subject, { ...subject, id: 'unrelated' }], {
        reads: {
          ...selectedReads,
          descendants: new Map([
            ['box', ready],
            ['unrelated', failed],
          ]),
        },
        fragility: available,
        fieldErrors: undefined,
      })
    ).toEqual(ready);
    expect(
      requiredLabelReads(content, [subject], {
        reads: {
          ...selectedReads,
          descendants: new Map([['box', { pending: true, error: null }]]),
        },
        fragility: available,
        fieldErrors: undefined,
      })
    ).toEqual({ pending: true, error: null });
  });

  it('normalizes non-Error query failures', () => {
    expect(labelReadState(false, 'failed').error?.message).toBe('failed');
    expect(labelReadState(false, failure).error).toBe(failure);
    expect(labelReadState(false, undefined)).toEqual(ready);
  });
});
