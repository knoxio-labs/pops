import type { PersistedItemType, PersistedItemTypeField } from './catalogue-types.js';
import type { CatalogueCompatibilityChange } from './compatibility-types.js';

function change(
  classification: CatalogueCompatibilityChange['classification'],
  definitionId: string,
  code: string
): CatalogueCompatibilityChange {
  return { classification, definitionId, code };
}

function sameStrings(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function compareOptions(
  base: PersistedItemTypeField,
  candidate: PersistedItemTypeField
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  const candidateById = new Map(candidate.enumOptions.map((option) => [option.id, option]));
  for (const option of base.enumOptions) {
    const next = candidateById.get(option.id);
    if (!next) {
      changes.push(change('forbidden', option.id, 'published_option_removed'));
      continue;
    }
    if (next.key.toLowerCase() !== option.key.toLowerCase()) {
      changes.push(change('forbidden', option.id, 'published_option_key_changed'));
    }
    if (option.archivedAt === null && next.archivedAt !== null) {
      changes.push(change('compatible', option.id, 'option_archived'));
    }
  }
  for (const option of candidate.enumOptions) {
    const baseWithKey = base.enumOptions.find(
      (entry) => entry.key.toLowerCase() === option.key.toLowerCase()
    );
    if (baseWithKey && baseWithKey.id !== option.id) {
      changes.push(change('forbidden', option.id, 'published_option_key_reused'));
    } else if (!baseWithKey) {
      changes.push(change('compatible', option.id, 'option_added'));
    }
  }
  return changes;
}

function immutableShapeChanged(
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

/** Collects compatibility changes for fields that exist in both snapshots. */
export function comparePersistedFields(
  base: PersistedItemTypeField,
  candidate: PersistedItemTypeField
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  if (base.key.toLowerCase() !== candidate.key.toLowerCase()) {
    changes.push(change('forbidden', base.id, 'published_field_key_changed'));
  }
  if (immutableShapeChanged(base, candidate)) {
    changes.push(change('forbidden', base.id, 'published_field_shape_changed'));
  }
  if (!base.required && candidate.required) {
    changes.push(change('migration_required', base.id, 'field_became_required'));
  }
  if (
    base.expressionJson !== candidate.expressionJson ||
    base.allowOverride !== candidate.allowOverride
  ) {
    changes.push(change('migration_required', base.id, 'computed_definition_changed'));
  }
  if (base.archivedAt === null && candidate.archivedAt !== null) {
    changes.push(change('compatible', base.id, 'field_archived'));
  }
  changes.push(...compareOptions(base, candidate));
  return changes;
}

/** Collects compatibility changes for fields introduced by a candidate snapshot. */
export function compareAddedFields(
  base: PersistedItemType,
  candidate: PersistedItemType,
  baseKinds: ReadonlySet<string>
): CatalogueCompatibilityChange[] {
  const changes: CatalogueCompatibilityChange[] = [];
  const baseIds = new Set(base.fields.map((field) => field.id));
  for (const field of candidate.fields.filter((entry) => !baseIds.has(entry.id))) {
    if (field.required || field.storage === 'computed') {
      changes.push(change('migration_required', field.id, 'non_optional_field_added'));
    } else if (!baseKinds.has(field.kind)) {
      changes.push(change('protocol_gated', field.id, 'primitive_kind_added'));
    } else {
      changes.push(change('compatible', field.id, 'optional_field_added'));
    }
  }
  return changes;
}
