import {
  classifyCatalogueCompatibility,
  ItemFieldSetError,
  loadPublishedCatalogue,
  validateItemFieldValuesForType,
  ValueValidationError,
} from '../../catalogue/index.js';
import { CommandRejected } from './errors.js';

import type {
  ItemFieldValueInput,
  PersistedCatalogue,
  PersistedItemType,
} from '../../catalogue/index.js';
import type { CommandDb } from './entities.js';

/** The immutable authored snapshot and current snapshot used to judge one command. */
export interface CommandCatalogueResolution {
  readonly authored: PersistedCatalogue;
  readonly active: PersistedCatalogue;
  readonly rebased: boolean;
}

function ordinaryRejection(error: ItemFieldSetError | ValueValidationError): CommandRejected {
  if (error instanceof ValueValidationError) {
    const reason =
      error.code === 'target_missing' || error.code === 'reference_type_mismatch'
        ? error.code
        : 'invalid';
    return new CommandRejected(reason, error.message);
  }
  return new CommandRejected('invalid', error.message);
}

function incompatibleChanges(authored: PersistedCatalogue, active: PersistedCatalogue): string[] {
  return classifyCatalogueCompatibility(authored, active)
    .changes.filter(
      (change) => change.code !== 'base_revision_mismatch' && change.classification !== 'compatible'
    )
    .map((change) => change.code);
}

/** Resolves an authored revision to the active catalogue only when the schema can be rebased safely. */
export function resolveCommandCatalogue(
  db: CommandDb,
  authoredRevision: number
): CommandCatalogueResolution {
  const active = loadPublishedCatalogue(db);
  if (!active) throw new CommandRejected('type_unknown', 'no published catalogue exists');
  const authored = loadPublishedCatalogue(db, authoredRevision);
  if (!authored) {
    throw new CommandRejected(
      'catalogue_update_required',
      `catalogue revision ${authoredRevision} is unavailable; refresh catalogue definitions`
    );
  }
  if (authoredRevision === active.revision.revision) {
    return { authored, active, rebased: false };
  }
  const incompatible = incompatibleChanges(authored, active);
  if (authoredRevision > active.revision.revision || incompatible.length > 0) {
    const details = incompatible.length > 0 ? ` (${incompatible.join(', ')})` : '';
    throw new CommandRejected(
      'catalogue_update_required',
      `catalogue revision ${authoredRevision} cannot be rebased to ${active.revision.revision}${details}; refresh catalogue definitions`
    );
  }
  return { authored, active, rebased: true };
}

/** Resolves the same stable type identity in both the authored and active snapshots. */
export function resolveCommandType(
  resolution: CommandCatalogueResolution,
  typeId: string
): { readonly authored: PersistedItemType; readonly active: PersistedItemType } {
  const authored = resolution.authored.types.find((entry) => entry.id === typeId);
  if (!authored) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
  const active = resolution.active.types.find((entry) => entry.id === typeId);
  if (!active) {
    throw new CommandRejected(
      'catalogue_repair_required',
      `type ${typeId} is unavailable in the active catalogue; refresh and repair the mutation`
    );
  }
  return { authored, active };
}

/** Validates authored values first, then proves that the same values remain valid after rebase. */
export function assertCommandFieldValues(
  db: CommandDb,
  resolution: CommandCatalogueResolution,
  input: {
    readonly typeId: string;
    readonly values: readonly ItemFieldValueInput[];
    readonly existingItemId?: string;
  }
): void {
  const type = resolveCommandType(resolution, input.typeId);
  try {
    validateItemFieldValuesForType(db, type.authored, input.values, input.existingItemId);
  } catch (error) {
    if (error instanceof ItemFieldSetError || error instanceof ValueValidationError) {
      throw ordinaryRejection(error);
    }
    throw error;
  }
  if (!resolution.rebased) return;
  try {
    validateItemFieldValuesForType(db, type.active, input.values, input.existingItemId);
  } catch (error) {
    if (error instanceof ItemFieldSetError || error instanceof ValueValidationError) {
      throw new CommandRejected(
        'catalogue_repair_required',
        `${error.message}; refresh catalogue definitions and repair the mutation`
      );
    }
    throw error;
  }
}
