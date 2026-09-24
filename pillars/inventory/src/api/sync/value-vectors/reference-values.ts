/** `reference` value literals, and the rows their targets resolve to now. */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { items, locations } from '../../../db/index.js';
import { toSyncLocation } from '../wire.js';
import { projectItem } from './projection.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { SyncItemFieldValue } from '../wire.js';
import type { ValueVectorReferenceTarget } from './types.js';

const referenceValueSchema = z.object({
  targetKind: z.enum(['item', 'location']),
  targetId: z.string(),
});

export type ReferenceValue = z.infer<typeof referenceValueSchema>;

export function ref(targetKind: ReferenceValue['targetKind'], targetId: string): ReferenceValue {
  return { targetKind, targetId };
}

/** The reference values a stored entry carries, in order; none when the field is absent. */
export function referenceValuesOf(fieldValue: SyncItemFieldValue | null): ReferenceValue[] {
  return (fieldValue?.values ?? []).map((value) => referenceValueSchema.parse(value));
}

function resolveReferenceTarget(db: CommandDb, value: ReferenceValue): ValueVectorReferenceTarget {
  if (value.targetKind === 'location') {
    const row = db.select().from(locations).where(eq(locations.id, value.targetId)).get();
    return row ? { kind: 'location', location: toSyncLocation(row) } : null;
  }
  const row = db.select({ id: items.id }).from(items).where(eq(items.id, value.targetId)).get();
  return row ? { kind: 'item', item: projectItem(db, row.id) } : null;
}

export function referenceTargetsOf(
  db: CommandDb,
  values: readonly ReferenceValue[]
): readonly ValueVectorReferenceTarget[] {
  return values.map((value) => resolveReferenceTarget(db, value));
}
