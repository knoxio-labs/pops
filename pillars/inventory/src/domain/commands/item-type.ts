import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  assertIncomingReferencesPermitType,
  resolveProtocol1Type,
  ValueValidationError,
} from '../../catalogue/index.js';
import { items } from '../../db/index.js';
import { requireItem, type CommandDb, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { itemFieldsBlobSchema } from './item-fields.js';
import { defineOp } from './op.js';
import { assertProtocol1Fields } from './protocol-1-fields.js';
import { upsertSearchIndex } from './search-index.js';

const changeTypeArgs = z.object({ typeKey: z.string().min(1), fields: itemFieldsBlobSchema });

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

/**
 * `item.changeType { typeKey, fields }`: retype an item, replacing its
 * `fields` blob wholesale (unlike `item.edit`, which patches it). `typeKey`
 * unknown to the catalogue is `type_unknown`; `fields` that do not fit the
 * new type is `invalid`. `is_container`, `access` and `is_full` follow the
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
    const type = resolveProtocol1Type(ctx.db, args.typeKey);
    if (!type) throw new CommandRejected('type_unknown', `unknown type ${args.typeKey}`);
    try {
      assertIncomingReferencesPermitType(ctx.db, row.id, type.id);
    } catch (error) {
      if (error instanceof ValueValidationError) {
        throw new CommandRejected('invalid', error.message);
      }
      throw error;
    }
    assertProtocol1Fields(ctx.db, type.id, args.fields);
    const willContain = type.capabilities.includes('containment');
    if (row.isContainer === 1 && !willContain && hasActiveContents(ctx.db, row.id)) {
      throw new CommandRejected('has_contents', `item ${row.id} still holds active contents`);
    }

    const changes: FieldValues = {
      typeKey: type.key,
      fields: args.fields,
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
