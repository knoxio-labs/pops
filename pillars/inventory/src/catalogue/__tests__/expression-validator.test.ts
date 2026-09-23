import { describe, expect, it } from 'vitest';

import { buildExpressionDependencyGraph } from '../expression-dependencies.js';
import { validateCatalogueExpressions } from '../expression-validator.js';
import {
  expressionCatalogue,
  expressionField,
  expressionType,
} from './expression-test-fixtures.js';

function computed(id: string, expression: unknown, typeId = 'type') {
  return expressionField({
    expressionJson: JSON.stringify(expression),
    expressionVersion: 1,
    id,
    key: id,
    label: id,
    storage: 'computed',
    typeId,
  });
}

function read(fieldId: string, path: readonly string[] = []) {
  return { op: 'read', path, fieldId };
}

describe('validateCatalogueExpressions', () => {
  it('type-checks arithmetic and returns deterministic declared dependencies', () => {
    const fields = [
      expressionField({ id: 'count', key: 'count', kind: 'decimal' }),
      expressionField({ id: 'price', key: 'price', kind: 'decimal' }),
      computed('total', { op: 'multiply', left: read('count'), right: read('price') }),
    ];
    const [expression] = validateCatalogueExpressions(
      expressionCatalogue([expressionType('type', fields)])
    );

    expect(expression?.dependencies).toEqual([
      { typeId: 'type', fieldId: 'count', via: [] },
      { typeId: 'type', fieldId: 'price', via: [] },
    ]);
    expect(expression?.resultType).toEqual({ kind: 'decimal', fixedUnit: null });
  });

  it('resolves two reference hops across every allowed target type', () => {
    const rootReference = expressionField({
      id: 'owner',
      key: 'owner',
      kind: 'reference',
      referenceKinds: new Set(['item']),
      referenceTypeIds: new Set(['middle']),
    });
    const middleReference = expressionField({
      id: 'next',
      key: 'next',
      kind: 'reference',
      referenceKinds: new Set(['item']),
      referenceTypeIds: new Set(['target-a', 'target-b']),
      typeId: 'middle',
    });
    const root = expressionType('root', [
      rootReference,
      computed('result', read('amount', ['owner', 'next']), 'root'),
    ]);
    const middle = expressionType('middle', [middleReference]);
    const targetA = expressionType('target-a', [
      expressionField({ id: 'amount', key: 'amount', typeId: 'target-a' }),
    ]);
    const targetB = expressionType('target-b', [
      expressionField({ id: 'amount', key: 'amount', typeId: 'target-b' }),
    ]);

    const [expression] = validateCatalogueExpressions(
      expressionCatalogue([root, middle, targetA, targetB])
    );
    expect(expression?.dependencies).toHaveLength(4);
    expect(expression?.dependencies).toContainEqual({
      typeId: 'target-b',
      fieldId: 'amount',
      via: ['owner', 'next'],
    });
  });

  it('rejects mixed item/location traversal and mismatched result types', () => {
    const mixed = expressionField({
      id: 'target',
      key: 'target',
      kind: 'reference',
      referenceKinds: new Set(['item', 'location']),
    });
    expect(() =>
      validateCatalogueExpressions(
        expressionCatalogue([
          expressionType('type', [mixed, computed('result', read('amount', ['target']))]),
        ])
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_path_not_item_reference' }));

    expect(() =>
      validateCatalogueExpressions(
        expressionCatalogue([
          expressionType('type', [computed('result', { op: 'literal', value: true })]),
        ])
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_literal_type_mismatch' }));
  });

  it('rejects non-canonical primitive literals before evaluation', () => {
    const invalidDate = {
      ...computed('when', { op: 'literal', value: '2026-02-30' }),
      kind: 'date' as const,
    };
    expect(() =>
      validateCatalogueExpressions(expressionCatalogue([expressionType('type', [invalidDate])]))
    ).toThrowError(expect.objectContaining({ code: 'expression_literal_type_mismatch' }));

    expect(() =>
      validateCatalogueExpressions(
        expressionCatalogue([
          expressionType('type', [
            computed('total', { op: 'literal', value: '1234567890123456789' }),
          ]),
        ])
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_literal_type_mismatch' }));
  });

  it('rejects direct, transitive and reference-mediated cycles', () => {
    const direct = expressionCatalogue([expressionType('type', [computed('self', read('self'))])]);
    expect(() => validateCatalogueExpressions(direct)).toThrowError(
      expect.objectContaining({ code: 'expression_cycle' })
    );

    const transitive = expressionCatalogue([
      expressionType('type', [computed('a', read('b')), computed('b', read('a'))]),
    ]);
    expect(() => validateCatalogueExpressions(transitive)).toThrowError(
      expect.objectContaining({ code: 'expression_cycle' })
    );

    const reference = expressionField({
      id: 'peer',
      key: 'peer',
      kind: 'reference',
      referenceKinds: new Set(['item']),
      referenceTypeIds: new Set(['type']),
    });
    const mediated = expressionCatalogue([
      expressionType('type', [reference, computed('amount', read('amount', ['peer']))]),
    ]);
    expect(() => validateCatalogueExpressions(mediated)).toThrowError(
      expect.objectContaining({ code: 'expression_cycle' })
    );
  });

  it('rejects more than 32 declared dependencies', () => {
    const stored = Array.from({ length: 33 }, (_, index) =>
      expressionField({ id: `field-${index}`, key: `field-${index}` })
    );
    const sum = stored
      .map((field) => read(field.id))
      .reduce<unknown>((left, right) => ({ op: 'add', left, right }), {
        op: 'literal',
        value: '0',
      });
    expect(() =>
      validateCatalogueExpressions(
        expressionCatalogue([expressionType('type', [...stored, computed('total', sum)])])
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_dependencies_exceeded' }));
  });

  it('exposes a graph edge for every possible computed dependency', () => {
    const expressions = validateCatalogueExpressions(
      expressionCatalogue([
        expressionType('type', [
          expressionField({ id: 'stored', key: 'stored' }),
          computed('first', read('stored')),
          computed('second', read('first')),
        ]),
      ])
    );
    expect(buildExpressionDependencyGraph(expressions).get('type:second')).toEqual(
      new Set(['type:first'])
    );
  });
});
