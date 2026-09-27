import { describe, expect, it } from 'vitest';

import { blankDraft } from './form-draft';
import { deriveForm, hasStagedWork } from './form-view';

import type { FormTypeDef } from './field-model';

const cable: FormTypeDef = {
  id: 'cable',
  key: 'cable',
  label: 'Cable',
  description: null,
  containment: false,
  fields: [
    {
      id: 'colour',
      key: 'colour',
      label: 'Colour',
      kind: 'short_text',
      cardinality: 'one',
      required: true,
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

describe('item form view', () => {
  it('requires only a name and does not require catalogue fields', () => {
    const draft = { ...blankDraft(), typeId: 'cable' };
    const emptyName = deriveForm(draft, [cable]);
    expect(emptyName.blockers).toContain('Name is required.');
    expect(emptyName.blockers).not.toContain('Colour is required.');

    const named = deriveForm({ ...draft, name: 'Cable' }, [cable]);
    expect(named.blockers).toEqual([]);
  });

  it('hides quantity errors for container types', () => {
    const container = { ...cable, id: 'box', containment: true };
    const view = deriveForm(
      { ...blankDraft(), name: 'Box', typeId: 'box', quantity: 'not a number' },
      [container]
    );
    expect(view.showQuantity).toBe(false);
    expect(view.quantityError).toBeNull();
    expect(view.blockers).toEqual([]);
  });

  it('reports invalid typed values as field errors and save blockers', () => {
    const baseField = cable.fields.at(0);
    if (baseField === undefined) throw new Error('expected cable field fixture');
    const numeric = {
      ...cable,
      id: 'numeric',
      fields: [
        { ...baseField, id: 'count', key: 'count', label: 'Count', kind: 'integer' as const },
      ],
    };
    const view = deriveForm(
      {
        ...blankDraft(),
        name: 'Item',
        typeId: 'numeric',
        fields: { text: { count: ['not a number'] }, refs: {}, booleans: {} },
      },
      [numeric]
    );
    expect(view.fieldErrors.count).toBe('Count needs a whole number.');
    expect(view.blockers).toContain('Count needs a whole number.');
  });

  it('detects staged edits and treats an unchanged draft as clean', () => {
    const initial = blankDraft();
    expect(hasStagedWork(initial, initial)).toBe(false);
    expect(hasStagedWork({ ...initial, name: 'Cable' }, initial)).toBe(true);
    expect(
      hasStagedWork(
        {
          ...initial,
          fields: { text: { colour: [''] }, refs: {}, booleans: {} },
        },
        initial
      )
    ).toBe(false);
  });
});
