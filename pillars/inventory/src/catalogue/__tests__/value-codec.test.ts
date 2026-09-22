import { describe, expect, it } from 'vitest';

import { type ValueFieldDefinition, ValueValidationError } from '../value-codec.js';
import { canonicalizeValue, parseCanonicalValue } from '../value-dispatch.js';

function field(overrides: Partial<ValueFieldDefinition> = {}): ValueFieldDefinition {
  return {
    id: 'field-id',
    key: 'field-key',
    kind: 'decimal',
    cardinality: 'one',
    storage: 'stored',
    fixedUnit: null,
    enumOptionIds: new Set(),
    archivedEnumOptionIds: new Set(),
    referenceKinds: new Set(),
    referenceTypeIds: new Set(),
    ...overrides,
  };
}

describe('canonicalizeValue', () => {
  it('preserves the exact decimal scale in its persisted JSON', () => {
    expect(canonicalizeValue(field(), '12.340')).toEqual({
      value: '12.340',
      valueJson: '"12.340"',
    });
  });

  it.each(['01', '+1', '1e2', '-0', '-0.0', '1.', '.1'])(
    'rejects non-canonical decimal %s',
    (value) => {
      expect(() => canonicalizeValue(field(), value)).toThrow(ValueValidationError);
    }
  );

  it('rejects decimals beyond the significant-digit and fractional-scale limits', () => {
    expect(() => canonicalizeValue(field(), '1234567890123456789')).toThrow(
      /exceeds decimal precision/u
    );
    expect(() => canonicalizeValue(field(), '0.1234567890')).toThrow(/exceeds decimal precision/u);
  });

  it('does not accept a Number as decimal authority', () => {
    expect(() => canonicalizeValue(field(), 12.34)).toThrow(/canonical decimal/u);
  });

  it('canonicalizes a fixed-unit measurement without changing the decimal amount', () => {
    const measurement = field({ kind: 'measurement', fixedUnit: 'kg' });
    expect(canonicalizeValue(measurement, { amount: '12.500', unit: 'kg' })).toEqual({
      value: { amount: '12.500', unit: 'kg' },
      valueJson: '{"amount":"12.500","unit":"kg"}',
    });
    expect(() => canonicalizeValue(measurement, { amount: '12.500', unit: 'g' })).toThrow(
      /does not match/u
    );
  });

  it('refuses a non-canonical persisted encoding', () => {
    expect(() => parseCanonicalValue(field(), '"1.20" ')).toThrow(/canonically encoded/u);
  });

  it('rejects an archived enum option while retaining a valid active option', () => {
    const active = '4f02ec7f-8ed3-5c89-b75f-4d085cc6d75c';
    const archived = 'a3af367a-e215-5a48-bfb3-6cf2e0b83eaa';
    const enumField = field({
      kind: 'enum',
      enumOptionIds: new Set([active, archived]),
      archivedEnumOptionIds: new Set([archived]),
    });
    expect(canonicalizeValue(enumField, { optionId: active }).valueJson).toBe(
      '{"optionId":"4f02ec7f-8ed3-5c89-b75f-4d085cc6d75c"}'
    );
    expect(() => canonicalizeValue(enumField, { optionId: archived })).toThrow(/archived/u);
  });
});
