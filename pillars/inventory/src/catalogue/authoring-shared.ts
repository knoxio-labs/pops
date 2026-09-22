import { CatalogueApiError } from './authoring-types.js';
import { loadCatalogue } from './catalogue.js';

import type { fieldEnumOptions, itemTypeFields, itemTypes } from '../db/schema.js';
import type { CommandDb } from '../domain/commands/index.js';
import type { CatalogueIssue, CatalogueOptionWire } from './authoring-types.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';

export function issue(
  definitionId: string | null,
  path: string,
  code: string,
  message: string
): CatalogueIssue {
  return { definitionId, path, code, message };
}

export function failIssues(issues: readonly CatalogueIssue[]): never {
  throw new CatalogueApiError(
    400,
    'catalogue_validation_failed',
    'Catalogue validation failed',
    issues
  );
}

export function requireCatalogue(
  db: CommandDb,
  revision: number,
  statuses: readonly ('draft' | 'published' | 'abandoned')[]
): PersistedCatalogue {
  const catalogue = loadCatalogue(db, revision, statuses);
  if (catalogue === null) {
    throw new CatalogueApiError(
      404,
      'catalogue_revision_unknown',
      `Catalogue revision ${revision} was not found`
    );
  }
  return catalogue;
}

export function currentPublished(db: CommandDb): PersistedCatalogue {
  const catalogue = loadCatalogue(db, undefined, ['published']);
  if (catalogue === null) throw new Error('inventory has no published catalogue');
  return catalogue;
}

export function requireCurrentDraft(
  db: CommandDb,
  revision: number,
  baseRevision: number
): PersistedCatalogue {
  const draft = requireCatalogue(db, revision, ['draft']);
  if (draft.revision.baseRevision !== baseRevision) {
    throw new CatalogueApiError(409, 'catalogue_conflict', 'The draft base revision is stale');
  }
  const current = currentPublished(db);
  if (current.revision.revision !== baseRevision) {
    throw new CatalogueApiError(409, 'catalogue_conflict', 'The published catalogue has changed');
  }
  return draft;
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function persistedTypeRow(
  revision: number,
  input: {
    readonly id: string;
    readonly key: string;
    readonly label: string;
    readonly description: string | null;
    readonly sortOrder: number;
    readonly capabilities: readonly string[];
    readonly legacyLabels: readonly string[];
    readonly presentation: Record<string, unknown>;
    readonly archivedAt: string | null;
  }
): typeof itemTypes.$inferInsert {
  return {
    revision,
    id: input.id,
    key: input.key,
    label: input.label,
    description: input.description,
    sortOrder: input.sortOrder,
    capabilitiesJson: json(input.capabilities),
    legacyLabelsJson: json(input.legacyLabels),
    presentationJson: json(input.presentation),
    archivedAt: input.archivedAt,
  };
}

export function persistedFieldRow(
  revision: number,
  input: {
    readonly id: string;
    readonly typeId: string;
    readonly key: string;
    readonly label: string;
    readonly help: string | null;
    readonly sortOrder: number;
    readonly kind: PersistedItemTypeField['kind'];
    readonly cardinality: PersistedItemTypeField['cardinality'];
    readonly required: boolean;
    readonly storage: PersistedItemTypeField['storage'];
    readonly fixedUnit: string | null;
    readonly referenceKinds: readonly ('item' | 'location')[];
    readonly referenceTypeIds: readonly string[];
    readonly expressionVersion: number | null;
    readonly expression: unknown | null;
    readonly allowOverride: boolean;
    readonly presentation: Record<string, unknown>;
    readonly archivedAt: string | null;
  }
): typeof itemTypeFields.$inferInsert {
  return {
    revision,
    id: input.id,
    typeId: input.typeId,
    key: input.key,
    label: input.label,
    help: input.help,
    sortOrder: input.sortOrder,
    kind: input.kind,
    cardinality: input.cardinality,
    required: input.required ? 1 : 0,
    storage: input.storage,
    fixedUnit: input.fixedUnit,
    referenceKindsJson: json(input.referenceKinds),
    referenceTypeIdsJson: json(input.referenceTypeIds),
    expressionVersion: input.expressionVersion,
    expressionJson: input.expression === null ? null : json(input.expression),
    allowOverride: input.allowOverride ? 1 : 0,
    presentationJson: json(input.presentation),
    archivedAt: input.archivedAt,
  };
}

export function persistedOptionRow(
  revision: number,
  input: CatalogueOptionWire & { readonly fieldId: string }
): typeof fieldEnumOptions.$inferInsert {
  return {
    revision,
    id: input.id,
    fieldId: input.fieldId,
    key: input.key,
    label: input.label,
    sortOrder: input.sortOrder,
    archivedAt: input.archivedAt,
  };
}

export function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value))
  );
}

export function existingOrNew<T>(
  id: string | undefined,
  find: (value: string) => T | undefined
): T | undefined {
  return id === undefined ? undefined : find(id);
}
