import { z } from 'zod';

import { requireItem } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';

const setQuantityArgs = z.object({ quantity: z.number().int().min(1) });

/**
 * `item.setQuantity { quantity }`: renumber a group. There is no partial
 * discard (ADR-002 D3): reducing below the group's held count is not this
 * op's job, `item.split` is. A container's quantity is always 1
 * (`quantity_container_conflict`): a physical container is one thing, and
 * "3 boxes" holding the same contents is incoherent.
 */
export const itemSetQuantity = defineOp({
  op: 'item.setQuantity',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: setQuantityArgs,
  plan(_ctx, target, args) {
    const row = requireItem(target);
    if (row.isContainer === 1 && args.quantity > 1) {
      throw new CommandRejected(
        'quantity_container_conflict',
        `container ${row.id} must have quantity exactly 1 (ADR-002 D3)`
      );
    }
    return { eventKind: 'quantity_changed', changes: { quantity: args.quantity } };
  },
});
