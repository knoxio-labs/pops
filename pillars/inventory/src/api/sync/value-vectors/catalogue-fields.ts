/**
 * The Value Vector Type's field roster at fixed ids, so every regeneration
 * is byte-identical. `KIND_FIELDS` is keyed by {@link PrimitiveKind}: a kind
 * added to the catalogue fails typecheck here until it has a field for each
 * cardinality the catalogue validator allows.
 */
import { fieldEnumOptions, itemTypeFields, itemTypes } from '../../../db/index.js';

import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { ExpressionV1Shape } from '../../../contract/rest-catalogue-expression-schema.js';
import type { CommandDb } from '../../../domain/commands/entities.js';

export const VECTOR_TYPE_KEY = 'value_vector_type';

export const MEASUREMENT_UNIT = 'kg';
/** A derived unit in `parseUnitTerm`'s canonical grammar, stored as a fixed unit. */
export const DERIVED_MEASUREMENT_UNIT = 'kg/m³';

/** Enum option keys on `enumOne`/`enumMany`; `gamma` is archived in the second revision. */
export const ENUM_OPTIONS = ['alpha', 'beta', 'gamma'] as const;
export type EnumOptionKey = (typeof ENUM_OPTIONS)[number];
export type EnumOptionIds = Readonly<Record<EnumOptionKey, string>>;

