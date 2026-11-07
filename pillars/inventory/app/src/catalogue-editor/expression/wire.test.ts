import { describe, expect, it } from 'vitest';

import { testField, testType } from '../type-tree-test-utils';
import { expressionContext, fromWire, toWire } from './wire';

import type { CatalogueField } from '../types';

describe('expressionContext with parent types', () => {
  it('offers inherited fields on a subtype and expands reference type restrictions', () => {
    const types = [
      testType('bedding', 'Bedding', null, {
        fields: [
          testField('material', 'bedding', 'material', { label: 'Material' }),
          testField('related', 'bedding', 'related', {
            kind: 'reference',
            referenceKinds: ['item'],
            referenceTypeIds: ['bedding'],
          }),
        ],
      }),
      testType('sheet', 'Sheet', 'bedding', {
        fields: [testField('area', 'sheet', 'area', { kind: 'decimal', label: 'Area' })],
      }),
      testType('pillowcase', 'Pillowcase', 'sheet'),
    ];

    const context = expressionContext(types, 'sheet', 'area');
    const sheet = context.types.find((type) => type.id === 'sheet');
    const bedding = context.types.find((type) => type.id === 'bedding');
    if (sheet === undefined || bedding === undefined) throw new Error('fixture');

    expect(sheet.fields.map((field) => field.id)).toEqual(['material', 'related']);
    expect(bedding.fields.find((field) => field.id === 'related')?.reference?.typeIds).toEqual([
      'bedding',
      'sheet',
      'pillowcase',
    ]);
  });
});

describe('assembly reads on the wire', () => {
  it('round-trips an assembly read', () => {
    const node = { op: 'assembly_read', fieldId: 'availability' } as const;

    expect(toWire(node)).toEqual({ op: 'assembly_read', fieldId: 'availability' });
    expect(fromWire(toWire(node))).toEqual(node);
  });

  it('keeps an assembly read nested in a coalesce through the round trip', () => {
    const node = {
      op: 'coalesce',
      values: [
        { op: 'read', path: [], fieldId: 'own' },
        { op: 'assembly_read', fieldId: 'availability' },
      ],
    } as const;

    expect(fromWire(toWire(node))).toEqual(node);
  });
});

describe('expressionContext assembly fields', () => {
  const availability = (typeId: string, overrides = {}) =>
    testField('availability', typeId, 'availability', {
      kind: 'enum',
      label: 'Availability',
      storage: 'computed',
      ...overrides,
    });
  const colour = (typeId: string) => testField('colour', typeId, 'colour', { label: 'Colour' });

  function withParts(
    id: string,
    label: string,
    parent: string | null,
    fields: CatalogueField[] = []
  ) {
    return { ...testType(id, label, parent, { fields }), capabilities: ['parts'] };
  }

  it('offers the fields every parts-capable type has, including the one being edited', () => {
    const types = [
      testType('thing', 'Thing', null, {
        fields: [availability('thing'), colour('thing')],
      }),
      withParts('kit', 'Kit', 'thing'),
      withParts('machine', 'Machine', 'thing', [
        testField('weight', 'machine', 'weight', { label: 'Weight' }),
      ]),
      testType('spare', 'Spare', 'thing'),
    ];

    const context = expressionContext(types, 'spare', 'availability');

    expect(context.assemblyFields?.map((field) => field.id)).toEqual(['availability', 'colour']);
    expect(
      context.types.find((type) => type.id === 'spare')?.fields.map((field) => field.id)
    ).toEqual(['colour']);
  });

  it('drops a field the parts-capable types do not agree on', () => {
    const types = [
      withParts('kit', 'Kit', null, [availability('kit'), colour('kit')]),
      withParts('machine', 'Machine', null, [
        availability('machine', { kind: 'short_text' }),
        colour('machine'),
      ]),
    ];

    const context = expressionContext(types, 'kit', undefined);

    expect(context.assemblyFields?.map((field) => field.id)).toEqual(['colour']);
  });

  it('offers nothing when no type grants parts', () => {
    const types = [testType('thing', 'Thing', null, { fields: [colour('thing')] })];

    expect(expressionContext(types, 'thing', undefined).assemblyFields).toEqual([]);
  });
});
