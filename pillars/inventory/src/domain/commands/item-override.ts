import { z } from 'zod';

import { currentAuthoritativeFieldValues } from './active-catalogue-values.js';
import { catalogueChange } from './catalogue-change-reasons.js';
import { resolveCommandCatalogue, resolveCommandType } from './command-catalogue.js';
import { requireItem } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';
import { reindexItems } from './search-index.js';

import type { ItemFieldValueInput, PersistedItemTypeField } from '../../catalogue/index.js';
import type { CommandDb, FieldValues } from './entities.js';
import type { JsonValue } from './outcome.js';

const fieldIdSchema = z.string().uuid();
const setOverrideArgs = z.object({ fieldId: fieldIdSchema, values: z.array(z.json()).length(1) });
const clearOverrideArgs = z.object({ fieldId: fieldIdSchema });

type OverrideOperation = 'set' | 'clear';

interface OverrideFieldRequest {
  readonly db: CommandDb;
  readonly catalogueRevision: number | undefined;
  readonly typeId: string | null;
  readonly fieldId: string;
  readonly operation: OverrideOperation;
}

/**
 * Resolves the field an override mutation targets. Clearing an override only
 * ever moves an item toward its computed value, so it stays permitted even
 * once a later catalogue revision turns `allowOverride` off for a field some
 * item still holds an override for; setting a new override still requires
 * `allowOverride`.
 */
function requireOverrideField(request: OverrideFieldRequest): PersistedItemTypeField {
  const { db, catalogueRevision, typeId, fieldId, operation } = request;
  if (catalogueRevision === undefined) {
    throw new CommandRejected('invalid', 'override mutations require catalogueRevision');
  }
  if (typeId === null) throw new CommandRejected('type_unknown', 'an untyped item has no fields');
  const resolution = resolveCommandCatalogue(db, catalogueRevision);
  const type = resolveCommandType(resolution, typeId);
  if (!type.authored.effectiveFields.some((candidate) => candidate.id === fieldId)) {
    throw new CommandRejected('invalid', `field ${fieldId} is not declared`);
  }
  const field = type.active.effectiveFields.find((candidate) => candidate.id === fieldId);
  if (field === undefined) {
    throw new CommandRejected(
      'catalogue_repair_required',
      `field ${fieldId} is unavailable in the active catalogue; refresh and repair the mutation`,
      [
        catalogueChange(
          [resolution.active, resolution.authored],
          fieldId,
          'not_in_revision',
          resolution.active.revision.revision
        ),
      ]
    );
  }
  if (field.storage !== 'computed' || (operation === 'set' && !field.allowOverride)) {
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
    const field = requireOverrideField({
      db: ctx.db,
      catalogueRevision: ctx.mutation.catalogueRevision,
      typeId: row.typeId,
      fieldId: args.fieldId,
      operation: 'set',
    });
    return {
      eventKind: 'override_set',
      changes: overrideChanges(ctx.db, row.id, field, args.values),
      effects(effectCtx) {
        reindexItems(effectCtx.db, [row.id]);
      },
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
    const field = requireOverrideField({
      db: ctx.db,
      catalogueRevision: ctx.mutation.catalogueRevision,
      typeId: row.typeId,
      fieldId: args.fieldId,
      operation: 'clear',
    });
    return {
      eventKind: 'override_cleared',
      changes: overrideChanges(ctx.db, row.id, field, null),
      effects(effectCtx) {
        reindexItems(effectCtx.db, [row.id]);
      },
    };
  },
});
