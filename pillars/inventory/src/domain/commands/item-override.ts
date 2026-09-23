import { z } from 'zod';

import {
  currentAuthoritativeFieldValues,
  requireActiveCatalogue,
} from './active-catalogue-values.js';
import { requireItem } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';

import type { ItemFieldValueInput, PersistedItemTypeField } from '../../catalogue/index.js';
import type { CommandDb, FieldValues } from './entities.js';
import type { JsonValue } from './outcome.js';

const fieldIdSchema = z.string().uuid();
const setOverrideArgs = z.object({ fieldId: fieldIdSchema, values: z.array(z.json()).length(1) });
const clearOverrideArgs = z.object({ fieldId: fieldIdSchema });

function requireOverrideField(
  db: CommandDb,
  catalogueRevision: number | undefined,
  typeId: string | null,
  fieldId: string
): PersistedItemTypeField {
  if (catalogueRevision === undefined) {
    throw new CommandRejected('invalid', 'override mutations require catalogueRevision');
  }
  if (typeId === null) throw new CommandRejected('type_unknown', 'an untyped item has no fields');
  const catalogue = requireActiveCatalogue(db, catalogueRevision);
  const type = catalogue.types.find((candidate) => candidate.id === typeId);
  if (type === undefined) throw new CommandRejected('type_unknown', `unknown type ${typeId}`);
  const field = type.fields.find((candidate) => candidate.id === fieldId);
  if (field === undefined) throw new CommandRejected('invalid', `field ${fieldId} is not declared`);
  if (field.storage !== 'computed' || !field.allowOverride) {
    throw new CommandRejected('invalid', `field ${fieldId} does not permit an override`);
  }
  return field;
}

function overrideChanges(
  db: CommandDb,
  itemId: string,
  field: PersistedItemTypeField,
  values: readonly JsonValue[] | null
): FieldValues {
  const current: readonly ItemFieldValueInput[] = currentAuthoritativeFieldValues(db, itemId);
  const override = current.find(
    (entry) => entry.fieldId === field.id && entry.source === 'override'
  );
  if (values === null && override === undefined) return {};
  return { [field.id]: values === null ? null : [...values] };
}

/** Sets one canonical value that supersedes an overridable computed field. */
export const itemSetOverride = defineOp({
  op: 'item.setOverride',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: setOverrideArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const field = requireOverrideField(
      ctx.db,
      ctx.mutation.catalogueRevision,
      row.typeId,
      args.fieldId
    );
    return {
      eventKind: 'override_set',
      changes: overrideChanges(ctx.db, row.id, field, args.values),
    };
  },
});

/** Removes an explicit computed-field override so evaluation resumes immediately. */
export const itemClearOverride = defineOp({
  op: 'item.clearOverride',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: clearOverrideArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const field = requireOverrideField(
      ctx.db,
      ctx.mutation.catalogueRevision,
      row.typeId,
      args.fieldId
    );
    return {
      eventKind: 'override_cleared',
      changes: overrideChanges(ctx.db, row.id, field, null),
    };
  },
});
