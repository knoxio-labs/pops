import { invalidateComputedItem } from '../../catalogue/computed-value-runtime-cache.js';
import {
  DEFAULT_COMPUTED_DEPENDENT_LIMIT,
  latestSeq,
  resendComputedDependents,
} from './computed-dependents.js';
import { checkRevision, deletedConflict } from './conflicts.js';
import { loadEntity, type CommandDb } from './entities.js';
import { CommandConflict, CommandRejected } from './errors.js';
import { pendingDependency, replayOutcome, storeOutcome } from './idempotency.js';
import { COMMAND_REGISTRY, type OpRegistry } from './registry.js';
import { validateChanges } from './validation.js';
import { recordCreate, recordUpdate, type ChangeContext } from './write.js';

import type { CommandActor, Mutation } from './envelope.js';
import type { BoundCreateOp, BoundUpdateOp, PlanContext, Written } from './op.js';
import type { ConflictBody, Outcome, StoredOutcome } from './outcome.js';

/** Knobs for tests and alternative callers; production uses the defaults. */
export interface EngineOptions {
  /** Server clock, ISO 8601. Defaults to the wall clock. */
  readonly now?: () => string;
  /** The ops dispatched by name. Defaults to every op the pillar defines. */
  readonly registry?: OpRegistry;
  /** Cap on computed dependents one mutation re-sends. Defaults to {@link DEFAULT_COMPUTED_DEPENDENT_LIMIT}. */
  readonly computedDependentLimit?: number;
}

interface Dispatch {
  readonly db: CommandDb;
  readonly mutation: Mutation;
  readonly actor: CommandActor;
  readonly now: string;
}

function applied(mutation: Mutation, written: Written, converged: boolean): StoredOutcome {
  return { mutationId: mutation.mutationId, status: 'applied', ...written, converged };
}

function conflicted(mutation: Mutation, conflict: ConflictBody): StoredOutcome {
  return { mutationId: mutation.mutationId, status: 'conflict', ...conflict };
}

function changeContext(d: Dispatch): ChangeContext {
  return {
    db: d.db,
    actor: d.actor,
    mutationId: d.mutation.mutationId,
    clientTime: d.mutation.clientTime,
    now: d.now,
  };
}

function dispatchCreate(d: Dispatch, op: BoundCreateOp, ctx: PlanContext): StoredOutcome {
  if (d.mutation.baseRevision !== null && d.mutation.baseRevision !== undefined) {
    throw new CommandRejected('invalid', `${d.mutation.op} creates and takes no base revision`);
  }
  if (loadEntity(d.db, op.entity, d.mutation.entityId)) {
    throw new CommandRejected('invalid', `${op.entity} ${d.mutation.entityId} already exists`);
  }
  const plan = op.plan(ctx);
  const written = recordCreate(changeContext(d), op.entity, d.mutation.entityId, plan);
  plan.effects?.(ctx, written);
  return applied(d.mutation, written, false);
}

function dispatchUpdate(d: Dispatch, op: BoundUpdateOp, ctx: PlanContext): StoredOutcome {
  const kind = op.entity(d.db);
  const target = loadEntity(d.db, kind, d.mutation.entityId);
  if (!target)
    throw new CommandRejected('target_missing', `${kind} ${d.mutation.entityId} does not exist`);
  if (target.row.deletedAt !== null && !op.allowsDeleted) {
    return conflicted(d.mutation, deletedConflict(d.db, target));
  }

  const plan = op.plan(ctx, target);
  validateChanges(d.db, target, plan.changes);
  let converged = false;
  if (op.revisionCheck === 'base') {
    const base = d.mutation.baseRevision;
    if (base === null || base === undefined) {
      throw new CommandRejected('invalid', `${d.mutation.op} needs a base revision`);
    }
    const verdict = checkRevision(d.db, target, base, plan.changes);
    if (verdict.kind === 'conflict') return conflicted(d.mutation, verdict.conflict);
    converged = verdict.converged;
  }

  const written = recordUpdate(changeContext(d), target, plan);
  const settled = written ?? { revision: target.row.revision, seq: target.row.seq };
  const afterEffects = plan.effects?.(ctx, settled);
  return applied(d.mutation, afterEffects ?? settled, converged);
}

