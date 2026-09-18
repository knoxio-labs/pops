import { z } from 'zod';

import { ACCESS_STATES, type ItemRow } from '../../db/index.js';
import { requireItem, type LoadedEntity } from './entities.js';
import { CommandRejected } from './errors.js';
import { defineOp } from './op.js';

function requireContainer(target: LoadedEntity): ItemRow {
  const row = requireItem(target);
  if (row.isContainer !== 1) {
    throw new CommandRejected('not_container', `item ${row.id} is not a container`);
  }
  return row;
}

/** `item.setAccess { access }`: open or close a container. Any other item is `not_container`. */
export const itemSetAccess = defineOp({
  op: 'item.setAccess',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: z.object({ access: z.enum(ACCESS_STATES) }),
  plan(_ctx, target, args) {
    requireContainer(target);
    return {
      eventKind: args.access === 'open' ? 'opened' : 'closed',
      changes: { access: args.access },
    };
  },
});

/**
 * `item.setFull { full }`: mark a container full or not. Fullness belongs to
 * the containment capability rather than to a type's fields, so it is a
 * row column and an `edited` event. Any other item is `not_container`.
 */
export const itemSetFull = defineOp({
  op: 'item.setFull',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: z.object({ full: z.boolean() }),
  plan(_ctx, target, args) {
    requireContainer(target);
    return { eventKind: 'edited', changes: { isFull: args.full } };
  },
});
