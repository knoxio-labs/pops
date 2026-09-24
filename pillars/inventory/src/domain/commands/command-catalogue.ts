import {
  classifyCatalogueCompatibility,
  ItemFieldSetError,
  loadPublishedCatalogue,
  validateItemFieldValuesForType,
  ValueValidationError,
} from '../../catalogue/index.js';
import { revisionUnavailable, updateRequiredChanges } from './catalogue-change-reasons.js';
import { repairRequiredChange, typeNotInRevision } from './catalogue-repair-reasons.js';
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
      `catalogue revision ${authoredRevision} is unavailable; refresh catalogue definitions`,
      [revisionUnavailable(authoredRevision)]
    );
  }
  if (authoredRevision === active.revision.revision) {
    return { authored, active, rebased: false };
  }
  const incompatible = incompatibleChanges(authored, active);
  if (authoredRevision > active.revision.revision || incompatible.length > 0) {
    const details = incompatible.length > 0 ? ` (${incompatible.join(', ')})` : '';
    const changes =
      authoredRevision > active.revision.revision
        ? [revisionUnavailable(authoredRevision)]
        : updateRequiredChanges(db, authored, active);
    throw new CommandRejected(
      'catalogue_update_required',
      `catalogue revision ${authoredRevision} cannot be rebased to ${active.revision.revision}${details}; refresh catalogue definitions`,
      changes
    );
  }
  return { authored, active, rebased: true };
}

/** The type `typeId` as the active snapshot defines it. */
export function resolveActiveCommandType(
  resolution: CommandCatalogueResolution,
  typeId: string
): PersistedItemType {
  const active = resolution.active.types.find((entry) => entry.id === typeId);
  if (!active) {
    throw new CommandRejected(
      'catalogue_repair_required',
      `type ${typeId} is unavailable in the active catalogue; refresh and repair the mutation`,
      [typeNotInRevision(resolution, typeId)]
    );
  }
  return active;
}

/** Resolves the same stable type identity in both the authored and active snapshots. */
export function resolveCommandType(
  resolution: CommandCatalogueResolution,
  typeId: string
): { readonly authored: PersistedItemType; readonly active: PersistedItemType } {
  const authored = resolution.authored.types.find((entry) => entry.id === typeId);
  if (!authored) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
  return { authored, active: resolveActiveCommandType(resolution, typeId) };
}

/** A command's type and values as validated against one snapshot. */
export interface CommandFieldValues {
  readonly typeId: string;
  readonly values: readonly ItemFieldValueInput[];
  readonly existingItemId?: string;
}

/**
 * Validates authored values first, then proves that the values remain valid
 * after rebase: `input` as it was authored, or `rebased`, the same command
 * moved onto replacements (`moveOntoReplacements`), when it moved.
 */
export function assertCommandFieldValues(
  db: CommandDb,
  resolution: CommandCatalogueResolution,
  input: CommandFieldValues,
  rebased: CommandFieldValues = input
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
  const active = resolveActiveCommandType(resolution, rebased.typeId);
  try {
    validateItemFieldValuesForType(db, active, rebased.values, rebased.existingItemId);
  } catch (error) {
    if (error instanceof ItemFieldSetError || error instanceof ValueValidationError) {
      throw new CommandRejected(
        'catalogue_repair_required',
        `${error.message}; refresh catalogue definitions and repair the mutation`,
        [repairRequiredChange({ db, ...resolution }, rebased, error)]
      );
    }
    throw error;
  }
}
