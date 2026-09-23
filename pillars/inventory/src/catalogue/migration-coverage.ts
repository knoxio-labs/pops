import { CatalogueApiError } from './authoring-types.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { classifyCatalogueCompatibility } from './compatibility.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { CatalogueIssue } from './authoring-types.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';
import type { CatalogueMigration } from './migration-types.js';

/** Server-derived definitions that a catalogue migration must cover exactly. */
export interface RequiredMigrationCoverage {
  readonly affectedTypeIds: readonly string[];
  readonly affectedFieldIds: readonly string[];
  readonly fieldTypeIds: ReadonlyMap<string, string>;
}

interface DefinitionOwners {
  readonly definitionTypeIds: Map<string, string>;
  readonly definitionFieldIds: Map<string, string>;
  readonly fieldTypeIds: Map<string, string>;
}

/** Creates a structured issue for migration manifest and step validation. */
export function migrationValidationIssue(
  path: string,
  code: string,
  message: string
): CatalogueIssue {
  return { definitionId: null, path, code, message };
}

function indexField(owners: DefinitionOwners, typeId: string, field: PersistedItemTypeField): void {
  owners.definitionTypeIds.set(field.id, typeId);
  owners.definitionFieldIds.set(field.id, field.id);
  owners.fieldTypeIds.set(field.id, typeId);
  for (const option of field.enumOptions) {
    owners.definitionTypeIds.set(option.id, typeId);
    owners.definitionFieldIds.set(option.id, field.id);
  }
}

function definitionOwners(catalogues: readonly PersistedCatalogue[]): DefinitionOwners {
  const owners: DefinitionOwners = {
    definitionTypeIds: new Map(),
    definitionFieldIds: new Map(),
    fieldTypeIds: new Map(),
  };
  for (const catalogue of catalogues) {
    for (const type of catalogue.types) {
      owners.definitionTypeIds.set(type.id, type.id);
      for (const field of type.fields) indexField(owners, type.id, field);
    }
  }
  return owners;
}

function requiredCoverage(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  compatibility: CatalogueCompatibilityResult
): RequiredMigrationCoverage {
  const owners = definitionOwners([base, candidate]);
  const affectedTypeIds = new Set<string>();
  const affectedFieldIds = new Set<string>();
  for (const change of compatibility.changes) {
    if (change.classification !== 'migration_required') continue;
    const typeId = owners.definitionTypeIds.get(change.definitionId);
    const fieldId = owners.definitionFieldIds.get(change.definitionId);
    if (typeId !== undefined) affectedTypeIds.add(typeId);
    if (fieldId !== undefined) affectedFieldIds.add(fieldId);
  }
  return {
    affectedTypeIds: [...affectedTypeIds].toSorted(),
    affectedFieldIds: [...affectedFieldIds].toSorted(),
    fieldTypeIds: owners.fieldTypeIds,
  };
}

function compareCoverage(
  path: 'affectedTypeIds' | 'affectedFieldIds',
  declared: readonly string[],
  required: readonly string[]
): CatalogueIssue[] {
  const declaredSet = new Set(declared);
  const requiredSet = new Set(required);
  const issues: CatalogueIssue[] = [];
  if (declaredSet.size !== declared.length) {
    issues.push(
      migrationValidationIssue(path, 'duplicate_definition', `${path} contains duplicate ids`)
    );
  }
  for (const id of requiredSet) {
    if (!declaredSet.has(id)) {
      issues.push(
        migrationValidationIssue(path, 'affected_definition_missing', `${path} omits ${id}`)
      );
    }
  }
  for (const id of declaredSet) {
    if (!requiredSet.has(id)) {
      issues.push(
        migrationValidationIssue(path, 'affected_definition_unrelated', `${path} includes ${id}`)
      );
    }
  }
  return issues;
}

/** Validates revisions and exact manifest coverage against the persisted catalogue diff. */
export function validateMigrationHeader(
  db: CommandDb,
  migration: CatalogueMigration,
  candidate: PersistedCatalogue
): RequiredMigrationCoverage {
  if (
    candidate.revision.revision !== migration.toRevision ||
    candidate.revision.baseRevision !== migration.fromRevision
  ) {
    throw new CatalogueApiError(
      400,
      'migration_revision_mismatch',
      `Migration ${migration.name} does not match the candidate revision`
    );
  }
  const base = loadPublishedCatalogue(db, migration.fromRevision);
  if (base === null) {
    throw new CatalogueApiError(
      400,
      'migration_revision_mismatch',
      `Migration ${migration.name} base revision is not published`
    );
  }
  const compatibility = classifyCatalogueCompatibility(base, candidate);
  if (compatibility.classification !== 'migration_required') {
    throw new CatalogueApiError(
      400,
      'migration_not_required',
      'The actual catalogue diff does not require a migration'
    );
  }
  const coverage = requiredCoverage(base, candidate, compatibility);
  const issues = [
    ...compareCoverage('affectedTypeIds', migration.affectedTypeIds, coverage.affectedTypeIds),
    ...compareCoverage('affectedFieldIds', migration.affectedFieldIds, coverage.affectedFieldIds),
  ];
  if (issues.length > 0) {
    throw new CatalogueApiError(
      400,
      'migration_coverage_mismatch',
      'Migration coverage must exactly match the catalogue diff',
      issues
    );
  }
  return coverage;
}
