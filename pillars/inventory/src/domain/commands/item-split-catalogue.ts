import {
  copyItemFieldValues,
  loadProtocol1Fields,
  replaceValidatedItemFieldValues,
  resolveProtocol1TypeById,
} from '../../catalogue/index.js';
import { activeStoredChanges, currentAuthoritativeFieldValues } from './active-catalogue-values.js';
import {
  assertCommandFieldValues,
  resolveCommandCatalogue,
  resolveCommandType,
} from './command-catalogue.js';
import { CommandRejected } from './errors.js';
import { protocol1FieldsAsJson } from './protocol-1-fields.js';

import type { ItemFieldValueInput } from '../../catalogue/index.js';
import type { ItemRow } from '../../db/index.js';
import type { CommandDb, FieldValues } from './entities.js';

/** Catalogue values and event fields resolved for one split command. */
export interface ResolvedSplitCatalogue {
  readonly mode: 'legacy' | 'active';
  readonly changes: FieldValues;
  readonly activeValues?: readonly ItemFieldValueInput[];
  readonly activeRevision?: number;
}

function legacySplitFields(db: CommandDb, row: ItemRow): FieldValues {
  const fields = protocol1FieldsAsJson(loadProtocol1Fields(db, row.id));
  if (row.typeId === null) return { typeKey: null, fields };
  const type = resolveProtocol1TypeById(db, row.typeId);
  if (!type) throw new CommandRejected('type_unknown', `unknown type ${row.typeId}`);
  return { typeKey: type.key, fields };
}

function activeSplitFields(db: CommandDb, row: ItemRow, revision: number): ResolvedSplitCatalogue {
  const resolution = resolveCommandCatalogue(db, revision);
  const values = currentAuthoritativeFieldValues(db, row.id);
  const fieldValues = activeStoredChanges(values);
  if (row.typeId === null) return { mode: 'active', changes: { typeId: null, ...fieldValues } };
  const type = resolveCommandType(resolution, row.typeId).active;
  assertCommandFieldValues(db, resolution, { typeId: type.id, values });
  return {
    mode: 'active',
    changes: { typeId: type.id, ...fieldValues },
    activeValues: values,
    activeRevision: resolution.active.revision.revision,
  };
}

/** Resolves split values through the legacy or authored-revision command path. */
export function resolveSplitCatalogue(
  db: CommandDb,
  row: ItemRow,
  revision: number | undefined
): ResolvedSplitCatalogue {
  return revision === undefined
    ? { mode: 'legacy', changes: legacySplitFields(db, row) }
    : activeSplitFields(db, row, revision);
}

/** Persists a split copy with the active revision used by a safe rebase. */
export function persistSplitCatalogue(input: {
  readonly db: CommandDb;
  readonly row: ItemRow;
  readonly newItemId: string;
  readonly catalogue: ResolvedSplitCatalogue;
  readonly now: string;
}): void {
  const { db, row, newItemId, catalogue, now } = input;
  if (catalogue.mode === 'legacy') {
    copyItemFieldValues(db, { fromItemId: row.id, toItemId: newItemId, now });
  } else if (
    row.typeId !== null &&
    catalogue.activeValues !== undefined &&
    catalogue.activeRevision !== undefined
  ) {
    replaceValidatedItemFieldValues(db, {
      itemId: newItemId,
      typeId: row.typeId,
      fields: catalogue.activeValues,
      catalogueRevision: catalogue.activeRevision,
      now,
    });
  }
}
