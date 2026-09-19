import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { items, locations, type ItemRow, type LocationRow } from '../../db/index.js';
import { requireLocation, type CommandDb, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';
import { assertParentAllowed } from './validation.js';
import { changeContextFrom, recordUpdate } from './write.js';

import type { EffectContext } from './op.js';

const createLocationArgs = z.object({
  location: z.object({
    name: z.string().trim().min(1),
    parentId: z.string().min(1).nullish(),
    /** Legacy `/locations` sort position (POPS-4053); the new model has no client for this yet, so it defaults to 0. */
    sortOrder: z.number().int().nonnegative().default(0),
  }),
});

/**
 * `location.create { location }`: add a place at the id the client already
 * minted (`entityId`, a UUID per ADR-002 D6), mirroring `item.create { item }`.
 * A parent that is missing or tombstoned is `target_missing`; a cycle cannot
 * occur for a brand-new id, so only the target is checked.
 */
export const locationCreate = defineOp({
  op: 'location.create',
  mode: 'create',
  entity: 'location',
  args: createLocationArgs,
  plan(ctx, args) {
    if (!z.uuid().safeParse(ctx.mutation.entityId).success) {
      throw new CommandRejected('invalid', 'location.create needs a UUID entityId');
    }
    const { location } = args;
    const parentId = location.parentId ?? null;
    assertParentAllowed(ctx.db, ctx.mutation.entityId, parentId);
    return {
      eventKind: 'created',
      changes: { name: location.name, parentId, sortOrder: location.sortOrder },
      insert(db, stamp) {
        db.insert(locations)
          .values({
            id: ctx.mutation.entityId,
            name: location.name,
            parentId,
            sortOrder: location.sortOrder,
            lastEditedTime: stamp.now,
            revision: stamp.revision,
            seq: stamp.seq,
            createdAt: stamp.now,
            updatedAt: stamp.now,
          })
          .run();
      },
    };
  },
});

const renameArgs = z
  .object({
    name: z.string().trim().min(1).optional(),
    /** Legacy `/locations` sort position (POPS-4053); no client sets it yet besides that route. */
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine((args) => args.name !== undefined || args.sortOrder !== undefined, {
    message: 'location.rename needs at least one of name or sortOrder',
  });

/** `location.rename { name?, sortOrder? }`: change a place's display name, its sort position, or both. */
export const locationRename = defineOp({
  op: 'location.rename',
  mode: 'update',
  entity: 'location',
  revisionCheck: 'base',
  args: renameArgs,
  plan(_ctx, _target, args) {
    const changes: FieldValues = {};
    if (args.name !== undefined) changes['name'] = args.name;
    if (args.sortOrder !== undefined) changes['sortOrder'] = args.sortOrder;
    return { eventKind: 'edited', changes };
  },
});

const moveArgs = z.object({ parentId: z.string().min(1).nullish() });

/**
 * `location.move { parentId }`: reparent a place. The engine's generic
 * per-update existence and cycle check (`validateChanges`) covers this op,
 * since `parentId` is the only field it changes.
 */
export const locationMove = defineOp({
  op: 'location.move',
  mode: 'update',
  entity: 'location',
  revisionCheck: 'base',
  args: moveArgs,
  plan(_ctx, _target, args) {
    return { eventKind: 'edited', changes: { parentId: args.parentId ?? null } };
  },
});

/** The direct child locations of `locationId` that are not already tombstoned. */
function childLocations(db: CommandDb, locationId: string): LocationRow[] {
  return db
    .select()
    .from(locations)
    .where(and(eq(locations.parentId, locationId), isNull(locations.deletedAt)))
    .all();
}

/** The items placed directly at `locationId` (not inside a container there) that are not tombstoned. */
function directItems(db: CommandDb, locationId: string): ItemRow[] {
  return db
    .select()
    .from(items)
    .where(and(eq(items.locationId, locationId), isNull(items.deletedAt)))
    .all();
}

/**
 * Reparent everything that pointed at a deleted location: child places move
 * up to its own parent, becoming roots if it was one (ADR-002 D2). Direct
 * items do NOT follow to the parent: a deleted place leaves its own items
 * unlocated, in hand, remembering it as their previous placement ("Previous
 * place deleted"), whether or not the deleted place had a parent to move
 * them to. Only a sub-location's own children move up; the items it held
 * directly always go to hand.
 */
function reparentChildren(effectCtx: EffectContext, deleted: LocationRow): void {
  const changeCtx = changeContextFrom(effectCtx);
  const grandparentId = deleted.parentId;

  for (const child of childLocations(effectCtx.db, deleted.id)) {
    recordUpdate(
      changeCtx,
      { kind: 'location', row: child },
      { eventKind: 'edited', changes: { parentId: grandparentId } }
    );
  }

  for (const item of directItems(effectCtx.db, deleted.id)) {
    const changes: FieldValues = {
      placement: { kind: 'hand' },
      previousPlacement: { kind: 'location', locationId: deleted.id },
    };
    recordUpdate(changeCtx, { kind: 'item', row: item }, { eventKind: 'moved', changes });
  }
}

const deleteArgs = z.object({});

/**
 * `location.delete {}`: tombstone a place. Its child places reparent up to
 * its own parent (ADR-002 D2). Its direct items do not: they go unlocated,
 * in hand, remembering the deleted place as their previous placement,
 * rather than moving up to the parent (POPS-4053 supersedes ADR-002 D2's
 * "reparenting" for items specifically; the location reparenting stands).
 * Deleting an already-deleted place changes nothing, since `deletedAt` is
 * already what the op wants.
 */
export const locationDelete = defineOp({
  op: 'location.delete',
  mode: 'update',
  entity: 'location',
  revisionCheck: 'base',
  args: deleteArgs,
  plan(ctx, target) {
    const row = requireLocation(target);
    return {
      eventKind: 'deleted',
      changes: { deletedAt: ctx.now },
      effects(effectCtx) {
        reparentChildren(effectCtx, row);
      },
    };
  },
});