function dispatch(d: Dispatch, registry: OpRegistry): StoredOutcome {
  if (d.mutation.dependsOn.includes(d.mutation.mutationId)) {
    throw new CommandRejected('invalid', 'a mutation cannot depend on itself');
  }
  const registered = registry.get(d.mutation.op);
  if (!registered) throw new CommandRejected('invalid', `unknown op ${d.mutation.op}`);
  const op = registered.bind(d.mutation.args);
  const ctx: PlanContext = { db: d.db, mutation: d.mutation, actor: d.actor, now: d.now };
  return op.mode === 'create' ? dispatchCreate(d, op, ctx) : dispatchUpdate(d, op, ctx);
}

/**
 * Decide the mutation inside a savepoint, so a refusal or an op-detected
 * conflict thrown halfway through an op discards whatever the op had written
 * while the outcome itself is still stored in the enclosing transaction.
 */
function decide(d: Dispatch, registry: OpRegistry): StoredOutcome {
  try {
    return d.db.transaction((savepoint) => dispatch({ ...d, db: savepoint }, registry));
  } catch (error) {
    if (error instanceof CommandRejected) {
      return {
        mutationId: d.mutation.mutationId,
        status: 'rejected',
        reason: error.reason,
        message: error.message,
        ...(error.catalogueChanges.length > 0
          ? { catalogueChanges: [...error.catalogueChanges] }
          : {}),
      };
    }
    if (error instanceof CommandConflict) return conflicted(d.mutation, error.conflict);
    throw error;
  }
}

/**
 * Run one mutation in its own immediate transaction and return its outcome.
 *
 * - A `mutationId` already decided replays its stored outcome and writes
 *   nothing (a different op or entity under the same id is `rejected`).
 * - A dependency that has not applied here yields `deferred`, which is not
 *   stored, so the retry is judged afresh.
 * - Otherwise the op is dispatched: validated, checked against its base
 *   revision, applied, its event appended and the row stamped with the new
 *   revision and `seq`; the outcome is stored in `mutations` in the same
 *   transaction as the row and the event.
 * - An applied mutation re-sends, in the same transaction, the items whose
 *   computed values read an item it changed (`resendComputedDependents`).
 *
 * Errors other than a refusal or a conflict (a bug, a broken database)
 * propagate with nothing written.
 */
export function runMutation(
  db: CommandDb,
  mutation: Mutation,
  actor: CommandActor,
  options: EngineOptions = {}
): Outcome {
  const registry = options.registry ?? COMMAND_REGISTRY;
  const clock = options.now ?? (() => new Date().toISOString());
  const outcome: Outcome = db.transaction(
    (tx) => {
      const replayed = replayOutcome(tx, mutation);
      if (replayed) return replayed;
      // A self-dependency would defer forever; dispatch refuses it instead.
      const others = mutation.dependsOn.filter((id) => id !== mutation.mutationId);
      const waitingOn = pendingDependency(tx, others);
      if (waitingOn !== null) {
        return { mutationId: mutation.mutationId, status: 'deferred', waitingOn };
      }
      const now = clock();
      const sinceSeq = latestSeq(tx);
      const outcome = decide({ db: tx, mutation, actor, now }, registry);
      if (outcome.status === 'applied') {
        resendComputedDependents(
          tx,
          sinceSeq,
          options.computedDependentLimit ?? DEFAULT_COMPUTED_DEPENDENT_LIMIT
        );
      }
      storeOutcome(tx, { mutation, actor, outcome, now });
      return outcome;
    },
    { behavior: 'immediate' }
  );
  if (outcome.status === 'applied') invalidateComputedItem(db, mutation.entityId);
  return outcome;
}

/** Run mutations in array order, each in its own transaction, and return their outcomes in the same order. */
export function runMutations(
  db: CommandDb,
  batch: readonly Mutation[],
  actor: CommandActor,
  options: EngineOptions = {}
): Outcome[] {
  return batch.map((mutation) => runMutation(db, mutation, actor, options));
}
