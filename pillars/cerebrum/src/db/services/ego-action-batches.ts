/**
 * Persistence for Ego action batches and their paused loop state.
 *
 * Functions take a `CerebrumDb` handle as their first argument.
 */
import { and, asc, eq } from 'drizzle-orm';

import { egoActionBatches } from '../schema.js';
import { EGO_BATCH_STATUSES, EgoBatchTransitionError } from './ego-action-batches-types.js';

import type {
  EgoActionBatchRow,
  EgoBatchStatus,
  InsertEgoActionBatchRow,
} from './ego-action-batches-types.js';
import type { CerebrumDb } from './internal.js';

type StoredBatch = typeof egoActionBatches.$inferSelect;

const ALLOWED_TRANSITIONS: Readonly<Record<EgoBatchStatus, readonly EgoBatchStatus[]>> = {
  pending: ['decided'],
  decided: ['continued'],
  continued: [],
  auto: [],
};

function isEgoBatchStatus(value: string): value is EgoBatchStatus {
  return EGO_BATCH_STATUSES.some((status) => status === value);
}

function parseLoopState(value: string | null): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toRow(stored: StoredBatch): EgoActionBatchRow {
  if (!isEgoBatchStatus(stored.status)) {
    throw new Error(`Ego action batch '${stored.id}' has unknown status '${stored.status}'`);
  }
  return {
    id: stored.id,
    conversationId: stored.conversationId,
    messageId: stored.messageId,
    status: stored.status,
    loopState: parseLoopState(stored.loopState),
    createdAt: stored.createdAt,
    decidedAt: stored.decidedAt,
  };
}

/** Insert one batch; `loopState` is stored as JSON and `status` defaults to `pending`. */
export function insertBatch(db: CerebrumDb, row: InsertEgoActionBatchRow): void {
  const loopState =
    row.status === 'auto' || row.loopState == null ? null : JSON.stringify(row.loopState);
  db.insert(egoActionBatches)
    .values({
      id: row.id,
      conversationId: row.conversationId,
      messageId: row.messageId,
      status: row.status ?? 'pending',
      loopState: loopState ?? null,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt ?? null,
    })
    .run();
}

/** Read one batch by id, or `null` when it does not exist. */
export function getBatch(db: CerebrumDb, id: string): EgoActionBatchRow | null {
  const stored = db.select().from(egoActionBatches).where(eq(egoActionBatches.id, id)).get();
  return stored ? toRow(stored) : null;
}

/** Batches of one conversation, oldest first with a stable id tie-break. */
export function listBatchesForConversation(
  db: CerebrumDb,
  conversationId: string
): EgoActionBatchRow[] {
  return db
    .select()
    .from(egoActionBatches)
    .where(eq(egoActionBatches.conversationId, conversationId))
    .orderBy(asc(egoActionBatches.createdAt), asc(egoActionBatches.id))
    .all()
    .map(toRow);
}

/**
 * Move a batch through its lifecycle.
 *
 * A single `UPDATE ... WHERE id = ? AND status = ?` is the concurrency guard for
 * deciding and resuming a batch. Replays return false; invalid lifecycle edges
 * throw before the database is touched. `auto` batches never transition.
 */
export function transitionBatch(
  db: CerebrumDb,
  input: { id: string; from: EgoBatchStatus; to: EgoBatchStatus; decidedAt?: string | null }
): boolean {
  if (!ALLOWED_TRANSITIONS[input.from].includes(input.to)) {
    throw new EgoBatchTransitionError(input.from, input.to);
  }
  const changes = db
    .update(egoActionBatches)
    .set({
      status: input.to,
      ...(input.to === 'decided' && input.decidedAt !== undefined
        ? { decidedAt: input.decidedAt }
        : {}),
    })
    .where(and(eq(egoActionBatches.id, input.id), eq(egoActionBatches.status, input.from)))
    .run().changes;
  return changes === 1;
}
