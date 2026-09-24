import { describe, expect, it, vi } from 'vitest';

import { evaluateComputedValue } from '../computed-values.js';
import { evaluateExpression } from '../expression-evaluator.js';
import { ExpressionValidationError } from '../expression-types.js';
import { expressionSnapshot, validatedExpression } from './expression-test-fixtures.js';

import type { ExpressionSnapshotItem, SnapshotFieldValue } from '../expression-types.js';
import type { PrimitiveWireValue } from '../value-types.js';

function value(value: PrimitiveWireValue, revision = 1): SnapshotFieldValue {
  return { state: 'value', value, revision };
}

function item(id: string, fields: ReadonlyMap<string, SnapshotFieldValue>): ExpressionSnapshotItem {
  return { id, fields, revision: 1 };
}

function binary(
  op: 'add' | 'subtract' | 'multiply' | 'divide',
  left: PrimitiveWireValue,
  right: PrimitiveWireValue
) {
  return validatedExpression(
    {
      op,
      left: { op: 'literal', value: left },
      right: { op: 'literal', value: right },
    },
    { kind: typeof left === 'number' ? 'integer' : 'decimal', fixedUnit: null }
  );
}

const emptySnapshot = expressionSnapshot(
  new Map([['root', { state: 'resolved', item: item('root', new Map()) }]])
);

