import { diffAgainst } from './conflicts.js';
import {
  currentValue,
  writeEntity,
  type CommandDb,
  type EntityKind,
  type FieldValues,
  type LoadedEntity,
} from './entities.js';
import { appendEvent } from './events.js';

import type { CommandActor } from './envelope.js';
import type { CreatePlan, UpdatePlan, Written } from './op.js';

/** Who and when every change recorded for one mutation is attributed to. */
export interface ChangeContext {
  readonly db: CommandDb;
  readonly actor: CommandActor;
  readonly mutationId: string | null;
  readonly clientTime: string | null;
  readonly now: string;
}

/**
 * Record an update: append its event with the fields that actually change
 * (before and after), then write those fields, the next revision and the
 * event's `seq` onto the row. Both happen on `ctx.db`, so they commit or roll
 * back together. Returns `null`, writing nothing, when no field changes.
 *
 * Ops whose `effects` change other entities call this for each of them, so
 * every row a mutation touches gets its own event and revision.
 */
export function recordUpdate(
  ctx: ChangeContext,
  entity: LoadedEntity,
  plan: Pick<UpdatePlan, 'eventKind' | 'changes' | 'reason' | 'compensatesSeq'>
): Written | null {
  const after = diffAgainst(entity, plan.changes);
  const fields = Object.keys(after);
  if (fields.length === 0) return null;

  const before: FieldValues = {};
  for (const field of fields) before[field] = currentValue(entity, field);

  const revision = entity.row.revision + 1;
  const seq = appendEvent(ctx.db, {
    entityKind: entity.kind,
    entityId: entity.row.id,
    kind: plan.eventKind,
    before,
    after,
    reason: plan.reason ?? null,
    entityRevision: revision,
    actor: ctx.actor,
    mutationId: ctx.mutationId,
    compensatesSeq: plan.compensatesSeq ?? null,
    clientTime: ctx.clientTime,
    serverTime: ctx.now,
  });
  writeEntity(ctx.db, entity, after, { revision, seq, now: ctx.now });
  return { revision, seq };
}

/** Record a create: append its event at revision 1, then insert the row with that `seq`. */
export function recordCreate(
  ctx: ChangeContext,
  kind: EntityKind,
  id: string,
  plan: Pick<CreatePlan, 'eventKind' | 'changes' | 'insert'>
): Written {
  const revision = 1;
  const seq = appendEvent(ctx.db, {
    entityKind: kind,
    entityId: id,
    kind: plan.eventKind,
    before: {},
    after: plan.changes,
    reason: null,
    entityRevision: revision,
    actor: ctx.actor,
    mutationId: ctx.mutationId,
    compensatesSeq: null,
    clientTime: ctx.clientTime,
    serverTime: ctx.now,
  });
  plan.insert(ctx.db, { revision, seq, now: ctx.now });
  return { revision, seq };
}
