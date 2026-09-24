import { failIssues, issue } from './authoring-shared.js';
import { ExpressionValidationError } from './expression-types.js';
import { validateCatalogueExpressions } from './expression-validator.js';

import type { CatalogueIssue } from './authoring-types.js';
import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';

interface KeyDefinition {
  readonly id: string;
  readonly key: string;
  readonly path: string;
  readonly label: string;
}

function duplicateKey(
  keys: Map<string, string>,
  definition: KeyDefinition,
  issues: CatalogueIssue[]
): void {
  const normalized = definition.key.toLocaleLowerCase();
  const previous = keys.get(normalized);
  if (previous !== undefined)
    issues.push(
      issue(
        definition.id,
        definition.path,
        'duplicate_key',
        `${definition.label} duplicates ${previous}`
      )
    );
  keys.set(normalized, definition.id);
}

function validateOptions(field: PersistedItemTypeField, issues: CatalogueIssue[]): void {
  if (field.kind !== 'enum' && field.enumOptions.length > 0) {
    issues.push(
      issue(
        field.id,
        'enumOptions',
        'enum_options_forbidden',
        'Only enum fields may declare options'
      )
    );
  }
  const optionKeys = new Map<string, string>();
  for (const option of field.enumOptions) {
    duplicateKey(
      optionKeys,
      { id: option.id, key: option.key, path: 'key', label: 'Enum option key' },
      issues
    );
  }
}

function validateReferenceShape(
  field: PersistedItemTypeField,
  typeIds: ReadonlySet<string>,
  issues: CatalogueIssue[]
): void {
  if (
    field.kind !== 'reference' &&
    (field.referenceKinds.size > 0 || field.referenceTypeIds.size > 0)
  ) {
    issues.push(
      issue(
        field.id,
        'referenceKinds',
        'reference_forbidden',
        'Only reference fields may constrain targets'
      )
    );
  }
  if (field.kind === 'reference' && field.referenceKinds.size === 0) {
    issues.push(
      issue(
        field.id,
        'referenceKinds',
        'reference_kinds_required',
        'Reference fields must allow at least one target kind (item or location)'
      )
    );
  }
  if ([...field.referenceTypeIds].some((id) => !typeIds.has(id))) {
    issues.push(
      issue(field.id, 'referenceTypeIds', 'type_unknown', 'Reference target type does not exist')
    );
  }
}

function validateStorageShape(field: PersistedItemTypeField, issues: CatalogueIssue[]): void {
  if (
    field.storage === 'stored' &&
    (field.expressionVersion !== null || field.expressionJson !== null || field.allowOverride)
  ) {
    issues.push(
      issue(
        field.id,
        'storage',
        'stored_expression',
        'Stored fields cannot declare computed expressions'
      )
    );
  }
  if (
    field.storage === 'computed' &&
    (field.expressionVersion === null || field.expressionJson === null)
  ) {
    issues.push(
      issue(
        field.id,
        'expression',
        'computed_expression_required',
        'Computed fields require a versioned expression'
      )
    );
  }
}

function validateField(
  field: PersistedItemTypeField,
  type: PersistedItemType,
  typeIds: ReadonlySet<string>,
  issues: CatalogueIssue[]
): void {
  if (field.typeId !== type.id || !typeIds.has(field.typeId)) {
    issues.push(issue(field.id, 'typeId', 'type_unknown', 'Field parent type does not exist'));
  }
  if (field.kind === 'boolean' && field.cardinality !== 'one') {
    issues.push(issue(field.id, 'cardinality', 'boolean_many', 'Boolean fields cannot be many'));
  }
  if (field.kind === 'measurement' && field.fixedUnit === null) {
    issues.push(
      issue(field.id, 'fixedUnit', 'unit_required', 'Measurement fields require a fixed unit')
    );
  }
  if (field.kind !== 'measurement' && field.fixedUnit !== null) {
    issues.push(
      issue(field.id, 'fixedUnit', 'unit_forbidden', 'Only measurements may declare a fixed unit')
    );
  }
  validateReferenceShape(field, typeIds, issues);
  validateStorageShape(field, issues);
  validateOptions(field, issues);
}

function validateType(
  type: PersistedItemType,
  typeIds: ReadonlySet<string>,
  issues: CatalogueIssue[]
): void {
  const fieldKeys = new Map<string, string>();
  const fieldIds = new Set(type.fields.map((field) => field.id));
  for (const field of type.fields) {
    duplicateKey(
      fieldKeys,
      { id: field.id, key: field.key, path: 'key', label: 'Field key' },
      issues
    );
    validateField(field, type, typeIds, issues);
  }
  if (fieldIds.size !== type.fields.length) {
    issues.push(
      issue(type.id, 'fields', 'duplicate_id', 'Type contains duplicate field identities')
    );
  }
}

/** Validates uniqueness and cross-definition invariants before publication. */
export function validateCatalogue(catalogue: PersistedCatalogue): void {
  const issues: CatalogueIssue[] = [];
  const typeKeys = new Map<string, string>();
  const typeIds = new Set(catalogue.types.map((type) => type.id));
  for (const type of catalogue.types) {
    duplicateKey(typeKeys, { id: type.id, key: type.key, path: 'key', label: 'Type key' }, issues);
    validateType(type, typeIds, issues);
  }
  if (issues.length === 0) {
    try {
      validateCatalogueExpressions(catalogue);
    } catch (error) {
      if (!(error instanceof ExpressionValidationError)) throw error;
      issues.push(issue(error.definitionId, error.path, error.code, error.message));
    }
  }
  if (issues.length > 0) failIssues(issues);
}
