import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { items, locations, type ItemRow } from '../../db/index.js';
import { requireItem, type CommandDb } from './entities.js';
import { CommandRejected } from './errors.js';
import {
  placementSchema,
  readPlacement,
  readPreviousPlacement,
  type Placement,
  type PreviousPlacement,
} from './item-fields.js';
import { defineOp } from './op.js';

/** The most containers that may stand above one item, counting its own. */
export const MAX_CONTAINMENT_DEPTH = 32;

const chainSchema = z.array(z.object({ id: z.string(), depth: z.number() }));

/**
 * `containerId` and every container above it, nearest first, with its depth
 * (the container itself is 1). The walk stops one level past the cap, so a
 * cycle already in the data cannot make it loop.
 */
function containerChain(db: CommandDb, containerId: string): z.infer<typeof chainSchema> {
  const rows = db.all(sql`
    WITH RECURSIVE chain(id, depth) AS (
      SELECT ${containerId}, 1
      UNION ALL
      SELECT i.containing_item_id, chain.depth + 1
      FROM items i JOIN chain ON i.id = chain.id
      WHERE i.containing_item_id IS NOT NULL AND chain.depth <= ${MAX_CONTAINMENT_DEPTH}
    )
    SELECT id, depth FROM chain ORDER BY depth`);
  return chainSchema.parse(rows);
}

function assertLocationTarget(db: CommandDb, locationId: string): void {
  const location = db
    .select({ deletedAt: locations.deletedAt })
    .from(locations)
    .where(eq(locations.id, locationId))
    .get();
  if (!location || location.deletedAt !== null) {
    throw new CommandRejected('target_missing', `location ${locationId} does not exist`);
  }
}

function assertContainerTarget(db: CommandDb, itemId: string, containerId: string): void {
  if (containerId === itemId) throw new CommandRejected('cycle', 'an item cannot contain itself');
  const container = db
    .select({
      isContainer: items.isContainer,
      deletedAt: items.deletedAt,
      quantity: items.quantity,
    })
    .from(items)
    .where(eq(items.id, containerId))
    .get();
  if (!container || container.deletedAt !== null) {
    throw new CommandRejected('target_missing', `container ${containerId} does not exist`);
  }
  if (container.isContainer !== 1) {
    throw new CommandRejected('not_container', `item ${containerId} is not a container`);
  }
  if (container.quantity > 1) {
    throw new CommandRejected(
      'quantity_container_conflict',
      `item ${containerId} has quantity ${container.quantity}; a grouped item cannot hold contents (ADR-002 D3)`
    );
  }
  const chain = containerChain(db, containerId);
  if (chain.some((link) => link.id === itemId)) {
    throw new CommandRejected('cycle', `item ${itemId} already holds ${containerId}`);
  }
  if (chain.length > MAX_CONTAINMENT_DEPTH) {
    throw new CommandRejected('cycle', `containers nest at most ${MAX_CONTAINMENT_DEPTH} deep`);
  }
}

/**
 * Refuse a placement `itemId` cannot take: a place that does not exist or is
 * tombstoned (`target_missing`), an item that is not a container
 * (`not_container`), a container whose own quantity is greater than 1
 * (`quantity_container_conflict`, ADR-002 D3 — a grouped item can never hold
 * contents), or a container that is the item itself, sits inside it, or
 * nests deeper than {@link MAX_CONTAINMENT_DEPTH} (`cycle`). In hand is
 * always allowed.
 */
export function assertPlacementAllowed(db: CommandDb, itemId: string, to: Placement): void {
  if (to.kind === 'location') assertLocationTarget(db, to.locationId);
  if (to.kind === 'container') assertContainerTarget(db, itemId, to.itemId);
}

/**
 * The previous placement an item has after moving to `to`: taking it in hand
 * remembers where it was, unless it was already in hand and keeps what it
 * remembered; putting it anywhere else forgets.
 */
export function previousPlacementAfter(row: ItemRow, to: Placement): PreviousPlacement {
  if (to.kind !== 'hand') return null;
  const current = readPlacement(row);
  return current.kind === 'hand' ? readPreviousPlacement(row) : current;
}

const MOVE_VERBS = ['move', 'pick_up', 'put_back', 'store'] as const;

const EVENT_KIND_BY_VERB: Readonly<Record<(typeof MOVE_VERBS)[number], string>> = {
  move: 'moved',
  pick_up: 'picked_up',
  put_back: 'put_back',
  store: 'stored',
};

const moveArgs = z
  .object({ to: placementSchema, verb: z.enum(MOVE_VERBS) })
  .refine((args) => (args.verb === 'pick_up') === (args.to.kind === 'hand'), {
    message: 'pick_up moves into the hand, and only pick_up does',
  });

/**
 * `item.move { to, verb }`: place an item at a location, in a container, or in
 * hand. The verb only names the history event. Moving a container writes its
 * own row alone: its contents are contained, not relocated, so their
 * revisions do not move and a box move never conflicts with packing it.
 */
export const itemMove = defineOp({
  op: 'item.move',
  mode: 'update',
  entity: 'item',
  revisionCheck: 'base',
  args: moveArgs,
  plan(_ctx, target, args) {
    const row = requireItem(target);
    return {
      eventKind: EVENT_KIND_BY_VERB[args.verb],
      changes: { placement: args.to, previousPlacement: previousPlacementAfter(row, args.to) },
    };
  },
});
