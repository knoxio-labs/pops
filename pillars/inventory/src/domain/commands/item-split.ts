import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { itemPhotos, items, type ItemRow } from '../../db/index.js';
import { loadEntity, requireItem, type CommandDb } from './entities.js';
import { CommandRejected } from './errors.js';
import { readPlacement } from './item-fields.js';
import { defineOp } from './op.js';
import { upsertSearchIndex } from './search-index.js';
import { changeContextFrom, recordCreate } from './write.js';

import type { WriteStamp } from './entities.js';
import type { JsonValue } from './outcome.js';

const splitArgs = z.object({ newItemId: z.uuid(), quantity: z.number().int().min(1) });

/** Copy `fromId`'s photos onto `toId`, in the same order. Positions are copied verbatim: the new item is a fresh copy, not a merge. */
function copyPhotos(db: CommandDb, fromId: string, toId: string): void {
  const photos = db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, fromId))
    .orderBy(asc(itemPhotos.position))
    .all();
  for (const photo of photos) {
    db.insert(itemPhotos)
      .values({
        itemId: toId,
        mediaSha256: photo.mediaSha256,
        filePath: photo.filePath,
        caption: photo.caption,
        position: photo.position,
      })
      .run();
  }
}

interface InsertSplitIntoArgs {
  readonly db: CommandDb;
  readonly row: ItemRow;
  readonly newItemId: string;
  readonly quantity: number;
  readonly stamp: WriteStamp;
}

/** Insert the split-off item at `newItemId`, a copy of `row` at `quantity` and no code. */
function insertSplitInto({ db, row, newItemId, quantity, stamp }: InsertSplitIntoArgs): void {
  db.insert(items)
    .values({
      id: newItemId,
      name: row.name,
      typeKey: row.typeKey,
      fields: row.fields,
      note: row.note,
      code: null,
      externalIds: row.externalIds,
      quantity,
      placementKind: row.placementKind,
      locationId: row.locationId,
      containingItemId: row.containingItemId,
      isContainer: row.isContainer,
      access: row.isContainer === 1 ? (row.access ?? 'open') : null,
      lastEditedTime: stamp.now,
      revision: stamp.revision,
      seq: stamp.seq,
      createdAt: stamp.now,
      updatedAt: stamp.now,
    })
    .run();
}

/**
 * `item.split { newItemId, quantity }`: split `quantity` of `entityId`'s
 * count off into a new item at `newItemId`, minted by the client. The new
 * item keeps the original's placement, type, fields, note and photos; it
 * does not keep the code, since a code names one sticker (ADR-002 D3). The
 * split-off count must leave at least one behind; `newItemId` must not
 * already exist.
 */
export const itemSplit = defineOp({
  op: 'item.split',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: splitArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    if (loadEntity(ctx.db, 'item', args.newItemId)) {
      throw new CommandRejected('invalid', `item ${args.newItemId} already exists`);
    }
    const remaining = row.quantity - args.quantity;
    if (remaining < 1) {
      throw new CommandRejected('invalid', 'a split must leave at least one item behind');
    }

    return {
      eventKind: 'split_from',
      changes: { quantity: remaining },
      effects(effectCtx) {
        recordCreate(changeContextFrom(effectCtx), 'item', args.newItemId, {
          eventKind: 'split_into',
          changes: {
            name: row.name,
            typeKey: row.typeKey,
            fields: JSON.parse(row.fields) as JsonValue,
            note: row.note,
            externalIds: JSON.parse(row.externalIds) as JsonValue,
            quantity: args.quantity,
            placement: readPlacement(row),
            isContainer: row.isContainer === 1,
          },
          insert: (db, stamp) =>
            insertSplitInto({ db, row, newItemId: args.newItemId, quantity: args.quantity, stamp }),
        });
        copyPhotos(effectCtx.db, row.id, args.newItemId);
        upsertSearchIndex(effectCtx.db, {
          id: args.newItemId,
          name: row.name,
          code: null,
          note: row.note,
          typeKey: row.typeKey,
          fields: row.fields,
          externalIds: row.externalIds,
        });
      },
    };
  },
});
