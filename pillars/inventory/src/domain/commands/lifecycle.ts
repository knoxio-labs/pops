import { z } from 'zod';

import { LIFECYCLES } from '../../db/index.js';
import { requireItem } from './entities.js';
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

/**
 * `item.restoreDeleted {}`: lift an item's tombstone. It exists to undo a
 * deletion the client had not seen, so it is not judged against a base
 * revision; restoring an item that is not deleted changes nothing.
 */
export const itemRestoreDeleted = defineOp({
  op: 'item.restoreDeleted',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'op',
  allowsDeleted: true,
  args: z.object({}),
  plan(_ctx, target) {
    requireItem(target);
    return { eventKind: 'restored', changes: { deletedAt: null } };
  },
});
