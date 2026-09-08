import { useCallback } from 'react';

import { promptToLearn } from '../hooks/learn-prompt';
import { replaceByChecksum } from '../hooks/local-tx-reconcile';

import type { Dispatch, SetStateAction } from 'react';

import type { TransactionType } from '../../../lib/transaction-type';
import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from '../hooks/local-tx-reconcile';
import type { RecomputeForEntity } from '../hooks/useSuggestedTagRecompute';

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
  /**
   * A type chosen alongside this entity assignment (the inline picker's
   * forced-type prompt, for a row that needed one). Falls back to whatever
   * type the row already carried — a rule/AI/descriptor match is never
   * clobbered by a plain entity re-pick.
   */
  transactionType?: TransactionType;
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
 * Also clears a stale `error` left over from the row's earlier `uncertain`/
 * `failed` life — the blind `...transaction` spread used to carry it forward
 * onto an otherwise fully-resolved row, showing a bogus "No entity match
 * found" under a card that had, in fact, just been matched.
 *
 * Exported for unit testing the dedupe/replace invariant.
 */
export function moveOneToMatched(prev: LocalTxState, args: MoveArgs): LocalTxState {
  const { transaction, entityId, entityName, matchType, transactionType } = args;
  return replaceByChecksum(prev, transaction.checksum, 'matched', () => ({
    ...transaction,
    entity: { entityId, entityName, matchType, confidence: 1 },
    status: 'matched' as const,
    transactionType: transactionType ?? transaction.transactionType,
    error: undefined,
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

/** The proposal seed every assignment path builds from its triggering row. */
function proposalArgs(transaction: ProcessedTransaction, entityId: string, entityName: string) {
  return {
    triggeringTransaction: transaction,
    entityId,
    entityName,
    location: transaction.location ?? null,
    transactionType: transaction.transactionType ?? null,
  };
}

interface UseReviewActionsArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  findSimilar: (t: ProcessedTransaction) => ProcessedTransaction[];
  generateProposal: GenerateProposal;
  /**
   * Re-derives `suggestedTags` against the entity the user just picked. The
   * bucket move below carries the row's tag set through untouched, and that
   * set was computed for a different entity (usually none at all) — see
   * {@link useSuggestedTagRecompute}.
   */
  recomputeForEntity: RecomputeForEntity;
}

type BulkArgs = Pick<
  UseReviewActionsArgs,
  'setLocalTransactions' | 'generateProposal' | 'recomputeForEntity'
>;

function useHandleBulkEntitySelect({
  setLocalTransactions,
  generateProposal,
  recomputeForEntity,
}: BulkArgs) {
  return useCallback(
    (
      transactions: ProcessedTransaction[],
      entityId: string,
      entityName: string,
      transactionType?: TransactionType
    ) => {
      if (transactions.length === 0) return;
      setLocalTransactions((prev) => {
        let updated = prev;
        for (const t of transactions) {
          updated = moveOneToMatched(updated, {
            transaction: t,
            entityId,
            entityName,
            matchType: 'manual',
            transactionType,
          });
        }
        return updated;
      });
      void recomputeForEntity(transactions, entityId);
      const firstTx = transactions[0];
      if (firstTx) void generateProposal(proposalArgs(firstTx, entityId, entityName));
    },
    [generateProposal, recomputeForEntity, setLocalTransactions]
  );
}

function useHandleEntitySelect({
  setLocalTransactions,
  findSimilar,
  generateProposal,
  recomputeForEntity,
}: UseReviewActionsArgs) {
  return useCallback(
    (
      transaction: ProcessedTransaction,
      entityId: string,
      entityName: string,
      transactionType?: TransactionType
    ) => {
      const similar = findSimilar(transaction);
      setLocalTransactions((prev) =>
        moveOneToMatched(prev, {
          transaction,
          entityId,
          entityName,
          matchType: 'manual',
          transactionType,
        })
      );
      void recomputeForEntity([transaction], entityId);
      const propose = () => generateProposal(proposalArgs(transaction, entityId, entityName));
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
    [findSimilar, generateProposal, recomputeForEntity, setLocalTransactions]
  );
}

export function useReviewActions(args: UseReviewActionsArgs) {
  const handleBulkEntitySelect = useHandleBulkEntitySelect(args);
  const handleEntitySelect = useHandleEntitySelect(args);
  return { handleBulkEntitySelect, handleEntitySelect };
}
