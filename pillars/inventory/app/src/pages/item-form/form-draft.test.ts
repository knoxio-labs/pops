import { describe, expect, it } from 'vitest';

import { draftFieldEntries, draftFieldPatches } from './field-values';
import { blankDraft, draftAfterSaveAndNew, draftReducer } from './form-draft';

import type { FormTypeDef } from './field-model';

const cable: FormTypeDef = {
  id: 'cable',
  key: 'cable',
  label: 'Cable',
  description: null,
  containment: false,
  fields: [
    {
      id: 'colour-id',
      key: 'colour',
      label: 'Colour',
      kind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      allowOverride: false,
      help: null,
      fixedUnit: null,
      enumOptions: [],
      referenceKinds: [],
      referenceTypeIds: [],
      expression: null,
    },
  ],
};

describe('item form draft', () => {
  it('starts a create draft in hand with no type and quantity one', () => {
    expect(blankDraft()).toMatchObject({
      mode: 'create',
      typeId: null,
      quantity: '1',
      placement: { kind: 'in-hand' },
    });
  });

  it('forces container quantity to one while preserving other draft work', () => {
    const draft = draftReducer(
      { ...blankDraft(), name: 'Shelf', quantity: '4' },
      { type: 'type', typeId: 'container', containment: true }
    );
    expect(draft).toMatchObject({ name: 'Shelf', typeId: 'container', quantity: '1' });
  });

  it('keeps type and placement but clears identity for save and start another', () => {
    const draft = draftReducer(blankDraft({ kind: 'location', locationId: 'garage' }), {
      type: 'name',
      value: 'Cable',
    });
    const next = draftAfterSaveAndNew({ ...draft, typeId: 'cable', quantity: '3' });
    expect(next).toMatchObject({
      name: '',
      typeId: 'cable',
      quantity: '1',
      placement: { kind: 'location', locationId: 'garage' },
    });
    expect(next.code.value).toBe('');
  });

  it('writes stable field ids and ignores values left from another type', () => {
    const draft = draftReducer(
      draftReducer(blankDraft(), { type: 'field-text', fieldId: 'colour-id', values: ['red'] }),
      { type: 'field-text', fieldId: 'old-field-id', values: ['stale'] }
    );

    expect(draftFieldEntries(draft, cable)).toEqual([{ fieldId: 'colour-id', values: ['red'] }]);
  });

  it('emits a null stable patch when an existing field is cleared', () => {
    const initial = draftReducer(blankDraft(), {
      type: 'field-text',
      fieldId: 'colour-id',
      values: ['red'],
    });
    const draft = draftReducer(initial, {
      type: 'field-text',
      fieldId: 'colour-id',
      values: [''],
    });

    expect(draftFieldPatches(draft, initial, cable)).toEqual([
      { fieldId: 'colour-id', values: null },
    ]);
  });
});
