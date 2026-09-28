import { describe, expect, it } from 'vitest';

import { testField, testType } from '../../catalogue-editor/type-tree-test-utils';
import { buildWorld } from '../../foundation/model/placement-model';
import { formTypesOf } from './field-model';
import { draftFieldEntries } from './field-values';
import { blankDraft } from './form-draft';
import { fieldDraftsFromStableValues } from './form-opening';
import { deriveForm } from './form-view';

describe('effective item form types', () => {
  const inherited = testField('field-size', 'type-bedding', 'size', {
    kind: 'integer',
    label: 'Size',
  });
  const local = testField('field-fitted', 'type-sheet', 'fitted', {
    kind: 'boolean',
    label: 'Fitted',
  });
  const parent = {
    ...testType('type-bedding', 'Bedding', null, { fields: [inherited] }),
    capabilities: ['containment'],
  };
  const child = testType('type-sheet', 'Sheet', 'type-bedding', { fields: [local] });
  const types = formTypesOf({ types: [parent, child] });
  const sheet = types.find((type) => type.id === child.id);

  it('keeps inherited fields before local fields and inherits capabilities', () => {
    expect(sheet?.fields.map((field) => field.id)).toEqual([inherited.id, local.id]);
    expect(sheet?.containment).toBe(true);
  });

  it('uses inherited fields for validation, loading, and save serialization', () => {
    if (sheet === undefined) throw new Error('expected Sheet form type');
    const invalid = deriveForm(
      {
        ...blankDraft({ kind: 'in-hand' }, sheet.id),
        name: 'Guest fitted sheet',
        fields: { text: { [inherited.id]: ['large'] }, refs: {}, booleans: {} },
      },
      types
    );
    expect(invalid.fieldErrors).toEqual({ [inherited.id]: 'Size needs a whole number.' });

    const world = buildWorld([], []);
    const loaded = fieldDraftsFromStableValues(
      [
        { fieldId: inherited.id, values: [42] },
        { fieldId: local.id, values: [true] },
      ],
      sheet,
      world
    );
    expect(loaded).toEqual({
      text: { [inherited.id]: ['42'] },
      refs: {},
      booleans: { [local.id]: true },
    });

    const entries = draftFieldEntries(
      {
        ...blankDraft({ kind: 'in-hand' }, sheet.id),
        fields: loaded,
      },
      sheet
    );
    expect(entries).toEqual([
      { fieldId: inherited.id, values: [42] },
      { fieldId: local.id, values: [true] },
    ]);
  });
});
