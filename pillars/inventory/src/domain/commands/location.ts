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
  name: z.string().trim().min(1),
  parentId: z.string().min(1).nullish(),
});

/**
 * `location.create { name, parentId? }`: add a place at the id the client
 * already minted (`entityId`, a UUID per ADR-002 D6). A parent that is
 * missing or tombstoned is `target_missing`; a cycle cannot occur for a
 * brand-new id, so only the target is checked.
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
    const parentId = args.parentId ?? null;
    assertParentAllowed(ctx.db, ctx.mutation.entityId, parentId);
    return {
      eventKind: 'created',
      changes: { name: args.name, parentId },
      insert(db, stamp) {
        db.insert(locations)
          .values({
            id: ctx.mutation.entityId,
            name: args.name,
            parentId,
            sortOrder: 0,
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

const renameArgs = z.object({ name: z.string().trim().min(1) });

/** `location.rename { name }`: change a place's display name. */
export const locationRename = defineOp({
  op: 'location.rename',
  mode: 'update',
  entity: 'location',
  revisionCheck: 'base',
  args: renameArgs,
  plan(_ctx, _target, args) {
    return { eventKind: 'edited', changes: { name: args.name } };
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
 * up to its own parent (becoming roots if it was one), and direct items
 * follow the same rule except at a root, where there is no "up" for an item
 * to move to, so they go in hand remembering the deleted place (ADR-002 D2's
 * "Previous place deleted").
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
    const changes: FieldValues =
      grandparentId !== null
        ? {
            placement: { kind: 'location', locationId: grandparentId },
            previousPlacement: null,
          }
        : {
            placement: { kind: 'hand' },
            previousPlacement: { kind: 'location', locationId: deleted.id },
          };
    recordUpdate(changeCtx, { kind: 'item', row: item }, { eventKind: 'moved', changes });
  }
}

const deleteArgs = z.object({});

/**
 * `location.delete {}`: tombstone a place, reparenting whatever pointed at
 * it (ADR-002 D2). Deleting an already-deleted place changes nothing, since
 * `deletedAt` is already what the op wants.
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
