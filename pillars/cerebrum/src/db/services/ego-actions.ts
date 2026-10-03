/**
 * Persistence for the writes Ego proposes inside an action batch.
 *
 * Functions take a `CerebrumDb` handle as their first argument.
 */
import { and, asc, eq } from 'drizzle-orm';

import { egoActions } from '../schema.js';
import { EGO_ACTION_STATUSES, EgoActionTransitionError } from './ego-actions-types.js';

import type { EgoActionRow, EgoActionStatus, InsertEgoActionRow } from './ego-actions-types.js';
import type { CerebrumDb } from './internal.js';

type StoredAction = typeof egoActions.$inferSelect;

const ALLOWED_TRANSITIONS: Readonly<Record<EgoActionStatus, readonly EgoActionStatus[]>> = {
  pending: ['confirmed', 'rejected', 'failed'],
  confirmed: ['executed', 'failed'],
  rejected: [],
  executed: [],
  failed: [],
};

function isEgoActionStatus(value: string): value is EgoActionStatus {
  return EGO_ACTION_STATUSES.some((status) => status === value);
}

function toRow(stored: StoredAction): EgoActionRow {
  if (!isEgoActionStatus(stored.status)) {
    throw new Error(`Ego action '${stored.id}' has unknown status '${stored.status}'`);
  }
  return {
    id: stored.id,
    batchId: stored.batchId,
    conversationId: stored.conversationId,
    messageId: stored.messageId,
    toolUseId: stored.toolUseId,
    position: stored.position,
    tool: stored.tool,
    args: JSON.parse(stored.args),
    summary: stored.summary,
    status: stored.status,
    result: stored.result,
    createdAt: stored.createdAt,
    resolvedAt: stored.resolvedAt,
  };
}

/** Insert one action; `args` is stored as JSON text and `status` defaults to `pending`. */
export function insertAction(db: CerebrumDb, row: InsertEgoActionRow): void {
  db.insert(egoActions)
    .values({
      id: row.id,
      batchId: row.batchId,
      conversationId: row.conversationId,
      messageId: row.messageId,
      toolUseId: row.toolUseId,
      position: row.position,
      tool: row.tool,
      args: JSON.stringify(row.args),
      summary: row.summary,
      status: row.status ?? 'pending',
      result: row.result ?? null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? null,
    })
    .run();
}

/** Read one action by id, or `null` when it does not exist. */
export function getAction(db: CerebrumDb, id: string): EgoActionRow | null {
  const stored = db.select().from(egoActions).where(eq(egoActions.id, id)).get();
  return stored ? toRow(stored) : null;
}

/** Actions of one batch in `position` order. */
export function listActionsForBatch(db: CerebrumDb, batchId: string): EgoActionRow[] {
  return db
    .select()
    .from(egoActions)
    .where(eq(egoActions.batchId, batchId))
    .orderBy(asc(egoActions.position))
    .all()
    .map(toRow);
}

/** Every action of a conversation, oldest first. */
export function listActionsForConversation(db: CerebrumDb, conversationId: string): EgoActionRow[] {
  return db
    .select()
    .from(egoActions)
    .where(eq(egoActions.conversationId, conversationId))
    .orderBy(asc(egoActions.createdAt), asc(egoActions.position))
    .all()
    .map(toRow);
}

/** Input for {@link transitionAction}. */
export interface TransitionActionInput {
  id: string;
  from: EgoActionStatus;
  to: EgoActionStatus;
  result?: string | null;
  resolvedAt?: string | null;
}

/**
 * Move an action from one status to another.
 *
 * Issues a single `UPDATE ... WHERE id = ? AND status = ?` and returns true only
 * when exactly one row changed. That statement is the only concurrency guard for
 * an action: a double tap or replay finds the status already moved and gets
 * false, so a write executes at most once. Pairs outside the lifecycle throw
 * {@link EgoActionTransitionError} before the database is touched.
 */
export function transitionAction(db: CerebrumDb, input: TransitionActionInput): boolean {
  if (!ALLOWED_TRANSITIONS[input.from].includes(input.to)) {
    throw new EgoActionTransitionError(input.from, input.to);
  }
  const changes = db
    .update(egoActions)
    .set({
      status: input.to,
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.resolvedAt !== undefined ? { resolvedAt: input.resolvedAt } : {}),
    })
    .where(and(eq(egoActions.id, input.id), eq(egoActions.status, input.from)))
    .run().changes;
  return changes === 1;
}
