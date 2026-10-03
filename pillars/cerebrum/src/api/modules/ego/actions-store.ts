/**
 * Store for the writes Ego proposes inside an action batch.
 */
import { egoActionsService } from '../../../db/index.js';

import type {
  CerebrumDb,
  EgoActionRow,
  EgoActionStatus,
  InsertEgoActionRow,
} from '../../../db/index.js';

const RESOLVING_STATUSES: readonly EgoActionStatus[] = ['rejected', 'executed', 'failed'];

/** A new action id: `act_` followed by a random UUID. */
export function generateActionId(): string {
  return `act_${crypto.randomUUID()}`;
}

/** Fields accepted by {@link EgoActionStore.create}; timestamps are stamped by the store. */
export type CreateEgoActionInput = Omit<InsertEgoActionRow, 'createdAt' | 'resolvedAt'>;

/** Dependencies of {@link EgoActionStore}. */
export interface EgoActionStoreDeps {
  db: CerebrumDb;
  now?: () => Date;
}

/**
 * Records proposed writes and their outcomes. `tool` holds the gateway's own
 * dotted tool name. A status change goes through one conditional UPDATE, so
 * `transition` returns false when another caller already moved the action.
 */
export class EgoActionStore {
  private readonly db: CerebrumDb;
  private readonly now: () => Date;

  constructor(deps: EgoActionStoreDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
  }

  /** Insert an action, stamping `createdAt` and, for an already finished write, `resolvedAt`. */
  create(row: CreateEgoActionInput): void {
    const timestamp = this.now().toISOString();
    const status = row.status ?? 'pending';
    egoActionsService.insertAction(this.db, {
      ...row,
      status,
      createdAt: timestamp,
      resolvedAt: status === 'executed' || status === 'failed' ? timestamp : null,
    });
  }

  get(id: string): EgoActionRow | null {
    return egoActionsService.getAction(this.db, id);
  }

  listForBatch(batchId: string): EgoActionRow[] {
    return egoActionsService.listActionsForBatch(this.db, batchId);
  }

  listForConversation(conversationId: string): EgoActionRow[] {
    return egoActionsService.listActionsForConversation(this.db, conversationId);
  }

  /** Move an action between statuses; true only when this call made the change. */
  transition(id: string, from: EgoActionStatus, to: EgoActionStatus, result?: string): boolean {
    return egoActionsService.transitionAction(this.db, {
      id,
      from,
      to,
      result,
      resolvedAt: RESOLVING_STATUSES.includes(to) ? this.now().toISOString() : undefined,
    });
  }
}
