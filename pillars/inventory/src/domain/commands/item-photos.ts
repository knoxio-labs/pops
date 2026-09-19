import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { itemPhotos, media } from '../../db/index.js';
import { requireItem, type CommandDb } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';
import { recordSideEffect, changeContextFrom } from './write.js';

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'a sha256 is 64 lowercase hex characters');

/**
 * Whether `sha256`'s bytes are already stored. Queries the `media` table
 * directly rather than importing the media pillar's own store (A8,
 * POPS-4903): that slice may land after this one, and this check only needs
 * the row's existence, which the table already guarantees once A8 writes it.
 * When A8 is on `main`, its `mediaExists` re-implements exactly this query
 * and this local copy can be replaced by an import of it.
 */
export function mediaExists(db: CommandDb, sha256: string): boolean {
  const row = db.select({ sha256: media.sha256 }).from(media).where(eq(media.sha256, sha256)).get();
  return row !== undefined;
}

function currentPhotos(db: CommandDb, itemId: string): (typeof itemPhotos.$inferSelect)[] {
  return db
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(asc(itemPhotos.position))
    .all();
}

function hashesOf(
  photos: readonly { mediaSha256: string | null; filePath: string | null }[]
): string[] {
  return photos.map((photo) => photo.mediaSha256 ?? photo.filePath ?? '');
}

const attachPhotoArgs = z.object({ sha256: sha256Schema, position: z.number().int().min(0) });

/**
 * `item.attachPhoto { sha256, position }`: reference stored media as one of
 * an item's photos. The bytes must already be stored (`PUT
 * /media/:sha256`, A8): otherwise `rejected: media_missing`, which the phone
 * treats as "upload first, then retry" (ADR-002 D9). Not judged against a
 * base revision: two devices attaching different photos are both additive,
 * so there is nothing to conflict over.
 */
export const itemAttachPhoto = defineOp({
  op: 'item.attachPhoto',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'op',
  args: attachPhotoArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    if (!mediaExists(ctx.db, args.sha256)) {
      throw new CommandRejected('media_missing', `media ${args.sha256} is not stored`);
    }
    const before = currentPhotos(ctx.db, row.id);
    return {
      eventKind: 'photo_added',
      changes: {},
      effects(effectCtx) {
        effectCtx.db
          .insert(itemPhotos)
          .values({ itemId: row.id, mediaSha256: args.sha256, position: args.position })
          .run();
        const after = currentPhotos(effectCtx.db, row.id);
        return recordSideEffect(changeContextFrom(effectCtx), target, {
          eventKind: 'photo_added',
          before: { photos: hashesOf(before) },
          after: { photos: hashesOf(after) },
        });
      },
    };
  },
});

const removePhotoArgs = z.object({ sha256: sha256Schema });

/** `item.removePhoto { sha256 }`: remove a photo by its hash. Removing a hash the item does not have changes nothing. */
export const itemRemovePhoto = defineOp({
  op: 'item.removePhoto',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'op',
  args: removePhotoArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const before = currentPhotos(ctx.db, row.id);
    return {
      eventKind: 'photo_removed',
      changes: {},
      effects(effectCtx) {
        effectCtx.db
          .delete(itemPhotos)
          .where(
            sql`${itemPhotos.itemId} = ${row.id} AND ${itemPhotos.mediaSha256} = ${args.sha256}`
          )
          .run();
        const after = currentPhotos(effectCtx.db, row.id);
        if (after.length === before.length) return undefined;
        return recordSideEffect(changeContextFrom(effectCtx), target, {
          eventKind: 'photo_removed',
          before: { photos: hashesOf(before) },
          after: { photos: hashesOf(after) },
        });
      },
    };
  },
});

const reorderPhotosArgs = z.object({ sha256s: z.array(sha256Schema).min(1) });

/**
 * `item.reorderPhotos { sha256s }`: set the display order of an item's
 * photos to exactly `sha256s`. Every hash named must be one of the item's
 * current photos and every current photo must be named, or the op is
 * `invalid`: a partial list would silently drop photos it did not mention.
 */
export const itemReorderPhotos = defineOp({
  op: 'item.reorderPhotos',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'op',
  args: reorderPhotosArgs,
  plan(ctx, target, args) {
    const row = requireItem(target);
    const before = currentPhotos(ctx.db, row.id);
    const currentHashes = new Set(hashesOf(before));
    const wantedHashes = new Set(args.sha256s);
    if (
      currentHashes.size !== wantedHashes.size ||
      [...currentHashes].some((h) => !wantedHashes.has(h))
    ) {
      throw new CommandRejected(
        'invalid',
        "reorderPhotos must name exactly the item's current photos"
      );
    }
    return {
      eventKind: 'edited',
      changes: {},
      effects(effectCtx) {
        args.sha256s.forEach((sha256, position) => {
          effectCtx.db
            .update(itemPhotos)
            .set({ position })
            .where(sql`${itemPhotos.itemId} = ${row.id} AND ${itemPhotos.mediaSha256} = ${sha256}`)
            .run();
        });
        return recordSideEffect(changeContextFrom(effectCtx), target, {
          eventKind: 'edited',
          before: { photos: hashesOf(before) },
          after: { photos: [...args.sha256s] },
        });
      },
    };
  },
});
