import { describe, expect, it } from 'vitest';

import { defineType, typeFieldsSchema, TypeDefinitionError } from '../define-type.js';

describe('defineType', () => {
  it('accepts a well-formed type', () => {
    const type = defineType({
      key: 'gadget',
      name: 'Gadget',
      fields: [{ key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Blue'] }],
    });
    expect(type.key).toBe('gadget');
    expect(type.capabilities).toEqual([]);
    expect(type.legacyLabels).toEqual([]);
  });

  it('rejects an empty type key', () => {
    expect(() => defineType({ key: '  ', name: 'Nameless', fields: [] })).toThrow(
      TypeDefinitionError
    );
  });

  it('rejects a choice field with no choices', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Colour', label: 'Colour', kind: 'choice' }],
      })
    ).toThrow(/needs a non-empty `choices`/);
  });

  it('rejects a choice field with a duplicate choice', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Colour', label: 'Colour', kind: 'choice', choices: ['Red', 'Red'] }],
      })
    ).toThrow(/duplicate choice/);
  });

  it('rejects a non-choice field that declares choices', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Name', label: 'Name', kind: 'text', choices: ['Red'] }],
      })
    ).toThrow(/must not declare `choices`/);
  });

  it('rejects a measurement field with no dimension', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Weight', label: 'Weight', kind: 'measurement', unit: 'kg' }],
      })
    ).toThrow(/needs a `dimension`/);
  });

  it('rejects a measurement field with no default unit', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass' }],
      })
    ).toThrow(/needs a default `unit`/);
  });

  it('rejects a measurement field whose unit does not belong to its dimension', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [
          { key: 'Weight', label: 'Weight', kind: 'measurement', dimension: 'mass', unit: 'm' },
        ],
      })
    ).toThrow(/does not belong to dimension/);
  });

  it('rejects a text field that declares a dimension', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [{ key: 'Note', label: 'Note', kind: 'text', dimension: 'mass' }],
      })
    ).toThrow(/must not declare `dimension` or `unit`/);
  });

  it('rejects two fields with the same key differing only in case', () => {
    expect(() =>
      defineType({
        key: 'gadget',
        name: 'Gadget',
        fields: [
          { key: 'Colour', label: 'Colour', kind: 'text' },
          { key: 'colour', label: 'Colour again', kind: 'text' },
        ],
      })
    ).toThrow(/declared more than once/);
  });
});

describe('typeFieldsSchema', () => {
  const bulb = defineType({
    key: 'bulb',
    name: 'Light bulb',
    fields: [
      {
        key: 'Fitting',
        label: 'Fitting',
        kind: 'choice',
        choices: ['E27', 'GU10', 'B22'],
        required: true,
      },
      { key: 'Dimmable', label: 'Dimmable', kind: 'flag' },
    ],
  });

  it('accepts a value for every declared field', () => {
    const schema = typeFieldsSchema(bulb);
    expect(schema.safeParse({ Fitting: 'E27', Dimmable: true }).success).toBe(true);
  });

  it('does not require an optional field', () => {
    const schema = typeFieldsSchema(bulb);
    expect(schema.safeParse({ Fitting: 'E27' }).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const schema = typeFieldsSchema(bulb);
    expect(schema.safeParse({ Dimmable: true }).success).toBe(false);
  });

  it('rejects a key the type does not declare', () => {
    const schema = typeFieldsSchema(bulb);
    expect(schema.safeParse({ Fitting: 'E27', Wattage: 9 }).success).toBe(false);
  });

  it('rejects a choice outside the field list', () => {
    const schema = typeFieldsSchema(bulb);
    expect(schema.safeParse({ Fitting: 'E14' }).success).toBe(false);
  });
});
