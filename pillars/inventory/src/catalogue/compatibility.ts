import type {
  PersistedCatalogue,
  PersistedItemType,
  PersistedItemTypeField,
} from './catalogue-types.js';
import type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
  CatalogueCompatibilityResult,
} from './compatibility-types.js';

export type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
  CatalogueCompatibilityResult,
} from './compatibility-types.js';

const RANK: Record<CatalogueCompatibilityClassification, number> = {
  compatible: 0,
  protocol_gated: 1,
  migration_required: 2,
  forbidden: 3,
};

function sameStrings(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function addChange(
  changes: CatalogueCompatibilityChange[],
  classification: CatalogueCompatibilityClassification,
  definitionId: string,
  code: string
): void {
  changes.push({ classification, definitionId, code });
}

function compareOptions(
  base: PersistedItemTypeField,
  candidate: PersistedItemTypeField,
  changes: CatalogueCompatibilityChange[]
): void {
  const candidateById = new Map(candidate.enumOptions.map((option) => [option.id, option]));
  for (const option of base.enumOptions) {
    const next = candidateById.get(option.id);
    if (!next) {
      addChange(changes, 'forbidden', option.id, 'published_option_removed');
      continue;
    }
    if (next.key.toLowerCase() !== option.key.toLowerCase()) {
      addChange(changes, 'forbidden', option.id, 'published_option_key_changed');
    }
    if (option.archivedAt === null && next.archivedAt !== null) {
      addChange(changes, 'compatible', option.id, 'option_archived');
    }
  }
  for (const option of candidate.enumOptions) {
    const baseWithKey = base.enumOptions.find(
      (entry) => entry.key.toLowerCase() === option.key.toLowerCase()
    );
    if (baseWithKey && baseWithKey.id !== option.id) {
      addChange(changes, 'forbidden', option.id, 'published_option_key_reused');
    } else if (!baseWithKey) {
      addChange(changes, 'compatible', option.id, 'option_added');
    }
  }
}

function immutableFieldShapeChanged(
  base: PersistedItemTypeField,
  candidate: PersistedItemTypeField
): boolean {
  return (
    base.kind !== candidate.kind ||
    base.cardinality !== candidate.cardinality ||
    base.storage !== candidate.storage ||
    base.fixedUnit !== candidate.fixedUnit ||
    !sameStrings(base.referenceKinds, candidate.referenceKinds) ||
    !sameStrings(base.referenceTypeIds, candidate.referenceTypeIds)
  );
}

function compareField(
  base: PersistedItemTypeField,
  candidate: PersistedItemTypeField,
  changes: CatalogueCompatibilityChange[]
): void {
  if (base.key.toLowerCase() !== candidate.key.toLowerCase()) {
    addChange(changes, 'forbidden', base.id, 'published_field_key_changed');
  }
  if (immutableFieldShapeChanged(base, candidate)) {
    addChange(changes, 'forbidden', base.id, 'published_field_shape_changed');
  }
  if (!base.required && candidate.required) {
    addChange(changes, 'migration_required', base.id, 'field_became_required');
  }
  if (
    base.expressionJson !== candidate.expressionJson ||
    base.allowOverride !== candidate.allowOverride
  ) {
    addChange(changes, 'migration_required', base.id, 'computed_definition_changed');
  }
  if (base.archivedAt === null && candidate.archivedAt !== null) {
    addChange(changes, 'compatible', base.id, 'field_archived');
  }
  compareOptions(base, candidate, changes);
}

function compareAddedFields(
  base: PersistedItemType,
  candidate: PersistedItemType,
  baseKinds: ReadonlySet<string>,
  changes: CatalogueCompatibilityChange[]
): void {
  const baseIds = new Set(base.fields.map((field) => field.id));
  for (const field of candidate.fields.filter((entry) => !baseIds.has(entry.id))) {
    if (field.required || field.storage === 'computed') {
      addChange(changes, 'migration_required', field.id, 'non_optional_field_added');
    } else if (!baseKinds.has(field.kind)) {
      addChange(changes, 'protocol_gated', field.id, 'primitive_kind_added');
    } else {
      addChange(changes, 'compatible', field.id, 'optional_field_added');
    }
  }
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
    compareField(field, next, changes);
  }
  compareAddedFields(base, candidate, baseKinds, changes);
}

/**
 * Classifies a complete candidate snapshot against its published base.
 * Published identities are immutable; replacements use new ids plus an
 * explicit migration rather than mutating the old definition in place.
 */
export function classifyCatalogueCompatibility(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): CatalogueCompatibilityResult {
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
  const classification = changes.reduce<CatalogueCompatibilityClassification>(
    (highest, change) =>
      RANK[change.classification] > RANK[highest] ? change.classification : highest,
    'compatible'
  );
  return {
    classification,
    affectedIds: [...new Set(changes.map((change) => change.definitionId))].toSorted(),
    changes,
  };
}
