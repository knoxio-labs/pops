import { describe, expect, it } from 'vitest';

import { evaluateExpression } from '../expression-evaluator.js';
import { validateCatalogueExpressions } from '../expression-validator.js';
import {
  expressionCatalogue,
  expressionField,
  expressionSnapshot,
  expressionType,
} from './expression-test-fixtures.js';

import type { SnapshotFieldValue } from '../expression-types.js';

function read(fieldId: string, path: readonly string[] = []) {
  return { op: 'read', path, fieldId };
}

function lit(value: unknown) {
  return { op: 'literal', value };
}

function equal(left: unknown, right: unknown) {
  return { op: 'equal', left, right };
}

const rootFields = [
  expressionField({ id: 'price', key: 'price', kind: 'decimal' }),
  expressionField({ id: 'code', key: 'code', kind: 'short_text' }),
  expressionField({
    id: 'part',
    key: 'part',
    kind: 'reference',
    referenceKinds: new Set(['item']),
    referenceTypeIds: new Set(['part']),
  }),
];
const partType = expressionType('part', [
  expressionField({ id: 'weight', key: 'weight', kind: 'decimal', typeId: 'part' }),
]);

function validate(expression: unknown, expressionVersion: number) {
  const result = expressionField({
    expressionJson: JSON.stringify(expression),
    expressionVersion,
    id: 'result',
    key: 'result',
    kind: 'boolean',
    storage: 'computed',
  });
  const [validated] = validateCatalogueExpressions(
    expressionCatalogue([expressionType('type', [...rootFields, result]), partType])
  );
  if (validated === undefined) throw new Error('no expression validated');
  return validated;
}

const snapshot = expressionSnapshot(
  new Map([
    [
      'root',
      {
        state: 'resolved',
        item: {
          id: 'root',
          revision: 1,
          fields: new Map<string, SnapshotFieldValue>([
            ['price', { state: 'value', value: '1.50', revision: 1 }],
            ['code', { state: 'value', value: '3.0', revision: 1 }],
            ['part', { state: 'value', value: { targetKind: 'item', targetId: 'p' }, revision: 1 }],
          ]),
        },
      },
    ],
    [
      'p',
      {
        state: 'resolved',
        item: {
          id: 'p',
          revision: 1,
          fields: new Map<string, SnapshotFieldValue>([
            ['weight', { state: 'value', value: '2.00', revision: 1 }],
          ]),
        },
      },
    ],
  ])
);

function evaluated(expression: unknown, expressionVersion: number) {
  return evaluateExpression(validate(expression, expressionVersion), snapshot);
}

describe('version-2 decimal equality', () => {
  const doubled = equal({ op: 'multiply', left: read('price'), right: lit('2') }, lit('3'));

  it('compares a decimal product by value: 1.50 × 2 = 3', () => {
    expect(evaluated(doubled, 2)).toMatchObject({ state: 'value', value: true });
  });

  it('keeps version 1 comparing the product by spelling', () => {
    expect(evaluated(doubled, 1)).toMatchObject({ state: 'value', value: false });
  });

  it('types a read by its catalogue field, across a reference', () => {
    expect(evaluated(equal(read('weight', ['part']), lit('2')), 2)).toMatchObject({
      state: 'value',
      value: true,
    });
    expect(evaluated(equal(lit('1.5'), read('price')), 2)).toMatchObject({ value: true });
  });

  it('compares text by spelling even when it reads as a number', () => {
    expect(evaluated(equal(read('code'), lit('3')), 2)).toMatchObject({
      state: 'value',
      value: false,
    });
  });

  it('keeps less_than numeric in both versions', () => {
    const less = { op: 'less_than', left: read('price'), right: lit('1.5') };
    expect(evaluated(less, 1)).toMatchObject({ value: false });
    expect(evaluated(less, 2)).toMatchObject({ value: false });
  });

  it('cannot represent negative zero: the literal is not a canonical decimal', () => {
    expect(() => validate(equal(lit('-0'), read('price')), 2)).toThrow(
      expect.objectContaining({ code: 'expression_literal_invalid' })
    );
  });
});
