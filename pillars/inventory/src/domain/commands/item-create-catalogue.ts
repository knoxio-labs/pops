import {
  replaceItemFieldValues,
  replaceValidatedItemFieldValues,
  resolveProtocol1Type,
} from '../../catalogue/index.js';
import { moveOntoReplacements } from './catalogue-replacement-move.js';
import {
  assertCommandFieldValues,
  resolveActiveCommandType,
  resolveCommandCatalogue,
  resolveCommandType,
} from './command-catalogue.js';
import { CommandRejected } from './errors.js';
import { assertProtocol1Fields } from './protocol-1-fields.js';

import type { ItemFieldValueInput, PersistedItemType } from '../../catalogue/index.js';
import type { ActiveCreateFieldValue } from './active-catalogue-values.js';
import type { CommandDb } from './entities.js';

/** Catalogue-bearing subset of an item create input. */
export interface CreateCatalogueInput {
  readonly typeKey?: string | null;
  readonly typeId?: string | null;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly values?: readonly ActiveCreateFieldValue[];
}

/** Resolved legacy or stable-ID catalogue data for one item create. */
export type CreateCatalogue =
  | { readonly mode: 'legacy'; readonly type: PersistedItemType | undefined }
  | {
      readonly mode: 'active';
      readonly type: PersistedItemType | undefined;
      readonly revision: number;
      readonly values: readonly ItemFieldValueInput[];
    };

/** Inputs needed to persist a resolved create catalogue selection. */
export interface PersistCreateCatalogueValuesInput {
  readonly db: CommandDb;
  readonly itemId: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly catalogue: CreateCatalogue;
  readonly now: string;
}

function resolveLegacyType(db: CommandDb, input: CreateCatalogueInput): CreateCatalogue {
  if (input.typeId !== null && input.typeId !== undefined) {
    throw new CommandRejected('invalid', 'stable typeId requires catalogueRevision');
  }
  if (input.values !== undefined) {
    throw new CommandRejected('invalid', 'stable values require catalogueRevision');
  }
  const type = input.typeKey ? (resolveProtocol1Type(db, input.typeKey) ?? undefined) : undefined;
  if (input.typeKey && !type) {
    throw new CommandRejected('type_unknown', `unknown type ${input.typeKey}`);
  }
  if (type) assertProtocol1Fields(db, type.id, input.fields);
  else if (Object.keys(input.fields).length > 0) {
    throw new CommandRejected('invalid', 'an untyped item cannot carry fields');
  }
  return { mode: 'legacy', type };
}

/** Resolves and validates one create against legacy revision 1 or a safely rebased catalogue. */
export function resolveCreateCatalogue(
  db: CommandDb,
  input: CreateCatalogueInput,
  catalogueRevision: number | undefined
): CreateCatalogue {
  if (catalogueRevision === undefined) return resolveLegacyType(db, input);
  const resolution = resolveCommandCatalogue(db, catalogueRevision);
  if (input.typeKey !== null && input.typeKey !== undefined) {
    throw new CommandRejected('invalid', 'typeKey is only supported by protocol 1');
  }
  if (Object.keys(input.fields).length > 0) {
    throw new CommandRejected('invalid', 'named fields are only supported by protocol 1');
  }
  const values: ItemFieldValueInput[] = [...(input.values ?? [])];
  if (input.typeId === null || input.typeId === undefined) {
    if (values.length > 0)
      throw new CommandRejected('invalid', 'an untyped item cannot carry values');
    return {
      mode: 'active',
      type: undefined,
      revision: resolution.active.revision.revision,
      values,
    };
  }
  const moved = moveOntoReplacements(resolution, {
    typeId: input.typeId,
    itemTypeId: null,
    values,
  });
  resolveCommandType(resolution, input.typeId);
  const typeId = moved.typeId ?? input.typeId;
  const type = resolveActiveCommandType(resolution, typeId);
  assertCommandFieldValues(
    db,
    resolution,
    { typeId: input.typeId, values },
    { typeId, values: moved.values }
  );
  return {
    mode: 'active',
    type,
    revision: resolution.active.revision.revision,
    values: moved.values,
  };
}

/** Persists already-validated create values through the matching protocol path. */
export function persistCreateCatalogueValues({
  db,
  itemId,
  fields,
  catalogue,
  now,
}: PersistCreateCatalogueValuesInput): void {
  if (!catalogue.type) return;
  if (catalogue.mode === 'legacy') {
    replaceItemFieldValues(db, {
      itemId,
      typeId: catalogue.type.id,
      fields,
      catalogueRevision: catalogue.type.revision,
      now,
    });
    return;
  }
  replaceValidatedItemFieldValues(db, {
    itemId,
    typeId: catalogue.type.id,
    fields: catalogue.values,
    catalogueRevision: catalogue.revision,
    now,
  });
}
