import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { items, type ItemRow } from '../../db/index.js';
import { requireItem, type CommandDb, type FieldValues } from './entities.js';
import { defineOp } from './op.js';
import { removeFromSearchIndex } from './search-index.js';
import { changeContextFrom, recordUpdate } from './write.js';

import type { EffectContext } from './op.js';

/** The items placed directly inside `containerId` that are not already tombstoned. */
function directContents(db: CommandDb, containerId: string): ItemRow[] {
  return db
    .select()
    .from(items)
    .where(and(eq(items.containingItemId, containerId), isNull(items.deletedAt)))
    .all();
}

/**
 * Empty a deleted container: its contents go in hand remembering it, since
 * `containing_item_id` has no `ON DELETE` action and a tombstoned row keeps
 * its id. Mirrors `location.delete`'s `reparentChildren` for items.
 */
function emptyContainer(effectCtx: EffectContext, deleted: ItemRow): void {
  const changeCtx = changeContextFrom(effectCtx);
  for (const child of directContents(effectCtx.db, deleted.id)) {
    const changes: FieldValues = {
      placement: { kind: 'hand' },
      previousPlacement: { kind: 'container', itemId: deleted.id },
    };
    recordUpdate(changeCtx, { kind: 'item', row: child }, { eventKind: 'picked_up', changes });
  }
}

const deleteArgs = z.object({});

/**
 * `item.delete {}`: tombstone an item. A container is emptied first, its
 * contents going in hand remembering it (ADR-002 D1's placement rules,
 * mirroring `location.delete`), since deletion never cascades. Deleting an
 * already-deleted item changes nothing, as `deletedAt` already holds what
 * the op wants.
 */
export const itemDelete = defineOp({
  op: 'item.delete',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: deleteArgs,
  plan(ctx, target) {
    const row = requireItem(target);
    return {
      eventKind: 'deleted',
      changes: { deletedAt: ctx.now },
      effects(effectCtx) {
        emptyContainer(effectCtx, row);
        removeFromSearchIndex(effectCtx.db, row.id);
      },
    };
  },
});
