import { choose, definitionText } from './authoring-put-shared.js';
import { failIssues, issue } from './authoring-shared.js';
import { asCardinality, asPrimitiveKind, asStorage } from './catalogue-field-shape.js';

import type { itemTypeFields } from '../db/schema.js';
import type { DraftOperation } from './authoring-types.js';
import type { PersistedItemTypeField } from './catalogue-types.js';

export interface FieldValues {
  readonly key: string;
  readonly label: string;
  readonly kind: PersistedItemTypeField['kind'];
  readonly cardinality: PersistedItemTypeField['cardinality'];
  readonly storage: PersistedItemTypeField['storage'];
  readonly required: boolean;
  readonly fixedUnit: string | null;
  readonly referenceKinds: readonly ('item' | 'location')[];
  readonly referenceTypeIds: readonly string[];
  readonly expressionVersion: number | null;
  readonly expression: unknown | null;
  readonly allowOverride: boolean;
  readonly presentation: Record<string, unknown>;
  readonly archivedAt: string | null;
}

type FieldDefaults = Omit<FieldValues, 'key' | 'label'>;

function fieldDefaults(
  current: typeof itemTypeFields.$inferSelect | undefined,
  id: string
): FieldDefaults {
  if (current === undefined) {
    return {
      kind: 'short_text',
      cardinality: 'one',
      storage: 'stored',
      required: false,
      fixedUnit: null,
      referenceKinds: [],
      referenceTypeIds: [],
      expressionVersion: null,
      expression: null,
      allowOverride: false,
      presentation: {},
      archivedAt: null,
    };
  }
  return {
    kind: asPrimitiveKind(current.kind, id),
    cardinality: asCardinality(current.cardinality, id),
    storage: asStorage(current.storage, id),
    required: current.required === 1,
    fixedUnit: current.fixedUnit,
    referenceKinds: JSON.parse(current.referenceKindsJson) as ('item' | 'location')[],
    referenceTypeIds: JSON.parse(current.referenceTypeIdsJson) as string[],
    expressionVersion: current.expressionVersion,
    expression: current.expressionJson === null ? null : JSON.parse(current.expressionJson),
    allowOverride: current.allowOverride === 1,
    presentation: JSON.parse(current.presentationJson) as Record<string, unknown>,
    archivedAt: current.archivedAt,
  };
}

function assertImmutableFieldShape(
  id: string,
  current: typeof itemTypeFields.$inferSelect | undefined,
  operation: Extract<DraftOperation, { kind: 'put_field' }>,
  defaults: FieldDefaults
): void {
  const changes = [
    operation.fieldKind !== undefined && operation.fieldKind !== defaults.kind
      ? ['fieldKind', 'Field kind cannot be changed in place']
      : null,
    operation.cardinality !== undefined && operation.cardinality !== defaults.cardinality
      ? ['cardinality', 'Field cardinality cannot be changed in place']
      : null,
    operation.storage !== undefined && operation.storage !== defaults.storage
      ? ['storage', 'Field storage mode cannot be changed in place']
      : null,
    operation.fixedUnit !== undefined && operation.fixedUnit !== current?.fixedUnit
      ? ['fixedUnit', 'Field units cannot be changed in place']
      : null,
  ].filter((change): change is [string, string] => change !== null);
  const firstChange = changes[0];
  if (current && firstChange !== undefined) {
    const [path, message] = firstChange;
    failIssues([issue(id, path, 'immutable_shape', message)]);
  }
}

interface StorageShapeContext {
  readonly id: string;
  readonly storage: PersistedItemTypeField['storage'];
  readonly expressionVersion: number | null;
  readonly expression: unknown | null;
  readonly allowOverride: boolean;
}

function assertStorageShape(context: StorageShapeContext): void {
  if (
    context.storage === 'computed' &&
    (context.expressionVersion === null || context.expression === null)
  ) {
    failIssues([
      issue(
        context.id,
        'expression',
        'computed_expression_required',
        'Computed fields require a versioned expression'
      ),
    ]);
  }
  if (
    context.storage === 'stored' &&
    (context.expressionVersion !== null || context.expression !== null || context.allowOverride)
  ) {
    failIssues([
      issue(
        context.id,
        'storage',
        'stored_expression',
        'Stored fields cannot declare computed expressions'
      ),
    ]);
  }
}

export function fieldValues(
  id: string,
  current: typeof itemTypeFields.$inferSelect | undefined,
  operation: Extract<DraftOperation, { kind: 'put_field' }>
): FieldValues {
  const defaults = fieldDefaults(current, id);
  assertImmutableFieldShape(id, current, operation, defaults);
  const expression = choose(operation.expression, defaults.expression);
  const expressionVersion = choose(operation.expressionVersion, defaults.expressionVersion);
  const allowOverride = choose(operation.allowOverride, defaults.allowOverride);
  const values = {
    ...defaults,
    ...operation,
    key: definitionText({
      id,
      proposed: operation.key,
      current: current?.key,
      path: 'key',
      label: 'Field key',
    }),
    label: definitionText({
      id,
      proposed: operation.label,
      current: current?.label,
      path: 'label',
      label: 'Field label',
    }),
    kind: choose(operation.fieldKind, defaults.kind),
    cardinality: choose(operation.cardinality, defaults.cardinality),
    storage: choose(operation.storage, defaults.storage),
    expressionVersion,
    expression,
    allowOverride,
    fixedUnit: choose(operation.fixedUnit, defaults.fixedUnit),
    referenceKinds: choose(operation.referenceKinds, defaults.referenceKinds),
    referenceTypeIds: choose(operation.referenceTypeIds, defaults.referenceTypeIds),
    required: choose(operation.required, defaults.required),
    presentation: choose(operation.presentation, defaults.presentation),
    archivedAt: choose(operation.archivedAt, defaults.archivedAt),
  };
  assertStorageShape({ id, storage: values.storage, expressionVersion, expression, allowOverride });
  return values;
}
