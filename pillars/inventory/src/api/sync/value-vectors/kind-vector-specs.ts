/** One spec per kind/cardinality vector: the item to create and the one field value it carries. */
import { buildRemainingKindVectorSpecs } from './kind-vector-specs-2.js';

import type { EnumOptionIds } from './catalogue-fields.js';
import type { ReferenceSpecTargets, VectorSpec } from './vector-spec.js';

function textSpecs(): readonly VectorSpec[] {
  return [
    {
      name: 'short_text one',
      kind: 'short_text',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'shortTextOne',
      itemName: 'short_text one',
      values: ['Bulb'],
    },
    {
      name: 'short_text many, non-ASCII',
      kind: 'short_text',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'shortTextMany',
      itemName: 'short_text many',
      values: ['red', 'grün', '🙂'],
    },
    {
      name: 'long_text one',
      kind: 'long_text',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'longTextOne',
      itemName: 'long_text one',
      values: ['A somewhat longer free-text note about this item, spanning a full sentence.'],
    },
    {
      name: 'long_text many',
      kind: 'long_text',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'longTextMany',
      itemName: 'long_text many',
      values: ['first paragraph', 'second paragraph'],
    },
  ];
}

function numericSpecs(): readonly VectorSpec[] {
  return [
    {
      name: 'integer one',
      kind: 'integer',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'integerOne',
      itemName: 'integer one (computed dependency)',
      values: [800],
    },
    {
      name: 'integer many, unsorted, to the safe-integer limit',
      kind: 'integer',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'integerMany',
      itemName: 'integer many',
      values: [3, -1, 2, 9007199254740991],
    },
    {
      name: 'decimal one at the precision boundary (18 significant digits, scale 9)',
      kind: 'decimal',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'decimalOne',
      itemName: 'decimal one boundary',
      values: ['123456789.123456789'],
    },
    {
      name: 'decimal one negative at the precision boundary',
      kind: 'decimal',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'decimalOne',
      itemName: 'decimal one boundary negative',
      values: ['-987654321.987654321'],
    },
    {
      name: 'decimal many',
      kind: 'decimal',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'decimalMany',
      itemName: 'decimal many',
      values: ['0.1', '2.50', '-3'],
    },
  ];
}

function option(id: string): { readonly optionId: string } {
  return { optionId: id };
}

function booleanAndEnumSpecs(
  enumOptionIds: EnumOptionIds,
  enumManyOptionIds: EnumOptionIds
): readonly VectorSpec[] {
  return [
    {
      name: 'boolean one (true)',
      kind: 'boolean',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'booleanOne',
      itemName: 'boolean one true',
      values: [true],
    },
    {
      name: 'boolean one (false)',
      kind: 'boolean',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'booleanOne',
      itemName: 'boolean one false',
      values: [false],
    },
    {
      name: 'enum one (active option)',
      kind: 'enum',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'enumOne',
      itemName: 'enum one active',
      values: [option(enumOptionIds.alpha)],
    },
    {
      name: 'enum one referencing a since-retired option',
      kind: 'enum',
      cardinality: 'one',
      storage: 'stored',
      fieldKey: 'enumOne',
      itemName: 'enum one retired',
      values: [option(enumOptionIds.gamma)],
    },
    {
      name: 'enum many',
      kind: 'enum',
      cardinality: 'many',
      storage: 'stored',
      fieldKey: 'enumMany',
      itemName: 'enum many',
      values: [option(enumManyOptionIds.alpha), option(enumManyOptionIds.beta)],
    },
  ];
}

/** Every non-edge-case kind/cardinality spec, in a stable order. */
export function buildKindVectorSpecs(
  enumOptionIds: EnumOptionIds,
  enumManyOptionIds: EnumOptionIds,
  referenceTargets: ReferenceSpecTargets
): readonly VectorSpec[] {
  return [
    ...textSpecs(),
    ...numericSpecs(),
    ...booleanAndEnumSpecs(enumOptionIds, enumManyOptionIds),
    ...buildRemainingKindVectorSpecs(referenceTargets),
  ];
}
