import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { resolveProtocol1Type } from '../../catalogue/catalogue.js';
import { assertIncomingReferencesPermitType } from '../../catalogue/item-values.js';
import { ValueValidationError } from '../../catalogue/value-codec.js';
import { items } from '../../db/index.js';
import {
  activeFieldValueSchema,
  activeReplacementChanges,
  currentAuthoritativeFieldValues,
  storedFieldValues,
} from './active-catalogue-values.js';
import { moveOntoReplacements } from './catalogue-replacement-move.js';
import {
  assertCommandFieldValues,
  resolveActiveCommandType,
  resolveCommandCatalogue,
  resolveCommandType,
} from './command-catalogue.js';
import { requireItem, type CommandDb, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { itemFieldsBlobSchema } from './item-fields.js';
import { defineOp } from './op.js';
import { assertProtocol1Fields } from './protocol-1-fields.js';
import { upsertSearchIndex } from './search-index.js';

import type { PersistedItemType } from '../../catalogue/catalogue.js';

type ChangeTypeArgs = z.infer<typeof changeTypeArgs>;

interface ResolvedTypeChange {
  readonly type: PersistedItemType;
  readonly fields: FieldValues;
}

const changeTypeArgs = z.object({
  typeKey: z.string().min(1).optional(),
  typeId: z.string().min(1).optional(),
  fields: itemFieldsBlobSchema.optional(),
  values: z.array(activeFieldValueSchema).optional(),
});

/** `items.is_full` (0/1/null) as the wire boolean it represents. */
function isFullBoolean(isFull: number | null): boolean | null {
  if (isFull === null) return null;
  return isFull === 1;
}

/** Whether `itemId` still holds an active, non-tombstoned item directly. */
function hasActiveContents(db: CommandDb, itemId: string): boolean {
  const row = db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.containingItemId, itemId),
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active')
      )
    )
    .limit(1)
    .get();
  return row !== undefined;
}

function resolveLegacyTypeChange(db: CommandDb, args: ChangeTypeArgs): ResolvedTypeChange {
  if (args.typeId !== undefined || args.values !== undefined) {
    throw new CommandRejected('invalid', 'stable type and values require catalogueRevision');
  }
  if (args.typeKey === undefined || args.fields === undefined) {
    throw new CommandRejected('invalid', 'protocol 1 typeKey and fields are required');
  }
  const type = resolveProtocol1Type(db, args.typeKey);
  if (!type) throw new CommandRejected('type_unknown', `unknown type ${args.typeKey}`);
  assertProtocol1Fields(db, type.id, args.fields);
  return { type, fields: { typeKey: type.key, fields: args.fields } };
}

function resolveActiveTypeChange(
  db: CommandDb,
  itemId: string,
  revision: number,
  args: ChangeTypeArgs
): ResolvedTypeChange {
  if (args.typeKey !== undefined || args.fields !== undefined) {
    throw new CommandRejected('invalid', 'named type and fields are only supported by protocol 1');
  }
  if (args.typeId === undefined || args.values === undefined) {
    throw new CommandRejected('invalid', 'stable typeId and values are required');
  }
  const resolution = resolveCommandCatalogue(db, revision);
  const authored = storedFieldValues(args.values);
  resolveCommandType(resolution, args.typeId);
  const moved = moveOntoReplacements(resolution, {
    typeId: args.typeId,
    itemTypeId: null,
    values: authored,
  });
  const type = resolveActiveCommandType(resolution, moved.typeId ?? args.typeId);
  const values = moved.values;
  assertCommandFieldValues(
    db,
    resolution,
    { typeId: args.typeId, values: authored, existingItemId: itemId },
    { typeId: type.id, values, existingItemId: itemId }
  );
  return {
    type,
    fields: {
      typeId: type.id,
      ...activeReplacementChanges(currentAuthoritativeFieldValues(db, itemId), values),
    },
  };
}

function resolveTypeChange(
  db: CommandDb,
  itemId: string,
  revision: number | undefined,
  args: ChangeTypeArgs
): ResolvedTypeChange {
  return revision === undefined
    ? resolveLegacyTypeChange(db, args)
    : resolveActiveTypeChange(db, itemId, revision, args);
}

function assertTypeChangePermitted(
  db: CommandDb,
  row: ReturnType<typeof requireItem>,
  type: PersistedItemType
): void {
  try {
    assertIncomingReferencesPermitType(db, row.id, type.id);
  } catch (error) {
    if (error instanceof ValueValidationError) {
      throw new CommandRejected('invalid', error.message);
    }
    throw error;
  }
  if (
    row.isContainer === 1 &&
    !type.capabilities.includes('containment') &&
    hasActiveContents(db, row.id)
  ) {
    throw new CommandRejected('has_contents', `item ${row.id} still holds active contents`);
  }
}

/**
 * `item.changeType`: retype an item, replacing all its dynamic values. Protocol
 * 1 accepts `{ typeKey, fields }`; protocol 2 pins the active catalogue and
 * accepts `{ typeId, values }`. Unknown types are `type_unknown` and values
 * that do not fit the new type are `invalid`. `is_container`, `access` and `is_full` follow the
 * new type's capabilities (ADR-002 D1), never the client: losing containment
 * while the item still holds active contents is `has_contents`.
 */
export const itemChangeType = defineOp({
  op: 'item.changeType',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: changeTypeArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const { type, fields } = resolveTypeChange(
      ctx.db,
      row.id,
      ctx.mutation.catalogueRevision,
      args
    );
    assertTypeChangePermitted(ctx.db, row, type);
    const willContain = type.capabilities.includes('containment');

    const changes: FieldValues = {
      ...fields,
      isContainer: willContain,
      access: willContain ? (row.access ?? 'open') : null,
      isFull: willContain ? isFullBoolean(row.isFull) : null,
    };

    return {
      eventKind: 'type_changed',
      changes,
      effects(effectCtx) {
        upsertSearchIndex(effectCtx.db, {
          id: row.id,
          name: row.name,
          code: row.code,
          note: row.note,
          typeId: type.id,
          externalIds: row.externalIds,
        });
      },
    };
  },
});
