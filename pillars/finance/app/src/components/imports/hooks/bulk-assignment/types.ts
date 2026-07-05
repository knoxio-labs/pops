import { moveOneToMatched } from '../../review/useReviewActions';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { LocalTxState } from '../local-tx-reconcile';

export type { LocalTxState } from '../local-tx-reconcile';

export interface UseBulkAssignmentArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  handleEntitySelect: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  openRuleProposalDialog: (
    triggeringTransaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  generateProposal: (args: {
    triggeringTransaction: ProcessedTransaction;
    entityId: string | null;
    entityName: string | null;
    location?: string | null;
    transactionType?: 'purchase' | 'transfer' | 'income' | null;
  }) => Promise<void>;
}

export function pluralize(count: number): string {
  return `${count} transaction${count !== 1 ? 's' : ''}`;
}

/**
 * Bulk sibling of `moveOneToMatched` — assigns the same entity to every
 * transaction in `transactions`, one at a time, through the same
 * checksum-based dedupe/replace-in-place invariant (#3590). Without routing
 * through `moveOneToMatched`, a transaction already in `matched` (e.g.
 * re-running Accept All / Create-entity-for-all) gets appended a second time
 * instead of replaced, producing a duplicate-checksum row that fails the
 * unique index at commit (#3620).
 */
export function moveToMatched(
  prev: LocalTxState,
  transactions: ProcessedTransaction[],
  entity: { entityId: string; entityName: string; matchType?: 'manual' | 'ai' }
): LocalTxState {
  // Default to 'manual' so EntitySection (which renders the AI-suggestion
  // panel for matchType === 'ai') doesn't keep prompting the user to accept
  // a suggestion they already accepted via Accept All / Create new for all.
  const matchType = entity.matchType ?? 'manual';
  let updated: LocalTxState = prev;
  for (const transaction of transactions) {
    updated = moveOneToMatched(updated, {
      transaction,
      entityId: entity.entityId,
      entityName: entity.entityName,
      matchType,
    });
  }
  return updated;
}
