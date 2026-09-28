import type { CatalogueField, CatalogueType } from './types';

interface TestTypeOptions {
  readonly archivedAt?: string | null;
  readonly fields?: readonly CatalogueField[];
}

/** Builds the smallest complete field fixture needed by type-tree editor tests. */
export function testField(
  id: string,
  typeId: string,
  key: string,
  overrides: Partial<CatalogueField> = {}
): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key,
    kind: 'short_text',
    label: key,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
    ...overrides,
  };
}

/** Builds a complete catalogue type fixture with the requested tree position. */
export function testType(
  id: string,
  label: string,
  parentTypeId: string | null,
  { archivedAt = null, fields = [] }: TestTypeOptions = {}
): CatalogueType {
  return {
    archivedAt,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label,
    legacyLabels: [],
    parentTypeId,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}
