/** The absent and cleared field vectors, and each computed-field state. */
import { computedValueOf, fieldValueOf, projectItem } from './projection.js';

import type { CommandDb } from '../../../domain/commands/entities.js';
import type { ValueVectorCatalogue } from './catalogue.js';
import type { FixtureEngine } from './fixture-engine.js';
import type { ValueVector } from './types.js';

/**
 * Protocol 2 has no `null` primitive and no empty `many`: a field without a
 * value is absent from `fieldValues`.
 */
function absentFieldVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): ValueVector {
  const fieldId = catalogue.fieldIds.shortTextOne;
  const created = engine.createItem(
    catalogue,
    catalogue.liveRevision,
    'no value set for shortTextOne',
    []
  );
  const item = projectItem(db, created.itemId);
  return {
    name: 'short_text one absent (no value ever set)',
    kind: 'short_text',
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

/** A value removed by `item.edit` (`values: null`) leaves the field absent. */
function clearedFieldVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): ValueVector {
  const fieldId = catalogue.fieldIds.shortTextOne;
  const created = engine.createItem(catalogue, catalogue.liveRevision, 'shortTextOne cleared', [
    { fieldId, values: ['Bulb'] },
  ]);
  const command = engine.clearField(catalogue.liveRevision, created.itemId, fieldId);
  const item = projectItem(db, created.itemId);
  return {
    name: 'short_text one cleared by an edit',
    kind: 'short_text',
    cardinality: 'one',
    storage: 'stored',
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: fieldValueOf(item, fieldId),
    computedValue: null,
    command,
  };
}

/** An expression that fails on its own inputs: unavailable with no missing inputs. */
function computedOverflowVector(
  db: CommandDb,
  catalogue: ValueVectorCatalogue,
  integerOneVector: ValueVector
): ValueVector {
  const fieldId = catalogue.fieldIds.computedOverflow;
  const item = projectItem(db, integerOneVector.itemId);
  return {
    name: 'computed field unavailable: evaluation error',
    kind: 'integer',
    cardinality: 'one',
    storage: 'computed',
    fieldId,
    itemId: integerOneVector.itemId,
    item,
    fieldValue: null,
    computedValue: computedValueOf(item, fieldId),
    command: integerOneVector.command,
  };
}

/** ok — the vector that already carries `integerOne` also evaluates `computedField` to `ok`. */
function computedOkVector(
  db: CommandDb,
  catalogue: ValueVectorCatalogue,
  integerOneVector: ValueVector
): ValueVector {
  const fieldId = catalogue.fieldIds.computedField;
  const item = projectItem(db, integerOneVector.itemId);
  return {
    name: 'computed field ok',
    kind: 'integer',
    cardinality: 'one',
    storage: 'computed',
    fieldId,
    itemId: integerOneVector.itemId,
    item,
    fieldValue: null,
    computedValue: computedValueOf(item, fieldId),
    command: integerOneVector.command,
  };
}

/** overridden — no dependency value at all, but an explicit override supersedes evaluation entirely. */
function computedOverriddenVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): ValueVector {
  const fieldId = catalogue.fieldIds.computedField;
  const created = engine.createItem(catalogue, catalogue.liveRevision, 'computed overridden', []);
  const overrideEntry = engine.overrideComputedField(
    catalogue.liveRevision,
    created.itemId,
    fieldId,
    [999]
  );
  const item = projectItem(db, created.itemId);
  return {
    name: 'computed field overridden',
    kind: 'integer',
    cardinality: 'one',
    storage: 'computed',
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: null,
    computedValue: computedValueOf(item, fieldId),
    command: overrideEntry,
  };
}

/** unavailable — the dependency was never set and there is no override, so evaluation reports `missing_dependency`. */
function computedUnavailableVector(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue
): ValueVector {
  const fieldId = catalogue.fieldIds.computedField;
  const created = engine.createItem(catalogue, catalogue.liveRevision, 'computed unavailable', []);
  const item = projectItem(db, created.itemId);
  return {
    name: 'computed field unavailable: missing input',
    kind: 'integer',
    cardinality: 'one',
    storage: 'computed',
    fieldId,
    itemId: created.itemId,
    item,
    fieldValue: null,
    computedValue: computedValueOf(item, fieldId),
    command: created.command,
  };
}

/** Builds the absent, cleared and computed-state vectors. */
export function buildAbsentAndComputedVectors(
  db: CommandDb,
  engine: FixtureEngine,
  catalogue: ValueVectorCatalogue,
  integerOneVector: ValueVector
): readonly ValueVector[] {
  return [
    absentFieldVector(db, engine, catalogue),
    clearedFieldVector(db, engine, catalogue),
    computedOkVector(db, catalogue, integerOneVector),
    computedOverflowVector(db, catalogue, integerOneVector),
    computedOverriddenVector(db, engine, catalogue),
    computedUnavailableVector(db, engine, catalogue),
  ];
}
