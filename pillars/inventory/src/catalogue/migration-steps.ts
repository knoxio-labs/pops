import { eq } from 'drizzle-orm';

import { itemFieldValues } from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { parseCanonicalValue } from './value-codec.js';

import type { ItemFieldValueSource } from '../db/schema.js';
import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';
import type { CatalogueMigrationStep } from './migration-types.js';
import type { PrimitiveWireValue } from './value-types.js';

/** Mutable in-memory values used only during a migration dry run. */
export interface MutableFieldValues {
  fieldId: string;
  source: ItemFieldValueSource;
  values: PrimitiveWireValue[];
}

/** Loads and validates an item's existing canonical values for migration. */
export function loadMigrationItemValues(db: CommandDb, itemId: string): MutableFieldValues[] {
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(eq(itemFieldValues.itemId, itemId))
    .orderBy(itemFieldValues.fieldId, itemFieldValues.source, itemFieldValues.ordinal)
    .all();
  const values: MutableFieldValues[] = [];
  for (const row of rows) {
    const field = loadPublishedCatalogue(db, row.catalogueRevision)
      ?.types.flatMap((type) => type.fields)
      .find((candidate) => candidate.id === row.fieldId);
    if (!field) {
      throw new Error(`field ${row.fieldId} is unavailable at revision ${row.catalogueRevision}`);
    }
    const readable = { ...field, archivedEnumOptionIds: new Set<string>() };
    const value = parseCanonicalValue(readable, row.valueJson).value;
    const previous = values.at(-1);
    if (previous?.fieldId === row.fieldId && previous.source === row.source) {
      previous.values.push(value);
    } else {
      values.push({ fieldId: row.fieldId, source: row.source, values: [value] });
    }
  }
  return values;
}

function findValues(values: MutableFieldValues[], fieldId: string): MutableFieldValues | undefined {
  return values.find((entry) => entry.fieldId === fieldId);
}

function fieldById(candidate: PersistedCatalogue, fieldId: string): PersistedItemTypeField {
  const field = candidate.types
    .flatMap((type) => type.fields)
    .find((entry) => entry.id === fieldId);
  if (!field) throw new Error(`migration names unknown candidate field ${fieldId}`);
  return field;
}

function setValues(
  values: MutableFieldValues[],
  field: PersistedItemTypeField,
  next: readonly PrimitiveWireValue[]
): void {
  const source = field.storage === 'stored' ? 'stored' : 'override';
  const existing = findValues(values, field.id);
  if (existing) {
    existing.source = source;
    existing.values = [...next];
  } else {
    values.push({ fieldId: field.id, source, values: [...next] });
  }
}

function multiplyDecimal(value: string, factor: string): string {
  const parts = (decimal: string): { coefficient: bigint; scale: number } => {
    const negative = decimal.startsWith('-');
    const unsigned = negative ? decimal.slice(1) : decimal;
    const [whole = '0', fraction = ''] = unsigned.split('.');
    const coefficient = BigInt(`${whole}${fraction}`);
    return { coefficient: negative ? -coefficient : coefficient, scale: fraction.length };
  };
  const left = parts(value);
  const right = parts(factor);
  const coefficient = left.coefficient * right.coefficient;
  const scale = left.scale + right.scale;
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? '' : `.${digits.slice(-scale)}`;
  return `${negative && coefficient !== 0n ? '-' : ''}${whole}${fraction}`;
}

function mapEnum(
  values: MutableFieldValues[],
  step: Extract<CatalogueMigrationStep, { kind: 'map_enum' }>
): void {
  const entry = findValues(values, step.fieldId);
  if (!entry) return;
  entry.values = entry.values.map((value) => {
    const optionId =
      typeof value === 'object' && value !== null && 'optionId' in value ? value.optionId : null;
    const replacement = optionId ? step.optionIds[optionId] : undefined;
    return replacement ? { optionId: replacement } : value;
  });
}

function replaceReference(
  values: MutableFieldValues[],
  step: Extract<CatalogueMigrationStep, { kind: 'replace_reference' }>
): void {
  const entry = findValues(values, step.fieldId);
  if (!entry) return;
  entry.values = entry.values.map((value) => {
    const reference =
      typeof value === 'object' && value !== null && 'targetKind' in value ? value : null;
    return reference?.targetKind === step.targetKind && reference.targetId === step.fromTargetId
      ? { targetKind: step.targetKind, targetId: step.toTargetId }
      : value;
  });
}

/** Applies one closed migration step to an in-memory item field set. */
export function applyMigrationStep(
  values: MutableFieldValues[],
  step: CatalogueMigrationStep,
  candidate: PersistedCatalogue
): void {
  if (step.kind === 'copy') {
    const source = findValues(values, step.fromFieldId);
    if (source) setValues(values, fieldById(candidate, step.toFieldId), source.values);
  } else if (step.kind === 'set_default') {
    const field = fieldById(candidate, step.fieldId);
    if (!findValues(values, field.id)) setValues(values, field, step.values);
  } else if (step.kind === 'map_enum') {
    mapEnum(values, step);
  } else if (step.kind === 'convert_decimal') {
    const source = findValues(values, step.fromFieldId);
    if (!source) return;
    const converted = source.values.map((value) => {
      if (typeof value !== 'string') throw new Error(`${step.fromFieldId} is not decimal`);
      return multiplyDecimal(value, step.factor);
    });
    setValues(values, fieldById(candidate, step.toFieldId), converted);
  } else if (step.kind === 'replace_reference') {
    replaceReference(values, step);
  } else {
    const index = values.findIndex((entry) => entry.fieldId === step.fieldId);
    if (index >= 0) values.splice(index, 1);
  }
}
