import { z } from 'zod';

import { requireItem } from './entities.js';
import { defineOp } from './op.js';

const setQuantityArgs = z.object({ quantity: z.number().int().min(1) });

/**
 * `item.setQuantity { quantity }`: renumber a group. There is no partial
 * discard (ADR-002 D3): reducing below the group's held count is not this
 * op's job, `item.split` is.
 */
export const itemSetQuantity = defineOp({
  op: 'item.setQuantity',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: setQuantityArgs,
  plan(_ctx, target, args) {
    requireItem(target);
    return { eventKind: 'quantity_changed', changes: { quantity: args.quantity } };
  },
});
