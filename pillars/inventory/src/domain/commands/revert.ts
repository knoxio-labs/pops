import { z } from 'zod';

import { isActiveFieldName } from './active-field-key.js';
import { conflictSinceSeq } from './conflicts.js';
import { isWritableField, loadEntity, type CommandDb, type FieldValues } from './entities.js';
import { CommandConflict, CommandRejected } from './errors.js';
import { loadEvent, type DomainEvent } from './events.js';
import { defineOp } from './op.js';
import { upsertSearchIndex } from './search-index.js';

/** Event kinds that bring an entity into being; undoing one is a deletion, not a revert. */
const IRREVERSIBLE_KINDS: ReadonlySet<string> = new Set(['created', 'split_from', 'split_into']);
const INDEXED_ITEM_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'code',
  'note',
  'typeKey',
  'fields',
  'externalIds',
]);

function isIndexedItemField(field: string): boolean {
  return INDEXED_ITEM_FIELDS.has(field) || isActiveFieldName(field);
}

const revertArgs = z.object({ seq: z.number().int().min(1) });

function requireEvent(db: CommandDb, seq: number): DomainEvent {
  const event = loadEvent(db, seq);
  if (!event) throw new CommandRejected('target_missing', `event ${seq} does not exist`);
  return event;
}

function assertRevertible(event: DomainEvent): void {
  if (IRREVERSIBLE_KINDS.has(event.kind)) {
    throw new CommandRejected('illegal_transition', `a ${event.kind} event cannot be reverted`);
  }
  if (event.after.lifecycle === 'destroyed') {
    throw new CommandRejected('illegal_transition', 'destroying an item cannot be undone');
  }
  const locked = event.fields.find((field) => !isWritableField(event.entityKind, field));
  if (locked !== undefined) {
    throw new CommandRejected('illegal_transition', `field ${locked} cannot be reverted`);
  }
}

/**
 * Whether `event` is of a kind `event.revert` accepts at all: not a creation,
 * not a destruction, and touching only writable fields. Whether a later change
 * has superseded it is a separate question, answered against the log.
 */
export function isRevertible(event: DomainEvent): boolean {
  try {
    assertRevertible(event);
    return true;
  } catch (error) {
    if (error instanceof CommandRejected) return false;
    throw error;
  }
}

/**
 * `event.revert { seq }`: undo one event by writing back its `before` values,
 * recorded as a `reverted` event that names it in `compensates_seq`. The
 * mutation's `entityId` must be the event's entity. It is judged against the
 * reverted event, not a base revision: if any of its fields changed after it,
 * the revert is a `field` conflict, since undoing it would also undo that
 * later change. Creations and destructions are `illegal_transition`, and a
 * restored placement must still be one the item can take.
 */
export const eventRevert = defineOp({
  op: 'event.revert',
  mode: 'update',
  entity: (db, args) => requireEvent(db, args.seq).entityKind,
  revisionCheck: 'op',
  args: revertArgs,
  plan(ctx, target, args) {
    const event = requireEvent(ctx.db, args.seq);
    if (event.entityId !== target.row.id) {
      throw new CommandRejected('invalid', `event ${args.seq} is not about ${target.row.id}`);
    }
    assertRevertible(event);

    const restored: FieldValues = {};
    for (const field of event.fields) restored[field] = event.before[field] ?? null;

    const conflict = conflictSinceSeq(ctx.db, target, event.seq, restored);
    if (conflict) throw new CommandConflict(conflict);
    return {
      eventKind: 'reverted',
      changes: restored,
      compensatesSeq: event.seq,
      effects(effectContext) {
        if (
          event.entityKind !== 'item' ||
          !event.fields.some((field) => isIndexedItemField(field))
        ) {
          return;
        }
        const entity = loadEntity(effectContext.db, 'item', event.entityId);
        if (!entity || entity.kind !== 'item') {
          throw new CommandRejected('target_missing', `item ${event.entityId} does not exist`);
        }
        upsertSearchIndex(effectContext.db, entity.row);
      },
    };
  },
});
