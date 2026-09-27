import { describe, expect, it } from 'vitest';

import { atomError, fieldError, referenceError } from './field-rules';
import { draftCreateFieldValues, draftFieldEntries, draftFieldPatches } from './field-values';
import { blankDraft } from './form-draft';

import type { FormFieldDef, FormTypeDef } from './field-model';

function field(
  id: string,
  kind: FormFieldDef['kind'],
  overrides: Partial<FormFieldDef> = {}
): FormFieldDef {
  return {
    id,
    key: id,
    label: id,
    kind,
    cardinality: 'one',
    required: false,
    storage: 'stored',
    allowOverride: false,
    help: null,
    fixedUnit: kind === 'measurement' ? 'kg' : null,
    enumOptions:
      kind === 'enum' ? [{ id: 'option-red', key: 'red', label: 'Red', archivedAt: null }] : [],
    referenceKinds: kind === 'reference' ? ['item'] : [],
    referenceTypeIds: [],
    expression: null,
    ...overrides,
  };
}

function typeWith(...fields: FormFieldDef[]): FormTypeDef {
  return {
    id: 'typed',
    key: 'typed',
    label: 'Typed',
    description: null,
    containment: false,
    fields,
  };
}

describe('item form field rules', () => {
  it('validates every scalar catalogue kind and rejects malformed values', () => {
    expect(atomError(field('short', 'short_text'), 'ok')).toBeNull();
    expect(atomError(field('short', 'short_text'), 'x'.repeat(201))).toContain('200');
    expect(atomError(field('long', 'long_text'), 'x'.repeat(20_001))).toContain('20,000');
    expect(atomError(field('integer', 'integer'), '12')).toBeNull();
    expect(atomError(field('integer', 'integer'), '9007199254740992')).toContain('large');
    expect(atomError(field('decimal', 'decimal'), '12.50')).toBeNull();
    expect(atomError(field('decimal', 'decimal'), '01.5')).toContain('number');
    expect(atomError(field('measurement', 'measurement'), '12.50')).toBeNull();
    expect(atomError(field('date', 'date'), '2026-02-29')).toContain('real date');
    expect(atomError(field('date_time', 'date_time'), '2026-01-02T03:04')).toBeNull();
    expect(atomError(field('url', 'url'), 'http://example.test')).toContain('https://');
    expect(atomError(field('enum', 'enum'), 'missing')).toContain('no option');
    expect(atomError(field('boolean', 'boolean'), 'false')).toBeNull();
    expect(atomError(field('boolean', 'boolean'), 'yes')).toContain("'true' or 'false'");
  });

  it('reports cardinality and invalid reference selections', () => {
    const single = field('name', 'short_text');
    expect(fieldError(single, ['one', 'two'])).toContain('one value');
    const reference = field('parent', 'reference', {
      referenceKinds: ['item'],
      referenceTypeIds: ['type-cable'],
    });
    expect(
      referenceError(reference, [{ id: 'place-1', kind: 'location' as const, label: 'Place' }])
    ).toContain('places');
    expect(
      referenceError(reference, [
        { id: 'item-1', kind: 'item' as const, label: 'Item', typeId: 'type-lamp' },
      ])
    ).toContain('item type');
  });
});

describe('item form stable value mapping', () => {
  it('maps catalogue kinds, references, enums and computed overrides to the save contract', () => {
    const fields = typeWith(
      field('title', 'short_text'),
      field('count', 'integer'),
      field('price', 'decimal'),
      field('enabled', 'boolean'),
      field('colour', 'enum'),
      field('weight', 'measurement'),
      field('purchased', 'date'),
      field('registered', 'date_time'),
      field('url', 'url'),
      field('related', 'reference'),
      field('computed', 'decimal', { storage: 'computed', allowOverride: true })
    );
    const dateTime = '2026-01-02T03:04';
    const draft = {
      ...blankDraft(),
      fields: {
        text: {
          title: ['Lamp'],
          count: ['3'],
          price: ['12.50'],
          colour: ['option-red'],
          weight: ['1.25'],
          purchased: ['2026-01-02'],
          registered: [dateTime],
          url: ['https://example.test/lamp'],
        },
        refs: { related: [{ id: 'item-1', kind: 'item' as const, label: 'Lamp' }] },
        booleans: { enabled: false },
      },
      overrides: { computed: '19.99' },
    };

    expect(draftFieldEntries(draft, fields)).toEqual([
      { fieldId: 'title', values: ['Lamp'] },
      { fieldId: 'count', values: [3] },
      { fieldId: 'price', values: ['12.50'] },
      { fieldId: 'enabled', values: [false] },
      { fieldId: 'colour', values: [{ optionId: 'option-red' }] },
      { fieldId: 'weight', values: [{ amount: '1.25', unit: 'kg' }] },
      { fieldId: 'purchased', values: ['2026-01-02'] },
      { fieldId: 'registered', values: [new Date(dateTime).toISOString()] },
      { fieldId: 'url', values: ['https://example.test/lamp'] },
      { fieldId: 'related', values: [{ targetId: 'item-1', targetKind: 'item' }] },
    ]);
    expect(draftCreateFieldValues(draft, fields).at(-1)).toEqual({
      fieldId: 'computed',
      source: 'override',
      values: ['19.99'],
    });
  });

  it('emits a clear patch only for changed stored values', () => {
    const text = field('title', 'short_text');
    const type = typeWith(text);
    const initial = {
      ...blankDraft(),
      fields: { text: { title: ['Lamp'] }, refs: {}, booleans: {} },
    };
    const draft = { ...initial, fields: { text: { title: [''] }, refs: {}, booleans: {} } };
    expect(draftFieldPatches(draft, initial, type)).toEqual([{ fieldId: 'title', values: null }]);
  });
});
