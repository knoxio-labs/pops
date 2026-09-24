/** Turns each {@link VectorSpec} into a real item and a real {@link ValueVector}. */
import {
  buildKindVectorSpecs,
  type ReferenceSpecTargets,
  type VectorSpec,
} from './kind-vector-specs.js';
import { computedValueOf, fieldValueOf, projectItem } from './projection.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { FixtureEngine } from './fixture-engine.js';
import type { ValueVector } from './types.js';

function toVector(
  db: CommandDb,
  spec: VectorSpec,
  fieldId: string,
  created: { readonly itemId: string; readonly command: ValueVector['command'] }
): ValueVector {
  const item = projectItem(db, created.itemId);
  return {
    name: spec.name,
    kind: spec.kind,
    cardinality: spec.cardinality,
    storage: spec.storage,
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: fieldValueOf(item, fieldId),
    computedValue: computedValueOf(item, fieldId),
    command: created.command,
  };
}

/** Builds one {@link ValueVector} per non-edge-case kind/cardinality spec. */
export function buildKindVectors(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  referenceTargets: ReferenceSpecTargets
): readonly ValueVector[] {
  const specs = buildKindVectorSpecs(
    catalogue.enumOptionIds,
    catalogue.enumManyOptionIds,
    referenceTargets
  );
  return specs.map((spec) => {
    const fieldId = catalogue.fieldIds[spec.fieldKey];
    const created = engine.createItem(catalogue, catalogue.liveRevision, spec.itemName, [
      { fieldId, values: spec.values },
    ]);
    return toVector(db, spec, fieldId, created);
  });
}
