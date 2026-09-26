import { descendantIds } from './catalogue-tree.js';
import {
  compareAddedFields,
  compareNewTypeFields,
  comparePersistedFields,
} from './compatibility-fields.js';

import type { PersistedCatalogue, PersistedItemType } from './catalogue-types.js';
import type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
} from './compatibility-types.js';

const RANK: Record<CatalogueCompatibilityClassification, number> = {
  compatible: 0,
  protocol_gated: 1,
  migration_required: 2,
  forbidden: 3,
};

const MIGRATION_FIELD_CODES = new Set([
  'computed_overrides_in_use',
  'field_became_required',
  'non_optional_field_added',
]);

function addChange(
  changes: CatalogueCompatibilityChange[],
  classification: CatalogueCompatibilityClassification,
  definitionId: string,
  code: string
): void {
  changes.push({ classification, definitionId, code });
}

function compareType(
  base: PersistedItemType,
  candidate: PersistedItemType,
  context: {
    readonly baseKinds: ReadonlySet<string>;
    readonly fieldsHoldingOverrides: ReadonlySet<string>;
  },
  changes: CatalogueCompatibilityChange[]
): void {
  if (base.key.toLowerCase() !== candidate.key.toLowerCase()) {
    addChange(changes, 'forbidden', base.id, 'published_type_key_changed');
  }
  if (base.parentTypeId !== candidate.parentTypeId) {
    addChange(changes, 'forbidden', base.id, 'published_type_parent_changed');
  }
  const capabilitiesChanged =
    base.capabilities.length !== candidate.capabilities.length ||
    base.capabilities.some((capability) => !candidate.capabilities.includes(capability));
  if (capabilitiesChanged) {
    addChange(changes, 'migration_required', base.id, 'type_capabilities_changed');
  }
  if (base.archivedAt === null && candidate.archivedAt !== null) {
    addChange(changes, 'compatible', base.id, 'type_archived');
  }
  const candidateFields = new Map(candidate.fields.map((field) => [field.id, field]));
  for (const field of base.fields) {
    const next = candidateFields.get(field.id);
    if (!next) {
      addChange(changes, 'forbidden', field.id, 'published_field_removed');
      continue;
    }
    changes.push(...comparePersistedFields(field, next, context.fieldsHoldingOverrides));
  }
  changes.push(...compareAddedFields(base, candidate, context.baseKinds));
}

function revisionChanges(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  if (candidate.revision.baseRevision !== base.revision.revision) {
    addChange(changes, 'forbidden', String(candidate.revision.revision), 'base_revision_mismatch');
  }
  if (candidate.revision.minimumProtocol < base.revision.minimumProtocol) {
    addChange(
      changes,
      'forbidden',
      String(candidate.revision.revision),
      'minimum_protocol_decreased'
    );
  } else if (candidate.revision.minimumProtocol > base.revision.minimumProtocol) {
    addChange(
      changes,
      'protocol_gated',
      String(candidate.revision.revision),
      'minimum_protocol_increased'
    );
  }
  return changes;
}

function existingTypeChanges(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  baseKinds: ReadonlySet<string>,
  fieldsHoldingOverrides: ReadonlySet<string>
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  const candidateTypes = new Map(candidate.types.map((type) => [type.id, type]));
  for (const type of base.types) {
    const next = candidateTypes.get(type.id);
    if (next === undefined) {
      addChange(changes, 'forbidden', type.id, 'published_type_removed');
      continue;
    }
    compareType(type, next, { baseKinds, fieldsHoldingOverrides }, changes);
  }
  return changes;
}

function newTypeChanges(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  baseKinds: ReadonlySet<string>
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  for (const type of candidate.types) {
    const sameKey = base.types.find((entry) => entry.key.toLowerCase() === type.key.toLowerCase());
    if (sameKey !== undefined && sameKey.id !== type.id) {
      addChange(changes, 'forbidden', type.id, 'published_type_key_reused');
      continue;
    }
    if (base.types.some((entry) => entry.id === type.id)) continue;
    addChange(changes, 'compatible', type.id, 'type_added');
    if (type.parentTypeId !== null) {
      addChange(changes, 'protocol_gated', type.id, 'type_parent_set');
    }
    changes.push(...compareNewTypeFields(type, baseKinds));
  }
  return changes;
}

function migrationTypeId(
  candidate: PersistedCatalogue,
  change: CatalogueCompatibilityChange
): string | undefined {
  if (candidate.types.some((type) => type.id === change.definitionId)) return change.definitionId;
  if (!MIGRATION_FIELD_CODES.has(change.code)) return undefined;
  return candidate.types
    .flatMap((type) => type.fields)
    .find((field) => field.id === change.definitionId)?.typeId;
}

function migrationThroughSubtypeChanges(
  candidate: PersistedCatalogue,
  changes: readonly CatalogueCompatibilityChange[]
): CatalogueCompatibilityChange[] {
  const restrictions: CatalogueCompatibilityChange[] = [];
  for (const change of changes) {
    if (change.classification !== 'migration_required') continue;
    const typeId = migrationTypeId(candidate, change);
    if (typeId === undefined || descendantIds(candidate.types, typeId).length === 0) continue;
    restrictions.push({
      classification: 'forbidden',
      definitionId: change.definitionId,
      code: 'migration_through_subtypes_unsupported',
    });
  }
  return restrictions;
}

/**
 * Collects every compatibility change between two complete catalogue snapshots.
 * `fieldsHoldingOverrides` names computed fields on which a live item holds an
 * override; disabling overrides on one of them needs a migration.
 */
export function collectCatalogueChanges(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  fieldsHoldingOverrides: ReadonlySet<string>
): CatalogueCompatibilityChange[] {
  const changes = revisionChanges(base, candidate);
  const baseKinds = new Set(base.types.flatMap((type) => type.fields.map((field) => field.kind)));
  changes.push(...existingTypeChanges(base, candidate, baseKinds, fieldsHoldingOverrides));
  changes.push(...newTypeChanges(base, candidate, baseKinds));
  changes.push(...migrationThroughSubtypeChanges(candidate, changes));
  return changes;
}

/** Returns the most restrictive classification among a set of compatibility changes. */
export function highestCompatibilityClassification(
  changes: readonly CatalogueCompatibilityChange[]
): CatalogueCompatibilityClassification {
  return changes.reduce<CatalogueCompatibilityClassification>(
    (highest, change) =>
      RANK[change.classification] > RANK[highest] ? change.classification : highest,
    'compatible'
  );
}
