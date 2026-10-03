/** Lifecycle states of one proposed write, in the order they are normally reached. */
export const EGO_ACTION_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'executed',
  'failed',
] as const;

export type EgoActionStatus = (typeof EGO_ACTION_STATUSES)[number];

/** One proposed or already executed write inside a batch. `args` is the parsed tool input. */
export interface EgoActionRow {
  id: string;
  batchId: string;
  conversationId: string;
  messageId: string;
  toolUseId: string;
  position: number;
  tool: string;
  args: unknown;
  summary: string;
  status: EgoActionStatus;
  result: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Fields accepted when inserting an action. `status` defaults to `pending`; pass
 * `executed` or `failed` to record a write that already ran.
 */
export interface InsertEgoActionRow {
  id: string;
  batchId: string;
  conversationId: string;
  messageId: string;
  toolUseId: string;
  position: number;
  tool: string;
  args: unknown;
  summary: string;
  status?: EgoActionStatus;
  result?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

/** Thrown when a requested status change is not an allowed edge of the action lifecycle. */
export class EgoActionTransitionError extends Error {
  override readonly name = 'EgoActionTransitionError' as const;
  readonly from: EgoActionStatus;
  readonly to: EgoActionStatus;

  constructor(from: EgoActionStatus, to: EgoActionStatus) {
    super(`Ego action cannot move from '${from}' to '${to}'`);
    this.from = from;
    this.to = to;
  }
}
