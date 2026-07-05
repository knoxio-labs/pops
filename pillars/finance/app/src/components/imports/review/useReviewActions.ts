import { useCallback } from 'react';

import { replaceByChecksum } from '../hooks/local-tx-reconcile';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from '../hooks/local-tx-reconcile';

export type { LocalTxState } from '../hooks/local-tx-reconcile';

type GenerateProposal = (args: {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: 'purchase' | 'transfer' | 'income' | null;
}) => Promise<void>;

export interface MoveArgs {
  transaction: ProcessedTransaction;
  entityId: string;
  entityName: string;
  matchType: 'manual' | 'ai';
}

/**
 * Move a transaction into the `matched` bucket with the chosen entity, removing
 * any prior copy of it from every bucket first.
 *
 * Thin wrapper around the canonical `replaceByChecksum` identity (#3590/#3620):
 * any prior copy of the checksum is dropped from every bucket — including
 * collapsing duplicate `matched` entries down to a single one — so the result
 * holds exactly one copy per checksum. When it already lives in `matched`
 * (e.g. re-assigning the entity on a rule-matched card) the replacement keeps
 * the original card's position; otherwise it is appended.
 *
 * Exported for unit testing the dedupe/replace invariant.
 */
export function moveOneToMatched(prev: LocalTxState, args: MoveArgs): LocalTxState {
  const { transaction, entityId, entityName, matchType } = args;
  return replaceByChecksum(prev, transaction.checksum, 'matched', () => ({
    ...transaction,
    entity: { entityId, entityName, matchType, confidence: 1 },
    status: 'matched' as const,
  }));
}

interface UseReviewActionsArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  findSimilar: (t: ProcessedTransaction) => ProcessedTransaction[];
  generateProposal: GenerateProposal;
}

export function useReviewActions({
  setLocalTransactions,
  findSimilar,
  generateProposal,
}: UseReviewActionsArgs) {
  const handleBulkEntitySelect = useCallback(
    (transactions: ProcessedTransaction[], entityId: string, entityName: string) => {
      if (transactions.length === 0) return;
      setLocalTransactions((prev) => {
        let updated = prev;
        for (const t of transactions) {
          updated = moveOneToMatched(updated, {
            transaction: t,
            entityId,
            entityName,
            matchType: 'manual',
          });
        }
        return updated;
      });
      const firstTx = transactions[0];
      if (firstTx) {
        void generateProposal({
          triggeringTransaction: firstTx,
          entityId,
          entityName,
          location: firstTx.location ?? null,
          transactionType: firstTx.transactionType ?? null,
        });
      }
    },
    [generateProposal, setLocalTransactions]
  );

  const handleEntitySelect = useCallback(
    (transaction: ProcessedTransaction, entityId: string, entityName: string) => {
      const similar = findSimilar(transaction);
      setLocalTransactions((prev) =>
        moveOneToMatched(prev, { transaction, entityId, entityName, matchType: 'manual' })
      );
      if (similar.length > 0) {
        void generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: transaction.location ?? null,
          transactionType: transaction.transactionType ?? null,
        });
      }
    },
    [findSimilar, generateProposal, setLocalTransactions]
  );

  return { handleBulkEntitySelect, handleEntitySelect };
}
