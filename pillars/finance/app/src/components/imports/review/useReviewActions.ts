import { useCallback } from 'react';

import { promptToLearn } from '../hooks/learn-prompt';
import { replaceByChecksum } from '../hooks/local-tx-reconcile';

import type { Dispatch, SetStateAction } from 'react';

import type { TransactionType } from '../../../lib/transaction-type';
import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from '../hooks/local-tx-reconcile';

export type { LocalTxState } from '../hooks/local-tx-reconcile';

type GenerateProposal = (args: {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: TransactionType | null;
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

/**
 * Whether picking `entityId` overrides an assignment the matcher made on its
 * own — a rule, an AI guess, or one of the deterministic alias/exact/prefix/
 * contains stages.
 *
 * This is the signal that the correction is worth learning: the matcher will
 * make the same call on the next import of this merchant unless a rule says
 * otherwise. `manual`/`none` are excluded — there is nothing to overrule in a
 * row the user assigned themselves or that was never matched at all.
 */
export function overridesAutomaticMatch(
  transaction: ProcessedTransaction,
  entityId: string
): boolean {
  const match = transaction.entity;
  if (!match || match.matchType === 'manual' || match.matchType === 'none') return false;
  return match.entityId !== entityId;
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
      const propose = () =>
        generateProposal({
          triggeringTransaction: transaction,
          entityId,
          entityName,
          location: transaction.location ?? null,
          transactionType: transaction.transactionType ?? null,
        });
      if (overridesAutomaticMatch(transaction, entityId) || similar.length > 0) {
        void propose();
        return;
      }
      // Re-picking the entity the row already carries corrects nothing, so
      // there is nothing to learn. The bucket move above still runs: accepting
      // an AI suggestion that already resolved to an entity id comes through
      // here, and that row has to leave `uncertain`.
      if (transaction.entity?.entityId === entityId) return;
      promptToLearn(() => void propose());
    },
    [findSimilar, generateProposal, setLocalTransactions]
  );

  return { handleBulkEntitySelect, handleEntitySelect };
}
