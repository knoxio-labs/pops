import { compareAddedFields, comparePersistedFields } from './compatibility-fields.js';

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
  baseKinds: ReadonlySet<string>,
  changes: CatalogueCompatibilityChange[]
): void {
  if (base.key.toLowerCase() !== candidate.key.toLowerCase()) {
    addChange(changes, 'forbidden', base.id, 'published_type_key_changed');
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
    changes.push(...comparePersistedFields(field, next));
  }
  changes.push(...compareAddedFields(base, candidate, baseKinds));
}

/** Collects every compatibility change between two complete catalogue snapshots. */
export function collectCatalogueChanges(
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
  const baseKinds = new Set(base.types.flatMap((type) => type.fields.map((field) => field.kind)));
  const candidateTypes = new Map(candidate.types.map((type) => [type.id, type]));
  for (const type of base.types) {
    const next = candidateTypes.get(type.id);
    if (!next) {
      addChange(changes, 'forbidden', type.id, 'published_type_removed');
      continue;
    }
    compareType(type, next, baseKinds, changes);
  }
  for (const type of candidate.types) {
    const sameKey = base.types.find((entry) => entry.key.toLowerCase() === type.key.toLowerCase());
    if (sameKey && sameKey.id !== type.id) {
      addChange(changes, 'forbidden', type.id, 'published_type_key_reused');
    } else if (!base.types.some((entry) => entry.id === type.id)) {
      addChange(changes, 'compatible', type.id, 'type_added');
    }
  }
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
