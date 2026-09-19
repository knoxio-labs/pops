import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';

import { items, LIFECYCLES } from '../../db/index.js';
import { requireItem, type CommandDb, type FieldValues } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';

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
 * old fan-out link rather than the restore failing outright. There is no
 * REST surface for `item.restoreDeleted` today; a caller sees this only
 * through the item's event history.
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
    const changes: FieldValues = { deletedAt: null };
    if (row.sourceRef !== null && liveSourceRefHeldElsewhere(ctx.db, row.sourceRef, row.id)) {
      changes['sourceRef'] = null;
    }
    return { eventKind: 'restored', changes };
  },
});
