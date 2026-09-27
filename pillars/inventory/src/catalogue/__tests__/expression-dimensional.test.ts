import { describe, expect, it } from 'vitest';

import { evaluateExpression } from '../expression-evaluator.js';
import { validateCatalogueExpressions } from '../expression-validator.js';
import {
  expressionCatalogue,
  expressionField,
  expressionSnapshot,
  expressionType,
} from './expression-test-fixtures.js';

import type { UnresolvedItemTypeField } from '../catalogue-types.js';
import type { ExpressionSnapshotItem, SnapshotFieldValue } from '../expression-types.js';
import type { PrimitiveKind } from '../value-types.js';

function read(fieldId: string) {
  return { op: 'read', path: [], fieldId };
}

function times(left: unknown, right: unknown) {
  return { op: 'multiply', left, right };
}

function over(left: unknown, right: unknown) {
  return { op: 'divide', left, right };
}

function measured(id: string, fixedUnit: string): UnresolvedItemTypeField {
  return expressionField({ id, key: id, kind: 'measurement', fixedUnit });
}

const box = [
  measured('width', 'cm'),
  measured('height', 'cm'),
  measured('depth', 'mm'),
  measured('mass', 'kg'),
  measured('odd', 'fl oz'),
];

const VOLUME = times(times(read('width'), read('height')), read('depth'));

function computed(
  expression: unknown,
  kind: PrimitiveKind,
  fixedUnit: string | null,
  expressionVersion = 2
): UnresolvedItemTypeField {
  return expressionField({
    expressionJson: JSON.stringify(expression),
    expressionVersion,
    fixedUnit,
    id: 'result',
    key: 'result',
    kind,
    storage: 'computed',
  });
}

function validate(field: UnresolvedItemTypeField) {
  const [validated] = validateCatalogueExpressions(
    expressionCatalogue([expressionType('type', [...box, field])])
  );
  if (validated === undefined) throw new Error('no expression validated');
  return validated;
}

function value(amount: string, unit: string): SnapshotFieldValue {
  return { state: 'value', value: { amount, unit }, revision: 1 };
}

const boxItem: ExpressionSnapshotItem = {
  id: 'root',
  revision: 1,
  fields: new Map([
    ['width', value('20', 'cm')],
    ['height', value('30', 'cm')],
    ['depth', value('400', 'mm')],
    ['mass', value('3', 'kg')],
  ]),
};

const snapshot = expressionSnapshot(new Map([['root', { state: 'resolved', item: boxItem }]]));

describe('version-2 dimensional expressions', () => {
  it('type-checks width × height × depth as a volume in L, cm³ or mm³', () => {
    for (const unit of ['L', 'cm³', 'mm³'])
      expect(validate(computed(VOLUME, 'measurement', unit)).resultType).toEqual({
        kind: 'measurement',
        fixedUnit: unit,
      });
  });

  it('evaluates the volume in the field unit exactly', () => {
    expect(
      evaluateExpression(validate(computed(VOLUME, 'measurement', 'L')), snapshot)
    ).toMatchObject({
      state: 'value',
      value: { amount: '24.0000', unit: 'L' },
    });
    expect(
      evaluateExpression(validate(computed(VOLUME, 'measurement', 'mm³')), snapshot)
    ).toMatchObject({ state: 'value', value: { amount: '24000000', unit: 'mm³' } });
  });

  it('rejects a result unit of another dimension at publication', () => {
    for (const unit of ['cm²', 'kg', 'cm3']) {
      expect(() => validate(computed(VOLUME, 'measurement', unit)), unit).toThrowError(
        expect.objectContaining({ code: 'expression_type_mismatch', path: 'expression' })
      );
    }
    expect(() => validate(computed(VOLUME, 'measurement', 'cm²'))).toThrowError(
      /expected measurement in cm² \(length²\), received measurement in cm³ \(length³\)/u
    );
  });

  it('derives a plain decimal from a same-dimension quotient', () => {
    const ratio = computed(over(read('width'), read('depth')), 'decimal', null);
    expect(validate(ratio).resultType).toEqual({ kind: 'decimal', fixedUnit: null });
    expect(evaluateExpression(validate(ratio), snapshot)).toMatchObject({
      state: 'value',
      value: '0.5',
    });
    expect(() =>
      validate(computed(over(read('width'), read('depth')), 'measurement', 'cm'))
    ).toThrowError(expect.objectContaining({ code: 'expression_type_mismatch' }));
  });

  it('requires one dimension for addition and comparison, converting within it', () => {
    const sum = computed(
      { op: 'add', left: read('width'), right: read('depth') },
      'measurement',
      'mm'
    );
    expect(evaluateExpression(validate(sum), snapshot)).toMatchObject({
      value: { amount: '600', unit: 'mm' },
    });
    expect(() =>
      validate(
        computed({ op: 'add', left: read('width'), right: read('mass') }, 'measurement', 'cm')
      )
    ).toThrowError(
      expect.objectContaining({ code: 'expression_type_mismatch', path: 'expression.right' })
    );
    expect(() =>
      validate(
        computed({ op: 'less_than', left: read('width'), right: read('mass') }, 'boolean', null)
      )
    ).toThrowError(
      expect.objectContaining({ code: 'expression_type_mismatch', path: 'expression.right' })
    );
    expect(
      validate(
        computed(
          {
            op: 'less_than',
            left: read('depth'),
            right: { op: 'literal', value: { amount: '1', unit: 'm' } },
          },
          'boolean',
          null
        )
      ).resultType
    ).toEqual({ kind: 'boolean', fixedUnit: null });
  });

  it('refuses to derive a unit from text that is not a unit term', () => {
    expect(() =>
      validate(computed(times(read('odd'), read('width')), 'measurement', 'cm'))
    ).toThrowError(expect.objectContaining({ code: 'expression_unit_unsupported' }));
  });

  it('keeps a measurement scaled by a decimal, and refuses an integer scale', () => {
    expect(
      validate(computed(times(read('width'), { op: 'literal', value: '2' }), 'measurement', 'cm'))
        .resultType
    ).toEqual({ kind: 'measurement', fixedUnit: 'cm' });
    expect(() =>
      validate(computed(times(read('width'), { op: 'literal', value: 2 }), 'measurement', 'cm'))
    ).toThrowError(
      expect.objectContaining({ code: 'expression_type_mismatch', path: 'expression.right' })
    );
  });

  it('leaves version 1 unchanged: no derived units, no conversion', () => {
    expect(() => validate(computed(VOLUME, 'measurement', 'L', 1))).toThrowError(
      expect.objectContaining({ code: 'expression_type_mismatch', path: 'expression.left.right' })
    );
    expect(() =>
      validate(
        computed({ op: 'add', left: read('width'), right: read('depth') }, 'measurement', 'cm', 1)
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_type_mismatch' }));
    const v1 = validate(computed(read('width'), 'measurement', 'cm', 1));
    expect(v1.version).toBe(1);
    expect(evaluateExpression(v1, snapshot)).toMatchObject({ value: { amount: '20', unit: 'cm' } });
  });
});
