import { CatalogueApiError } from './authoring-types.js';
import { descendantIds } from './catalogue-tree.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { findDiscardedOverrides } from './compatibility-preview.js';
import { classifyCatalogueCompatibility } from './compatibility.js';
import { addEffectiveFieldCoverage } from './migration-coverage-fields.js';
import { compareMigrationCoverage } from './migration-coverage-issues.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';
import type { CatalogueMigration } from './migration-types.js';

/** Server-derived definitions that a catalogue migration must cover exactly. */
export interface RequiredMigrationCoverage {
  readonly affectedTypeIds: readonly string[];
  readonly selectedTypeIds: readonly string[];
  readonly affectedFieldIds: readonly string[];
  readonly fieldTypeIds: ReadonlyMap<string, string>;
  readonly baseEffectiveFieldIds: ReadonlyMap<string, ReadonlySet<string>>;
  readonly candidateEffectiveFieldIds: ReadonlyMap<string, ReadonlySet<string>>;
}

interface DefinitionOwners {
  readonly definitionTypeIds: Map<string, string>;
  readonly definitionFieldIds: Map<string, string>;
  readonly fieldTypeIds: Map<string, string>;
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

function effectiveFieldIds(
  catalogue: PersistedCatalogue
): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(
    catalogue.types.map((type) => [type.id, new Set(type.effectiveFields.map((field) => field.id))])
  );
}

function selectedTypeIds(
  catalogue: PersistedCatalogue,
  affectedTypeIds: readonly string[]
): readonly string[] {
  return [
    ...new Set(
      affectedTypeIds.flatMap((typeId) => [typeId, ...descendantIds(catalogue.types, typeId)])
    ),
  ].toSorted();
}

function addCompatibilityCoverage(
  compatibility: CatalogueCompatibilityResult,
  owners: DefinitionOwners,
  affectedTypeIds: Set<string>,
  affectedFieldIds: Set<string>
): void {
  for (const change of compatibility.changes) {
    if (change.classification !== 'migration_required') continue;
    const typeId = owners.definitionTypeIds.get(change.definitionId);
    const fieldId = owners.definitionFieldIds.get(change.definitionId);
    if (typeId !== undefined) affectedTypeIds.add(typeId);
    if (fieldId !== undefined) affectedFieldIds.add(fieldId);
  }
}

function requiredCoverage(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  compatibility: CatalogueCompatibilityResult
): RequiredMigrationCoverage {
  const owners = definitionOwners([base, candidate]);
  const affectedTypeIds = new Set<string>();
  const affectedFieldIds = new Set<string>();
  addCompatibilityCoverage(compatibility, owners, affectedTypeIds, affectedFieldIds);
  const affectedTypeIdList = [...affectedTypeIds].toSorted();
  const selectedTypeIdList = selectedTypeIds(candidate, affectedTypeIdList);
  const candidateFieldsById = new Map(
    candidate.types.flatMap((type) => type.fields).map((field) => [field.id, field])
  );
  const baseEffectiveFieldIds = effectiveFieldIds(base);
  const candidateEffectiveFieldIds = effectiveFieldIds(candidate);
  addEffectiveFieldCoverage(
    selectedTypeIdList,
    {
      candidateFieldsById,
      fieldTypeIds: owners.fieldTypeIds,
      baseEffectiveFieldIds,
      candidateEffectiveFieldIds,
    },
    affectedFieldIds
  );
  return {
    affectedTypeIds: affectedTypeIdList,
    selectedTypeIds: selectedTypeIdList,
    affectedFieldIds: [...affectedFieldIds].toSorted(),
    fieldTypeIds: owners.fieldTypeIds,
    baseEffectiveFieldIds,
    candidateEffectiveFieldIds,
  };
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
  const compatibility = classifyCatalogueCompatibility(
    base,
    candidate,
    new Set(findDiscardedOverrides(db, base, candidate).map((entry) => entry.fieldId))
  );
  if (compatibility.classification !== 'migration_required') {
    throw new CatalogueApiError(
      400,
      'migration_not_required',
      'The actual catalogue diff does not require a migration'
    );
  }
  const coverage = requiredCoverage(base, candidate, compatibility);
  const issues = [
    ...compareMigrationCoverage(
      'affectedTypeIds',
      migration.affectedTypeIds,
      coverage.affectedTypeIds
    ),
    ...compareMigrationCoverage(
      'affectedFieldIds',
      migration.affectedFieldIds,
      coverage.affectedFieldIds
    ),
  ];
  if (issues.length > 0) {
    throw new CatalogueApiError(
      400,
      'migration_coverage_mismatch',
      'Migration coverage must exactly match the catalogue diff',
      { issues }
    );
  }
  return coverage;
}
