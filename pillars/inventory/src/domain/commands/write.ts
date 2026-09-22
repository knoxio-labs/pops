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
import type { CreatePlan, EffectContext, UpdatePlan, Written } from './op.js';

/** Who and when every change recorded for one mutation is attributed to. */
export interface ChangeContext {
  readonly db: CommandDb;
  readonly actor: CommandActor;
  readonly mutationId: string | null;
  readonly clientTime: string | null;
  readonly now: string;
}

/** Derive a {@link ChangeContext} from the context an `effects` hook receives. */
export function changeContextFrom(ctx: EffectContext): ChangeContext {
  return {
    db: ctx.db,
    actor: ctx.actor,
    mutationId: ctx.mutation.mutationId,
    clientTime: ctx.mutation.clientTime,
    now: ctx.now,
  };
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
  const after = diffAgainst(ctx.db, entity, plan.changes);
  const fields = Object.keys(after);
  if (fields.length === 0) return null;

  const before: FieldValues = {};
  for (const field of fields) before[field] = currentValue(ctx.db, entity, field);

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

/**
 * Record a change whose value lives in a related table rather than a column
 * of `entity`'s own row (an item's photos, ADR-002 D9: "Photo changes are
 * item events and bump the item's revision"). Unlike {@link recordUpdate},
 * `before`/`after` are the op's own values, not derived through a field
 * codec, because nothing in `ITEM_FIELD_CODECS` can read a related table. The
 * row is always stamped with the next revision and this event's `seq`, even
 * though none of its own columns change.
 */
export function recordSideEffect(
  ctx: ChangeContext,
  entity: LoadedEntity,
  plan: { eventKind: string; before: FieldValues; after: FieldValues; reason?: string | null }
): Written {
  const revision = entity.row.revision + 1;
  const seq = appendEvent(ctx.db, {
    entityKind: entity.kind,
    entityId: entity.row.id,
    kind: plan.eventKind,
    before: plan.before,
    after: plan.after,
    reason: plan.reason ?? null,
    entityRevision: revision,
    actor: ctx.actor,
    mutationId: ctx.mutationId,
    compensatesSeq: null,
    clientTime: ctx.clientTime,
    serverTime: ctx.now,
  });
  writeEntity(ctx.db, entity, {}, { revision, seq, now: ctx.now });
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
