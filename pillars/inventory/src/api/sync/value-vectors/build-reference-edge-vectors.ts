/**
 * References whose target is gone or deleted. A new value may only name a
 * live target, so each is written first and its target removed afterwards.
 */
import {
  pendingTargetVector,
  renamedTargetVector,
} from './build-reference-edge-sync-state-vectors.js';
import { fieldValueOf, projectItem } from './projection.js';
import { ref } from './reference-values.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { FixtureEngine } from './fixture-engine.js';
import type { ValueVector } from './types.js';

/** Existing rows this module archives after a vector has named them while live. */
export interface ReferenceEdgeTargets {
  readonly deletedTargetItemId: string;
  readonly missingTargetItemId: string;
  readonly deletedLocationId: string;
  readonly pendingTargetItemId: string;
  readonly renamedTargetItemId: string;
}

/** Creates the three targets, live, for {@link buildReferenceEdgeVectors} to archive later. */
export function createReferenceEdgeTargets(
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): ReferenceEdgeTargets {
  const revision = catalogue.liveRevision;
  return {
    deletedTargetItemId: engine.createItem(catalogue, revision, 'Deleted reference target', [])
      .itemId,
    missingTargetItemId: engine.createItem(catalogue, revision, 'Soon-missing reference target', [])
      .itemId,
    deletedLocationId: engine.createLiveLocation('Deleted reference location'),
    pendingTargetItemId: engine.createItem(
      catalogue,
      revision,
      'Not-yet-synced reference target',
      []
    ).itemId,
    renamedTargetItemId: engine.createItem(
      catalogue,
      revision,
      'Reference target before rename',
      []
    ).itemId,
  };
}

function missingTargetVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targetItemId: string
): ValueVector {
  const fieldId = catalogue.fieldIds.referenceOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'reference one missing target',
    [{ fieldId, values: [ref('item', targetItemId)] }]
  );
  const item = projectItem(db, created.itemId);
  engine.hardDeleteItem(targetItemId);
  return {
    name: 'reference one whose target no longer exists at all',
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

function archivedItemTargetVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targetItemId: string
): ValueVector {
  const fieldId = catalogue.fieldIds.referenceOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'reference one archived target',
    [{ fieldId, values: [ref('item', targetItemId)] }]
  );
  const item = projectItem(db, created.itemId);
  engine.deleteItem(catalogue.liveRevision, targetItemId);
  return {
    name: 'reference one whose target was archived (soft-deleted) after being selected',
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

function archivedLocationTargetVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targetLocationId: string
): ValueVector {
  const fieldId = catalogue.fieldIds.referenceOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'reference one deleted location target',
    [{ fieldId, values: [ref('location', targetLocationId)] }]
  );
  const item = projectItem(db, created.itemId);
  engine.deleteLocation(catalogue.liveRevision, targetLocationId);
  return {
    name: 'reference one whose location target was archived (soft-deleted)',
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

/**
 * Builds the "missing", "archived item", "archived location", "pending
 * (not yet synced)" and "renamed" reference vectors.
 */
export function buildReferenceEdgeVectors(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  targets: ReferenceEdgeTargets
): readonly ValueVector[] {
  return [
    missingTargetVector(db, engine, catalogue, targets.missingTargetItemId),
    archivedItemTargetVector(db, engine, catalogue, targets.deletedTargetItemId),
    archivedLocationTargetVector(db, engine, catalogue, targets.deletedLocationId),
    pendingTargetVector(db, engine, catalogue, targets.pendingTargetItemId),
    renamedTargetVector(db, engine, catalogue, targets.renamedTargetItemId),
  ];
}
