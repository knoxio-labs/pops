import { describe, expect, it } from 'vitest';

import { testField, testType } from '../type-tree-test-utils';
import { expressionContext } from './wire';

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