describe('evaluateExpression', () => {
  it('evaluates integer and decimal arithmetic without binary floating point', () => {
    expect(evaluateExpression(binary('add', '12.340', '0.660'), emptySnapshot)).toMatchObject({
      state: 'value',
      value: '13.000',
    });
    expect(evaluateExpression(binary('multiply', '2.00', '3.0'), emptySnapshot)).toMatchObject({
      state: 'value',
      value: '6.000',
    });
    expect(evaluateExpression(binary('divide', '1.00', '4.0'), emptySnapshot)).toMatchObject({
      state: 'value',
      value: '0.25',
    });
    expect(evaluateExpression(binary('divide', 12, 3), emptySnapshot)).toMatchObject({
      state: 'value',
      value: 4,
    });
  });

  it('reports division, precision and integer overflow as evaluation errors', () => {
    expect(evaluateExpression(binary('divide', '1', '0'), emptySnapshot)).toMatchObject({
      state: 'error',
      code: 'division_by_zero',
    });
    expect(evaluateExpression(binary('divide', '1', '3'), emptySnapshot)).toMatchObject({
      state: 'error',
      code: 'precision_overflow',
    });
    expect(
      evaluateExpression(binary('multiply', Number.MAX_SAFE_INTEGER, 2), emptySnapshot)
    ).toMatchObject({
      state: 'error',
      code: 'integer_overflow',
    });
  });

  it('rejects a runtime result outside the computed field primitive bounds', () => {
    const expression = validatedExpression({
      op: 'concat',
      left: { op: 'literal', value: 'a'.repeat(150) },
      right: { op: 'literal', value: 'b'.repeat(100) },
    });
    const shortTextExpression = {
      ...expression,
      resultType: { kind: 'short_text' as const, fixedUnit: null },
    };
    expect(evaluateExpression(shortTextExpression, emptySnapshot)).toMatchObject({
      state: 'error',
      code: 'invalid_value',
    });
  });

  it('short-circuits boolean nodes and only evaluates the selected branch', () => {
    const missingRead = { op: 'read' as const, path: [], fieldId: 'missing' };
    const and = validatedExpression(
      {
        op: 'and',
        left: { op: 'literal', value: false },
        right: missingRead,
      },
      { kind: 'boolean', fixedUnit: null }
    );
    const conditional = validatedExpression(
      {
        op: 'if',
        condition: { op: 'literal', value: true },
        thenBranch: { op: 'literal', value: 'selected' },
        elseBranch: missingRead,
      },
      { kind: 'short_text', fixedUnit: null }
    );

    expect(evaluateExpression(and, emptySnapshot)).toEqual({
      state: 'value',
      value: false,
      dependencies: [],
    });
    expect(evaluateExpression(conditional, emptySnapshot)).toMatchObject({
      state: 'value',
      value: 'selected',
    });
  });

  it('compares ordered values with less_than and structural values with equal', () => {
    const lessThan = validatedExpression(
      { op: 'less_than', left: { op: 'literal', value: 3 }, right: { op: 'literal', value: 5 } },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(lessThan, emptySnapshot)).toMatchObject({
      state: 'value',
      value: true,
    });

    const notLessThan = validatedExpression(
      { op: 'less_than', left: { op: 'literal', value: 5 }, right: { op: 'literal', value: 5 } },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(notLessThan, emptySnapshot)).toMatchObject({
      state: 'value',
      value: false,
    });

    const equalNumbers = validatedExpression(
      { op: 'equal', left: { op: 'literal', value: 4 }, right: { op: 'literal', value: 4 } },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(equalNumbers, emptySnapshot)).toMatchObject({
      state: 'value',
      value: true,
    });

    const equalEnums = validatedExpression(
      {
        op: 'equal',
        left: { op: 'literal', value: { optionId: 'a' } },
        right: { op: 'literal', value: { optionId: 'a' } },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(equalEnums, emptySnapshot)).toMatchObject({
      state: 'value',
      value: true,
    });

    const equalDifferentEnums = validatedExpression(
      {
        op: 'equal',
        left: { op: 'literal', value: { optionId: 'a' } },
        right: { op: 'literal', value: { optionId: 'b' } },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(equalDifferentEnums, emptySnapshot)).toMatchObject({
      state: 'value',
      value: false,
    });

    const equalDifferentReferences = validatedExpression(
      {
        op: 'equal',
        left: { op: 'literal', value: { targetKind: 'item', targetId: 'a' } },
        right: { op: 'literal', value: { targetKind: 'item', targetId: 'b' } },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(equalDifferentReferences, emptySnapshot)).toMatchObject({
      state: 'value',
      value: false,
    });

    const equalMismatchedShapes = validatedExpression(
      {
        op: 'equal',
        left: { op: 'literal', value: { amount: '1.0', unit: 'kg' } },
        right: { op: 'literal', value: { optionId: 'a' } },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(equalMismatchedShapes, emptySnapshot)).toMatchObject({
      state: 'value',
      value: false,
    });
  });

  it('evaluates or, not and negate, and the valid path of concat', () => {
    const or = validatedExpression(
      {
        op: 'or',
        left: { op: 'literal', value: false },
        right: { op: 'literal', value: true },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(or, emptySnapshot)).toEqual({
      state: 'value',
      value: true,
      dependencies: [],
    });

    const orShortCircuit = validatedExpression(
      {
        op: 'or',
        left: { op: 'literal', value: true },
        right: { op: 'read', path: [], fieldId: 'missing' },
      },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(orShortCircuit, emptySnapshot)).toEqual({
      state: 'value',
      value: true,
      dependencies: [],
    });

    const not = validatedExpression(
      { op: 'not', value: { op: 'literal', value: false } },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(not, emptySnapshot)).toMatchObject({
      state: 'value',
      value: true,
    });

    const notNonBoolean = validatedExpression(
      { op: 'not', value: { op: 'literal', value: '1.000' } },
      { kind: 'boolean', fixedUnit: null }
    );
    expect(evaluateExpression(notNonBoolean, emptySnapshot)).toMatchObject({
      state: 'error',
      code: 'invalid_value',
    });

    const negate = validatedExpression(
      { op: 'negate', value: { op: 'literal', value: '3.500' } },
      { kind: 'decimal', fixedUnit: null }
    );
    expect(evaluateExpression(negate, emptySnapshot)).toMatchObject({
      state: 'value',
      value: '-3.500',
    });

    const concat = validatedExpression(
      { op: 'concat', left: { op: 'literal', value: 'a' }, right: { op: 'literal', value: 'b' } },
      { kind: 'short_text', fixedUnit: null }
    );
    expect(evaluateExpression(concat, emptySnapshot)).toMatchObject({
      state: 'value',
      value: 'ab',
    });
  });

  it('retains dependencies evaluated before a selected branch becomes unavailable', () => {
    const root = item('root', new Map([['condition', value(true, 4)]]));
    const snapshot = expressionSnapshot(new Map([['root', { state: 'resolved', item: root }]]));
    const expression = validatedExpression({
      op: 'if',
      condition: { op: 'read', path: [], fieldId: 'condition' },
      thenBranch: { op: 'read', path: [], fieldId: 'missing' },
      elseBranch: { op: 'literal', value: 'unused' },
    });

    expect(evaluateExpression(expression, snapshot)).toEqual({
      state: 'unavailable',
      reason: 'missing_dependency',
      fieldId: 'missing',
      traversedItemIds: ['root'],
      missingInputs: [{ reason: 'missing_dependency', fieldId: 'missing', itemId: 'root' }],
      dependencies: [{ itemId: 'root', fieldId: 'condition', revision: 4 }],
    });
  });

  it('tracks traversed revisions and distinguishes unresolved reference states', () => {
    const root = item(
      'root',
      new Map([['peer', value({ targetKind: 'item', targetId: 'child' }, 7)]])
    );
    const expression = validatedExpression({ op: 'read', path: ['peer'], fieldId: 'amount' });
    const deleted = expressionSnapshot(
      new Map([
        ['root', { state: 'resolved', item: root }],
        ['child', { state: 'deleted' }],
      ])
    );

    expect(evaluateExpression(expression, deleted)).toEqual({
      state: 'unavailable',
      reason: 'reference_deleted',
      fieldId: 'amount',
      traversedItemIds: ['root', 'child'],
      missingInputs: [{ reason: 'reference_deleted', fieldId: 'amount', itemId: 'child' }],
      dependencies: [{ itemId: 'root', fieldId: 'peer', revision: 7 }],
    });
  });

  it('propagates a dependency unavailable reason unchanged', () => {
    const unavailable: SnapshotFieldValue = {
      state: 'unavailable',
      reason: 'reference_unresolved',
      fieldId: 'upstream',
      traversedItemIds: ['root', 'remote'],
      revision: 9,
      dependencies: [{ itemId: 'remote', fieldId: 'input', revision: 4 }],
    };
    const snapshot = expressionSnapshot(
      new Map([
        ['root', { state: 'resolved', item: item('root', new Map([['computed', unavailable]])) }],
      ])
    );
    expect(
      evaluateExpression(
        validatedExpression({ op: 'read', path: [], fieldId: 'computed' }),
        snapshot
      )
    ).toEqual({
      state: 'unavailable',
      reason: 'reference_unresolved',
      fieldId: 'upstream',
      traversedItemIds: ['root', 'remote'],
      missingInputs: [{ reason: 'reference_unresolved', fieldId: 'upstream', itemId: 'remote' }],
      dependencies: [
        { itemId: 'remote', fieldId: 'input', revision: 4 },
        { itemId: 'root', fieldId: 'computed', revision: 9 },
      ],
    });
  });

  it('retains transitive dependencies from a computed field read', () => {
    const computed: SnapshotFieldValue = {
      state: 'value',
      value: '8.000',
      revision: 9,
      dependencies: [{ itemId: 'remote', fieldId: 'input', revision: 4 }],
    };
    const snapshot = expressionSnapshot(
      new Map([
        ['root', { state: 'resolved', item: item('root', new Map([['computed', computed]])) }],
      ])
    );

    expect(
      evaluateExpression(
        validatedExpression({ op: 'read', path: [], fieldId: 'computed' }),
        snapshot
      )
    ).toEqual({
      state: 'value',
      value: '8.000',
      dependencies: [
        { itemId: 'remote', fieldId: 'input', revision: 4 },
        { itemId: 'root', fieldId: 'computed', revision: 9 },
      ],
    });
  });
});

describe('evaluateComputedValue', () => {
  it('returns an allowed override without reading dependencies', () => {
    const readItem = vi.fn(() => ({ state: 'missing' as const }));
    const readField = vi.fn();
    const effective = evaluateComputedValue({
      allowOverride: true,
      catalogueRevision: 12,
      expression: validatedExpression({ op: 'read', path: [], fieldId: 'missing' }),
      fieldId: 'total',
      override: { state: 'value', value: '50.000' },
      snapshot: { rootItemId: 'root', readItem, readField },
    });

    expect(effective).toEqual({
      state: 'value',
      values: ['50.000'],
      provenance: { source: 'override', catalogueRevision: 12 },
    });
    expect(readItem).not.toHaveBeenCalled();
    expect(readField).not.toHaveBeenCalled();
  });

  it('rejects a forbidden override and resumes computation when it is absent', () => {
    expect(() =>
      evaluateComputedValue({
        allowOverride: false,
        catalogueRevision: 12,
        expression: validatedExpression({ op: 'literal', value: '48.000' }),
        fieldId: 'total',
        override: { state: 'value', value: '50.000' },
        snapshot: emptySnapshot,
      })
    ).toThrowError(ExpressionValidationError);

    expect(
      evaluateComputedValue({
        allowOverride: true,
        catalogueRevision: 12,
        expression: validatedExpression({ op: 'literal', value: '48.000' }),
        fieldId: 'total',
        override: { state: 'absent' },
        snapshot: emptySnapshot,
      })
    ).toEqual({
      state: 'value',
      values: ['48.000'],
      provenance: { source: 'computed', catalogueRevision: 12, dependencies: [] },
    });
  });

  it('degrades arithmetic errors to unavailable evaluation_error provenance', () => {
    const onEvaluationError = vi.fn();
    expect(
      evaluateComputedValue({
        allowOverride: false,
        catalogueRevision: 12,
        expression: binary('divide', '1', '0'),
        fieldId: 'ratio',
        override: { state: 'absent' },
        snapshot: emptySnapshot,
        onEvaluationError,
      })
    ).toEqual({
      state: 'unavailable',
      reason: 'evaluation_error',
      fieldId: 'ratio',
      traversedItemIds: ['root'],
      missingInputs: [],
      provenance: { source: 'computed', catalogueRevision: 12, dependencies: [] },
    });
    expect(onEvaluationError).toHaveBeenCalledExactlyOnceWith('division_by_zero');
  });
});
