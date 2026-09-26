/**
 * Protocol-2 value vectors (POPS-4403): every primitive kind, cardinality and
 * reference/computed state a value can take, written through the real command
 * engine and projected by `toSyncItem`, the function a production sync page
 * uses. Inventory's drift test, BFM's contract test and the iOS client's
 * transport-to-replica round trip all read the committed file.
 */
import { PRIMITIVE_KINDS } from '../../../catalogue/value-types.js';
import { buildAbsentAndComputedVectors } from './build-computed-vectors.js';
import { buildKindVectors } from './build-kind-vectors.js';
import {
  buildReferenceEdgeVectors,
  createReferenceEdgeTargets,
} from './build-reference-edge-vectors.js';
import { KIND_FIELDS } from './catalogue-fields.js';
import {
  authorLiveValueVectorCatalogue,
  catalogueDescriptor,
  retireEnumOptionGamma,
} from './catalogue.js';
import { createDeterministicIds } from './deterministic-ids.js';
import { createFixtureEngine } from './fixture-engine.js';
import { buildNegativeValueVectors } from './negative-vectors.js';
import { computedValueOf, fieldValueOf, projectItem } from './projection.js';
import { referenceTargetsOf, referenceValuesOf } from './reference-values.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { ValueVector, ValueVectorFile } from './types.js';

export type {
  NegativeValueVector,
  ValueVector,
  ValueVectorCommand,
  ValueVectorFile,
  ValueVectorReferenceTarget,
} from './types.js';

/**
 * Re-projects a vector once every write has landed, so each item has one
 * projection across every vector that names it and every target shows its
 * final state.
 */
function finalState(db: CommandDb, vector: ValueVector): ValueVector {
  const item = projectItem(db, vector.itemId);
  const fieldValue = fieldValueOf(item, vector.fieldId);
  return {
    ...vector,
    item,
    fieldValue: vector.storage === 'stored' ? fieldValue : null,
    computedValue: vector.storage === 'computed' ? computedValueOf(item, vector.fieldId) : null,
    ...(vector.kind === 'reference' && vector.referenceTargets === undefined
      ? { referenceTargets: referenceTargetsOf(db, referenceValuesOf(fieldValue)) }
      : {}),
  };
}

/** Refuses to emit a file that leaves a primitive kind or allowed cardinality uncovered. */
function assertCoverage(vectors: readonly ValueVector[]): void {
  const covered = new Set(vectors.map((vector) => `${vector.kind}/${vector.cardinality}`));
  for (const kind of PRIMITIVE_KINDS) {
    const cardinalities = KIND_FIELDS[kind].many === null ? ['one'] : ['one', 'many'];
    for (const cardinality of cardinalities) {
      if (!covered.has(`${kind}/${cardinality}`)) {
        throw new Error(`value vectors cover no ${kind} ${cardinality} value`);
      }
    }
  }
}

function buildPositiveValueVectors(
  db: CommandDb,
  engine: ReturnType<typeof createFixtureEngine>,
  live: ReturnType<typeof authorLiveValueVectorCatalogue>
): readonly ValueVector[] {
  const liveTargetItemId = engine.createItem(
    live,
    live.liveRevision,
    'Live reference target',
    []
  ).itemId;
  const liveLocationId = engine.createLiveLocation('Live reference location');
  const edgeTargets = createReferenceEdgeTargets(engine, live);
  const kindVectors = buildKindVectors(db, engine, live, { liveTargetItemId, liveLocationId });
  const referenceEdgeVectors = buildReferenceEdgeVectors(db, engine, live, edgeTargets);
  const integerOne = kindVectors.find((vector) => vector.fieldId === live.fieldIds.integerOne);
  if (!integerOne) throw new Error('no integer one vector');
  return [
    ...kindVectors,
    ...referenceEdgeVectors,
    ...buildAbsentAndComputedVectors(db, engine, live, integerOne),
  ];
}

/** Builds the committed file from a freshly migrated database. */
export function buildValueVectors(db: CommandDb): ValueVectorFile {
  const nextId = createDeterministicIds();
  const engine = createFixtureEngine(db, nextId);
  const live = authorLiveValueVectorCatalogue(db);
  const written = buildPositiveValueVectors(db, engine, live);
  const negativeVectors = buildNegativeValueVectors(
    engine,
    live,
    catalogueDescriptor(db, live.liveRevision).types.find((type) => type.id === live.typeId)
      ?.fields[0] ?? missing('the vector type')
  );
  const catalogue = retireEnumOptionGamma(db, live);
  const vectors = written.map((vector) => finalState(db, vector));
  assertCoverage(vectors);

  return {
    version: 1,
    liveRevision: catalogue.liveRevision,
    currentRevision: catalogue.currentRevision,
    typeId: catalogue.typeId,
    catalogues: [
      catalogueDescriptor(db, catalogue.liveRevision),
      catalogueDescriptor(db, catalogue.currentRevision),
    ],
    vectors,
    negativeVectors,
  };
}

function missing(what: string): never {
  throw new Error(`value-vector build is missing ${what}`);
}
