import {
  catalogueChange,
  fieldIn,
  firstRevisionWhere,
  typeIn,
} from './catalogue-change-reasons.js';

import type {
  ItemFieldSetError,
  ItemFieldValueInput,
  PersistedCatalogue,
  ValueValidationError,
} from '../../catalogue/index.js';
import type { CatalogueChange } from './catalogue-change.js';
import type { CommandDb } from './entities.js';

interface RepairContext {
  readonly db: CommandDb;
  readonly authored: PersistedCatalogue;
  readonly active: PersistedCatalogue;
}

function dated(
  context: RepairContext,
  id: string,
  change: CatalogueChange['change'],
  holds: (catalogue: PersistedCatalogue) => boolean
): CatalogueChange {
  const revision = firstRevisionWhere(context.db, context.authored, context.active, holds);
  return catalogueChange([context.active, context.authored], id, change, revision);
}

function retiredOption(
  context: RepairContext,
  fieldId: string,
  values: readonly ItemFieldValueInput[]
): CatalogueChange {
  const archived = new Set(
    fieldIn(context.active, fieldId)
      ?.enumOptions.filter((option) => option.archivedAt !== null)
      .map((option) => option.id) ?? []
  );
  const optionId = values
    .filter((entry) => entry.fieldId === fieldId)
    .flatMap((entry) => entry.values)
    .map((value) =>
      typeof value === 'object' && value !== null && 'optionId' in value ? value.optionId : null
    )
    .find((id): id is string => typeof id === 'string' && archived.has(id));
  if (optionId === undefined) return dated(context, fieldId, 'redefined', () => false);
  return dated(context, optionId, 'retired', (catalogue) =>
    (fieldIn(catalogue, fieldId)?.enumOptions ?? []).some(
      (option) => option.id === optionId && option.archivedAt !== null
    )
  );
}

function redefinedField(context: RepairContext, fieldId: string): CatalogueChange {
  const before = JSON.stringify(fieldIn(context.authored, fieldId) ?? null);
  return dated(
    context,
    fieldId,
    'redefined',
    (catalogue) => JSON.stringify(fieldIn(catalogue, fieldId) ?? null) !== before
  );
}

/**
 * Which definition made the rebased values fail validation against the
 * active catalogue, and in which revision that changed.
 */
export function repairRequiredChange(
  context: RepairContext,
  input: { readonly typeId: string; readonly values: readonly ItemFieldValueInput[] },
  error: ItemFieldSetError | ValueValidationError
): CatalogueChange {
  const id = error.fieldId;
  switch (error.code) {
    case 'type_archived':
      return dated(context, id, 'archived', (c) => (typeIn(c, id)?.archivedAt ?? null) !== null);
    case 'field_archived':
      return dated(context, id, 'archived', (c) => (fieldIn(c, id)?.archivedAt ?? null) !== null);
    case 'required_missing':
      return dated(context, id, 'now_required', (c) => fieldIn(c, id)?.required === true);
    case 'field_unknown':
      return catalogueChange(
        [context.active, context.authored],
        id,
        'not_in_revision',
        context.active.revision.revision
      );
    case 'enum_option_archived':
      return retiredOption(context, id, input.values);
    default:
      return redefinedField(context, id);
  }
}

/** The type the change names is missing from the active catalogue. */
export function typeNotInRevision(
  context: Pick<RepairContext, 'authored' | 'active'>,
  typeId: string
): CatalogueChange {
  return catalogueChange(
    [context.active, context.authored],
    typeId,
    'not_in_revision',
    context.active.revision.revision
  );
}
