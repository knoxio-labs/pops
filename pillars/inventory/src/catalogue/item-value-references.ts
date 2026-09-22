import { and, eq, sql } from 'drizzle-orm';

import { itemFieldValues, items, locations } from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { ValueValidationError } from './value-codec.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedItemTypeField } from './catalogue-types.js';
import type { ReferenceTargetState } from './item-value-types.js';
import type { PrimitiveWireValue, ReferenceWireValue } from './value-types.js';

export function referenceValue(value: PrimitiveWireValue): ReferenceWireValue | null {
  if (typeof value !== 'object' || value === null || !('targetKind' in value)) return null;
  return value;
}

export function assertReferenceTarget(
  db: CommandDb,
  field: PersistedItemTypeField,
  value: PrimitiveWireValue
): void {
  const reference = referenceValue(value);
  if (!reference) return;
  if (reference.targetKind === 'location') {
    const target = db
      .select({ deletedAt: locations.deletedAt })
      .from(locations)
      .where(eq(locations.id, reference.targetId))
      .get();
    if (!target || target.deletedAt !== null) {
      throw new ValueValidationError('target_missing', field.id, 'reference target is not live');
    }
    return;
  }
  const target = db
    .select({ deletedAt: items.deletedAt, typeId: items.typeId })
    .from(items)
    .where(eq(items.id, reference.targetId))
    .get();
  if (!target || target.deletedAt !== null) {
    throw new ValueValidationError('target_missing', field.id, 'reference target is not live');
  }
  if (field.referenceTypeIds.size > 0 && !target.typeId) {
    throw new ValueValidationError(
      'reference_type_mismatch',
      field.id,
      'reference target has no permitted type'
    );
  }
  if (
    target.typeId &&
    field.referenceTypeIds.size > 0 &&
    !field.referenceTypeIds.has(target.typeId)
  ) {
    throw new ValueValidationError(
      'reference_type_mismatch',
      field.id,
      `reference target type ${target.typeId} is not permitted`
    );
  }
}

/** Rejects a type change that would invalidate a live incoming constrained reference. */
export function assertIncomingReferencesPermitType(
  db: CommandDb,
  itemId: string,
  nextTypeId: string
): void {
  const incoming = db
    .select()
    .from(itemFieldValues)
    .where(
      and(
        sql`json_extract(${itemFieldValues.valueJson}, '$.targetKind') = 'item'`,
        sql`json_extract(${itemFieldValues.valueJson}, '$.targetId') = ${itemId}`
      )
    )
    .all();
  for (const row of incoming) {
    const field = loadPublishedCatalogue(db, row.catalogueRevision)
      ?.types.flatMap((type) => type.fields)
      .find((candidate) => candidate.id === row.fieldId);
    if (field && field.referenceTypeIds.size > 0 && !field.referenceTypeIds.has(nextTypeId)) {
      throw new ValueValidationError(
        'reference_type_mismatch',
        field.id,
        `incoming reference does not permit target type ${nextTypeId}`
      );
    }
  }
}

export function referenceState(db: CommandDb, reference: ReferenceWireValue): ReferenceTargetState {
  const target =
    reference.targetKind === 'location'
      ? db
          .select({ deletedAt: locations.deletedAt })
          .from(locations)
          .where(eq(locations.id, reference.targetId))
          .get()
      : db
          .select({ deletedAt: items.deletedAt })
          .from(items)
          .where(eq(items.id, reference.targetId))
          .get();
  if (!target) return 'missing';
  return target.deletedAt === null ? 'resolved' : 'deleted';
}
