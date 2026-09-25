/**
 * References whose target stays live: not yet synced to the phone, or
 * renamed after the reference was made (POPS-4403/4360). Split out of
 * `build-reference-edge-vectors.ts` to keep that file under the line cap.
 */
import { fieldValueOf, projectItem } from './projection.js';
import { ref } from './reference-values.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { FixtureEngine } from './fixture-engine.js';
import type { ValueVector } from './types.js';

/**
 * A reference to a target that is live on the producer but whose resolved
 * row this vector withholds, standing in for a target the phone has not
 * synced into its own replica yet. `fieldValue` still carries the real
 * `{targetKind, targetId}`; only `referenceTargets` is pre-set to `pending`
 * so {@link import('./build.js').buildValueVectors} leaves it untouched.
 */
export function pendingTargetVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targetItemId: string
): ValueVector {
  const fieldId = catalogue.fieldIds.referenceOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'reference one target not yet on the phone',
    [{ fieldId, values: [ref('item', targetItemId)] }]
  );
  const item = projectItem(db, created.itemId);
  return {
    name: 'reference one whose target is live but has not synced to the phone yet',
    kind: 'reference',
    cardinality: 'one',
    storage: 'stored',
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: fieldValueOf(item, fieldId),
    computedValue: null,
    command: created.command,
    referenceTargets: [{ kind: 'pending', targetKind: 'item', targetId: targetItemId }],
  };
}

/**
 * A reference whose target keeps its identity but is renamed after being
 * selected. The vector's own `referenceTargets` is left for
 * {@link import('./build.js').buildValueVectors}'s final re-projection to
 * fill in, so it reflects the target's name as of the end of the build —
 * after the rename below — proving a consumer must show the current label,
 * not the one captured at selection time.
 */
export function renamedTargetVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targetItemId: string
): ValueVector {
  const fieldId = catalogue.fieldIds.referenceOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'reference one renamed target',
    [{ fieldId, values: [ref('item', targetItemId)] }]
  );
  engine.renameItem(catalogue.liveRevision, targetItemId, 'Reference target after rename');
  const item = projectItem(db, created.itemId);
  return {
    name: 'reference one whose target was renamed after being selected',
    kind: 'reference',
    cardinality: 'one',
    storage: 'stored',
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: fieldValueOf(item, fieldId),
    computedValue: null,
    command: created.command,
  };
}