function definitionId(sequence: number): string {
  return `10000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

export const TYPE_ID = definitionId(1);

export const FIELD_IDS = {
  shortTextOne: definitionId(10),
  shortTextMany: definitionId(11),
  longTextOne: definitionId(12),
  longTextMany: definitionId(13),
  integerOne: definitionId(14),
  integerMany: definitionId(15),
  decimalOne: definitionId(16),
  decimalMany: definitionId(17),
  booleanOne: definitionId(18),
  enumOne: definitionId(19),
  enumMany: definitionId(20),
  measurementOne: definitionId(21),
  measurementMany: definitionId(22),
  measurementDerivedOne: definitionId(23),
  dateOne: definitionId(24),
  dateMany: definitionId(25),
  dateTimeOne: definitionId(26),
  dateTimeMany: definitionId(27),
  urlOne: definitionId(28),
  urlMany: definitionId(29),
  referenceOne: definitionId(30),
  referenceMany: definitionId(31),
  computedField: definitionId(32),
  computedOverflow: definitionId(33),
} as const;

export type FieldKeyName = keyof typeof FIELD_IDS;

/** `many: null` where the catalogue validator refuses the cardinality (`boolean_many`). */
export const KIND_FIELDS: {
  readonly [Kind in PrimitiveKind]: {
    readonly one: FieldKeyName;
    readonly many: FieldKeyName | null;
  };
} = {
  short_text: { one: 'shortTextOne', many: 'shortTextMany' },
  long_text: { one: 'longTextOne', many: 'longTextMany' },
  integer: { one: 'integerOne', many: 'integerMany' },
  decimal: { one: 'decimalOne', many: 'decimalMany' },
  boolean: { one: 'booleanOne', many: null },
  enum: { one: 'enumOne', many: 'enumMany' },
  measurement: { one: 'measurementOne', many: 'measurementMany' },
  date: { one: 'dateOne', many: 'dateMany' },
  date_time: { one: 'dateTimeOne', many: 'dateTimeMany' },
  url: { one: 'urlOne', many: 'urlMany' },
  reference: { one: 'referenceOne', many: 'referenceMany' },
};

export const ENUM_ONE_OPTION_IDS: EnumOptionIds = {
  alpha: definitionId(100),
  beta: definitionId(101),
  gamma: definitionId(102),
};

export const ENUM_MANY_OPTION_IDS: EnumOptionIds = {
  alpha: definitionId(110),
  beta: definitionId(111),
  gamma: definitionId(112),
};

interface FieldRow {
  readonly key: FieldKeyName;
  readonly kind: PrimitiveKind;
  readonly cardinality: 'one' | 'many';
  readonly storage: 'stored' | 'computed';
  readonly fixedUnit: string | null;
  readonly referenceKinds: readonly ('item' | 'location')[];
  readonly expression: ExpressionV1Shape | null;
}

function fixedUnitOf(key: FieldKeyName, kind: PrimitiveKind): string | null {
  if (kind !== 'measurement') return null;
  return key === 'measurementDerivedOne' ? DERIVED_MEASUREMENT_UNIT : MEASUREMENT_UNIT;
}

function storedRow(key: FieldKeyName, kind: PrimitiveKind, cardinality: 'one' | 'many'): FieldRow {
  return {
    key,
    kind,
    cardinality,
    storage: 'stored',
    fixedUnit: fixedUnitOf(key, kind),
    referenceKinds: kind === 'reference' ? ['item', 'location'] : [],
    expression: null,
  };
}

function computedRow(key: FieldKeyName, expression: ExpressionV1Shape): FieldRow {
  return {
    key,
    kind: 'integer',
    cardinality: 'one',
    storage: 'computed',
    fixedUnit: null,
    referenceKinds: [],
    expression,
  };
}

const readIntegerOne: ExpressionV1Shape = { op: 'read', path: [], fieldId: FIELD_IDS.integerOne };

/** Every field of the type, in sort order: each kind's cardinalities, then the extras. */
export function fieldRows(kinds: readonly PrimitiveKind[]): readonly FieldRow[] {
  const stored = kinds.flatMap((kind) => {
    const { one, many } = KIND_FIELDS[kind];
    const rows = [storedRow(one, kind, 'one')];
    if (many !== null) rows.push(storedRow(many, kind, 'many'));
    if (kind === 'measurement') rows.push(storedRow('measurementDerivedOne', kind, 'one'));
    return rows;
  });
  return [
    ...stored,
    computedRow('computedField', readIntegerOne),
    computedRow('computedOverflow', {
      op: 'add',
      left: readIntegerOne,
      right: { op: 'literal', value: Number.MAX_SAFE_INTEGER },
    }),
  ];
}

export function insertType(db: CommandDb, revision: number): void {
  db.insert(itemTypes)
    .values({
      revision,
      id: TYPE_ID,
      key: VECTOR_TYPE_KEY,
      label: 'Value Vector Type',
      description: null,
      sortOrder: 0,
      capabilitiesJson: '[]',
      legacyLabelsJson: '[]',
      presentationJson: '{}',
      archivedAt: null,
    })
    .run();
}

export function insertFields(db: CommandDb, revision: number, rows: readonly FieldRow[]): void {
  rows.forEach((row, sortOrder) => {
    db.insert(itemTypeFields)
      .values({
        revision,
        id: FIELD_IDS[row.key],
        typeId: TYPE_ID,
        key: row.key,
        label: row.key,
        help: null,
        sortOrder,
        kind: row.kind,
        cardinality: row.cardinality,
        required: 0,
        storage: row.storage,
        fixedUnit: row.fixedUnit,
        referenceKindsJson: JSON.stringify(row.referenceKinds),
        referenceTypeIdsJson: '[]',
        expressionVersion: row.expression === null ? null : 1,
        expressionJson: row.expression === null ? null : JSON.stringify(row.expression),
        allowOverride: row.storage === 'computed' ? 1 : 0,
        presentationJson: '{}',
        archivedAt: null,
      })
      .run();
  });
}

function insertOptions(
  db: CommandDb,
  revision: number,
  fieldId: string,
  optionIds: EnumOptionIds
): void {
  ENUM_OPTIONS.forEach((key, sortOrder) => {
    db.insert(fieldEnumOptions)
      .values({
        revision,
        id: optionIds[key],
        fieldId,
        key,
        label: key,
        sortOrder,
        archivedAt: null,
      })
      .run();
  });
}

export function insertEnumOptions(db: CommandDb, revision: number): void {
  insertOptions(db, revision, FIELD_IDS.enumOne, ENUM_ONE_OPTION_IDS);
  insertOptions(db, revision, FIELD_IDS.enumMany, ENUM_MANY_OPTION_IDS);
}
