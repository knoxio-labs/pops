import { CommandRejected } from './errors.js';

import type { z } from 'zod';

import type { CommandDb, EntityKind, FieldValues, LoadedEntity, WriteStamp } from './entities.js';
import type { CommandActor, Mutation } from './envelope.js';

/** What every op's plan can see. `db` is inside the mutation's transaction. */
export interface PlanContext {
  readonly db: CommandDb;
  readonly mutation: Mutation;
  readonly actor: CommandActor;
  readonly now: string;
}

/** The revision and `seq` a recorded change left on its row. */
export interface Written {
  readonly revision: number;
  readonly seq: number;
}

/**
 * What an `effects` hook receives: the same context its op's `plan` saw, so
 * it can record further changes (through `recordUpdate`/`recordCreate`/
 * `recordSideEffect` in `write.ts`, which all need the actor and
 * `mutationId` an effect's own writes are attributed to) rather than only
 * touching the database directly.
 */
export type EffectContext = PlanContext;

/**
 * What an update op intends. `changes` holds the intended value of every
 * field the op sets, unchanged ones included: the engine compares them with
 * the row to decide the event's diff, a conflict, or convergence. `effects`
 * runs after the row and its event are written (or would have been, had
 * `changes` produced one — the engine calls it either way, so an op whose
 * real change lives entirely in a related table, such as an item's photos,
 * can still record it), in the same transaction, for ops that also change
 * other rows. When `effects` itself records a further change to the same
 * entity (`recordSideEffect` in `write.ts`), it returns the `Written` that
 * left, which becomes the mutation's outcome instead of the primary write's;
 * an op whose effects touch only other entities returns nothing.
 */
export interface UpdatePlan {
  readonly eventKind: string;
  readonly changes: FieldValues;
  readonly reason?: string | null;
  readonly compensatesSeq?: number;
  readonly effects?: (ctx: EffectContext, written: Written) => Written | void;
}

/**
 * What a create op intends. `changes` is recorded as the `created` event's
 * `after`; `insert` writes the row with the stamp the engine hands it.
 */
export interface CreatePlan {
  readonly eventKind: string;
  readonly changes: FieldValues;
  readonly insert: (db: CommandDb, stamp: WriteStamp) => void;
  readonly effects?: (ctx: EffectContext, written: Written) => void;
}

/**
 * How an update op's staleness is judged. `base`: the engine compares the
 * mutation's `baseRevision` field by field against later events. `op`: the op
 * judges it itself (`event.revert` against the reverted event,
 * `item.restoreDeleted`, which exists to undo a later change), and the
 * mutation's `baseRevision` is not required.
 */
export type RevisionCheck = 'base' | 'op';

/** An op that changes an existing entity. */
export interface UpdateOpDefinition<Args> {
  readonly op: string;
  readonly mode: 'update';
  readonly args: z.ZodType<Args>;
  /** The kind of entity `entityId` names; a function when it depends on the args. */
  readonly entity: EntityKind | ((db: CommandDb, args: Args) => EntityKind);
  readonly revisionCheck: RevisionCheck;
  /** Whether the op may address a tombstoned entity; otherwise that is a `deleted` conflict. */
  readonly allowsDeleted?: boolean;
  plan(ctx: PlanContext, target: LoadedEntity, args: Args): UpdatePlan;
}

/** An op that creates the entity `entityId` names, which must not exist yet. */
export interface CreateOpDefinition<Args> {
  readonly op: string;
  readonly mode: 'create';
  readonly args: z.ZodType<Args>;
  readonly entity: EntityKind;
  plan(ctx: PlanContext, args: Args): CreatePlan;
}

/** An update op with its args already validated. */
export interface BoundUpdateOp {
  readonly mode: 'update';
  readonly revisionCheck: RevisionCheck;
  readonly allowsDeleted: boolean;
  entity(db: CommandDb): EntityKind;
  plan(ctx: PlanContext, target: LoadedEntity): UpdatePlan;
}

/** A create op with its args already validated. */
export interface BoundCreateOp {
  readonly mode: 'create';
  readonly entity: EntityKind;
  plan(ctx: PlanContext): CreatePlan;
}

/** An op as the registry holds it: its name, and a binder that validates raw args. */
export interface RegisteredOp {
  readonly op: string;
  /** Validate `args`; throws `CommandRejected('invalid')` when they do not fit. */
  bind(args: unknown): BoundUpdateOp | BoundCreateOp;
}

function parseArgs<Args>(op: string, schema: z.ZodType<Args>, args: unknown): Args {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new CommandRejected('invalid', `invalid args for ${op}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Declare an op. The returned value is what the registry stores: the args
 * type stays inside the closure, so one registry holds ops of every shape
 * without widening any of them.
 */
export function defineOp<Args>(
  definition: UpdateOpDefinition<Args> | CreateOpDefinition<Args>
): RegisteredOp {
  return {
    op: definition.op,
    bind(raw) {
      const args = parseArgs(definition.op, definition.args, raw);
      if (definition.mode === 'create') {
        return {
          mode: 'create',
          entity: definition.entity,
          plan: (ctx) => definition.plan(ctx, args),
        };
      }
      const { entity } = definition;
      return {
        mode: 'update',
        revisionCheck: definition.revisionCheck,
        allowsDeleted: definition.allowsDeleted ?? false,
        entity: (db) => (typeof entity === 'function' ? entity(db, args) : entity),
        plan: (ctx, target) => definition.plan(ctx, target, args),
      };
    },
  };
}
