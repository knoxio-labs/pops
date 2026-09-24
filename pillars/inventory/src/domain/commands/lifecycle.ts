import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';

import {
  hasComputedFields,
  refreshComputedDependencies,
} from '../../catalogue/computed-dependency-index.js';
import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { items, LIFECYCLES } from '../../db/index.js';
import { itemFieldValues } from '../../db/schema.js';
import { requireItem, type CommandDb, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';
import { upsertSearchIndex } from './search-index.js';

import type { ItemRow } from '../../db/row-types.js';

const setLifecycleArgs = z
  .object({
    lifecycle: z.enum(LIFECYCLES),
    reason: z.string().trim().min(1).max(200).nullish(),
  })
  .refine((args) => args.lifecycle !== 'active' || args.reason == null, {
    message: 'an active item has no lifecycle reason',
  });

/**
 * `item.setLifecycle { lifecycle, reason? }`: retire, discard, lose, destroy
 * or restore an item. The reason (donated, sold, broken...) is stored on the
 * `lifecycle_changed` event only, never on the row. `destroyed` is terminal:
 * leaving it is `illegal_transition`. Placement is untouched, so an inactive
 * item keeps where it was for its history.
 */
export const itemSetLifecycle = defineOp({
  op: 'item.setLifecycle',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: setLifecycleArgs,
  plan(_ctx, target, args) {
    const row = requireItem(target);
    if (row.lifecycle === 'destroyed' && args.lifecycle !== 'destroyed') {
      throw new CommandRejected('illegal_transition', 'a destroyed item cannot be restored');
    }
    return {
      eventKind: 'lifecycle_changed',
      changes: { lifecycle: args.lifecycle },
      reason: args.reason ?? null,
    };
  },
});

/** Whether a LIVE item other than `excludeId` already holds `sourceRef` (POPS-4053). */
function liveSourceRefHeldElsewhere(db: CommandDb, sourceRef: string, excludeId: string): boolean {
  const holder = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.sourceRef, sourceRef), isNull(items.deletedAt), ne(items.id, excludeId)))
    .get();
  return holder !== undefined;
}

/** Computed fields the item's current type no longer lets an item override. */
function disallowedOverrideFieldIds(db: CommandDb, typeId: string | null): ReadonlySet<string> {
  if (typeId === null) return new Set();
  const type = loadPublishedCatalogue(db)?.types.find((entry) => entry.id === typeId);
  if (!type) return new Set();
  return new Set(
    type.fields
      .filter((field) => field.storage === 'computed' && !field.allowOverride)
      .map((field) => field.id)
  );
}

/** Fields, among `fieldIds`, on which `itemId` currently holds an override value. */
function heldOverrideFieldIds(
  db: CommandDb,
  itemId: string,
  fieldIds: ReadonlySet<string>
): string[] {
  if (fieldIds.size === 0) return [];
  return db
    .selectDistinct({ fieldId: itemFieldValues.fieldId })
    .from(itemFieldValues)
    .where(
      and(
        eq(itemFieldValues.itemId, itemId),
        eq(itemFieldValues.source, 'override'),
        inArray(itemFieldValues.fieldId, [...fieldIds])
      )
    )
    .all()
    .map((row) => row.fieldId);
}

/**
 * A soft-deleted item is invisible to catalogue publication (POPS-4398): a
 * migration that disables a computed field's overrides only discards the
 * overrides live items hold, so a since-deleted item can still carry one an
 * unrestricted `item.restoreDeleted` would resurrect, which the active
 * catalogue no longer permits (`override_forbidden` at evaluation). Dropping
 * it here, in the same `restored` event as the tombstone lift, mirrors the
 * existing `sourceRef` conflict below rather than teaching the migration
 * engine to reach into deleted rows.
 */
function droppedOverrideChanges(db: CommandDb, row: ItemRow): FieldValues {
  const disallowed = disallowedOverrideFieldIds(db, row.typeId);
  const held = heldOverrideFieldIds(db, row.id, disallowed);
  const changes: FieldValues = {};
  for (const fieldId of held) changes[fieldId] = null;
  return changes;
}

/**
 * `item.restoreDeleted {}`: lift an item's tombstone. It exists to undo a
 * deletion the client had not seen, so it is not judged against a base
 * revision; restoring an item that is not deleted changes nothing.
 *
 * A `sourceRef` re-attaches only if no LIVE item holds it now (POPS-4053):
 * `items_source_ref` is unique among live rows only, so restoring a row
 * whose ref another item has since claimed would otherwise collide. When
 * that happens the restore still applies, but drops the ref (`sourceRef:
 * null` in the `restored` event's own `changes`, distinct from an ordinary
 * restore's `{ deletedAt: null }` alone) — the item comes back without its
 * old fan-out link rather than the restore failing outright.
 *
 * Any override the item holds on a computed field the active catalogue no
 * longer lets items override is dropped the same way, keyed by the field's
 * id in `changes` (POPS-4398): the field falls back to its computed value
 * rather than the restore reviving a value the catalogue has since
 * forbidden. There is no REST surface for `item.restoreDeleted` today; a
 * caller sees this only through the item's event history.
 *
 * `item.delete`'s own effect drops the item from `items_fts` and leaves it
 * out of `item_computed_dependencies`' bulk rebuilds; restoring undoes both,
 * the same way `item.create`/`item.edit` keep them current: the item is
 * re-indexed and, when the published catalogue has computed fields, its
 * dependency rows are rebuilt so a later change to something it reads
 * re-evaluates it again.
 */
export const itemRestoreDeleted = defineOp({
  op: 'item.restoreDeleted',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'op',
  allowsDeleted: true,
  args: z.object({}),
  plan(ctx, target) {
    const row = requireItem(target);
    const changes: FieldValues = { deletedAt: null, ...droppedOverrideChanges(ctx.db, row) };
    if (row.sourceRef !== null && liveSourceRefHeldElsewhere(ctx.db, row.sourceRef, row.id)) {
      changes['sourceRef'] = null;
    }
    return {
      eventKind: 'restored',
      changes,
      effects(effectCtx) {
        upsertSearchIndex(effectCtx.db, {
          id: row.id,
          name: row.name,
          code: row.code,
          note: row.note,
          typeId: row.typeId,
          externalIds: row.externalIds,
        });
        const catalogue = loadPublishedCatalogue(effectCtx.db);
        if (catalogue !== null && hasComputedFields(catalogue)) {
          refreshComputedDependencies(effectCtx.db, catalogue, [row.id]);
        }
      },
    };
  },
});
