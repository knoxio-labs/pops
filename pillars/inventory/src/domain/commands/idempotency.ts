import { eq } from 'drizzle-orm';

import { mutations } from '../../db/index.js';
import { actorKey, type CommandActor, type Mutation } from './envelope.js';
import { storedOutcomeSchema, type Outcome, type StoredOutcome } from './outcome.js';

import type { CommandDb } from './entities.js';

/**
 * The outcome a retried mutation replays, or `null` when `mutationId` is new.
 * A retry naming a different op or entity than the one first decided is
 * refused rather than replayed, since replaying would report an outcome for a
 * change the client did not make.
 */
export function replayOutcome(db: CommandDb, mutation: Mutation): Outcome | null {
  const stored = db
    .select()
    .from(mutations)
    .where(eq(mutations.mutationId, mutation.mutationId))
    .get();
  if (!stored) return null;
  if (stored.op !== mutation.op || stored.entityId !== mutation.entityId) {
    return {
      mutationId: mutation.mutationId,
      status: 'rejected',
      reason: 'invalid',
      message: `mutation ${mutation.mutationId} was already used for ${stored.op} on ${stored.entityId}`,
    };
  }
  return storedOutcomeSchema.parse(JSON.parse(stored.outcome));
}

/**
 * The first of `dependsOn` that has not applied on this server (unknown here,
 * or decided as a conflict or rejection), or `null` when every one applied.
 */
export function pendingDependency(db: CommandDb, dependsOn: readonly string[]): string | null {
  for (const dependency of dependsOn) {
    const row = db
      .select({ status: mutations.status })
      .from(mutations)
      .where(eq(mutations.mutationId, dependency))
      .get();
    if (row?.status !== 'applied') return dependency;
  }
  return null;
}

/** A decided mutation, ready to store. */
export interface DecidedMutation {
  readonly mutation: Mutation;
  readonly actor: CommandActor;
  readonly outcome: StoredOutcome;
  readonly now: string;
}

/** Store a decided outcome under the mutation's id, in the caller's transaction. */
export function storeOutcome(
  db: CommandDb,
  { mutation, actor, outcome, now }: DecidedMutation
): void {
  db.insert(mutations)
    .values({
      mutationId: mutation.mutationId,
      actorId: actorKey(actor),
      op: mutation.op,
      entityId: mutation.entityId,
      status: outcome.status,
      outcome: JSON.stringify(outcome),
      receivedAt: now,
    })
    .run();
}
