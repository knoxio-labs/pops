import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from '../catalogue-types.js';
import type {
  ExpressionSnapshot,
  ExpressionV1,
  ExpressionValueType,
  ValidatedExpression,
} from '../expression-types.js';

/** Creates a complete field definition for expression-core tests. */
export function expressionField(
  overrides: Partial<PersistedItemTypeField> = {}
): PersistedItemTypeField {
  return {
    allowOverride: false,
    archivedAt: null,
    archivedEnumOptionIds: new Set(),
    cardinality: 'one',
    enumOptionIds: new Set(),
    enumOptions: [],
    expressionJson: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id: 'field',
    key: 'field',
    kind: 'decimal',
    label: 'Field',
    presentation: {},
    referenceKinds: new Set(),
    referenceTypeIds: new Set(),
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: 'type',
    ...overrides,
  };
}

/** Creates a complete type definition for expression-core tests. */
export function expressionType(
  id: string,
  fields: readonly PersistedItemTypeField[]
): PersistedItemType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields,
    id,
    key: id,
    label: id,
    legacyLabels: [],
    presentation: {},
    revision: 1,
    sortOrder: 0,
  };
}

/** Creates a complete catalogue snapshot for expression-core tests. */
export function expressionCatalogue(types: readonly PersistedItemType[]): PersistedCatalogue {
  return {
    revision: {
      baseRevision: null,
      minimumProtocol: 2,
      revision: 1,
      status: 'published',
    },
    types,
  };
}

/** Creates a validated wrapper when a test exercises evaluation independently of validation. */
export function validatedExpression(
  ast: ExpressionV1,
  resultType: ExpressionValueType = { kind: 'decimal', fixedUnit: null }
): ValidatedExpression {
  return {
    ast,
    dependencies: [],
    field: { typeId: 'type', fieldId: 'computed' },
    resultType,
  };
}

/** Creates a snapshot backed by immutable in-memory test items. */
export function expressionSnapshot(
  items: ReadonlyMap<string, ReturnType<ExpressionSnapshot['readItem']>>,
  rootItemId = 'root'
): ExpressionSnapshot {
  return {
    rootItemId,
    readItem: (itemId) => items.get(itemId) ?? { state: 'missing' },
    readField: (itemId, fieldId) => {
      const item = items.get(itemId);
      return item?.state === 'resolved' ? item.item.fields.get(fieldId) : undefined;
    },
  };
}
