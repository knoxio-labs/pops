/** Lifecycle states of an Ego action batch. */
export const EGO_BATCH_STATUSES = ['pending', 'decided', 'continued', 'auto'] as const;

export type EgoBatchStatus = (typeof EGO_BATCH_STATUSES)[number];

/** One persisted group of proposed or automatically executed writes. */
export interface EgoActionBatchRow {
  id: string;
  conversationId: string;
  messageId: string;
  status: EgoBatchStatus;
  loopState: unknown | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Fields accepted when inserting a batch. `status` defaults to `pending`. */
export interface InsertEgoActionBatchRow {
  id: string;
  conversationId: string;
  messageId: string;
  status?: EgoBatchStatus;
  loopState?: unknown | null;
  createdAt: string;
  decidedAt?: string | null;
}

/** Thrown when a requested status change is not an allowed edge of the batch lifecycle. */
export class EgoBatchTransitionError extends Error {
  override readonly name = 'EgoBatchTransitionError' as const;
  readonly from: EgoBatchStatus;
  readonly to: EgoBatchStatus;

  constructor(from: EgoBatchStatus, to: EgoBatchStatus) {
    super(`Ego action batch cannot move from '${from}' to '${to}'`);
    this.from = from;
    this.to = to;
  }
}
