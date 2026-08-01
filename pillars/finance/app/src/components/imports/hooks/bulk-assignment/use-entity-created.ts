import { useCallback } from 'react';
import { toast } from 'sonner';

import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';

export interface CreatedEntity {
  entityId: string;
  entityName: string;
}

interface UseAssignCreatedToGroupArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
}

/**
 * Assign a freshly created entity to every transaction in a group, then seed
 * the Correction Proposal dialog from the first one so the descriptor that
 * needed a new entity also earns a rule.
 *
 * Routes through `moveToMatched` for the checksum dedupe/replace invariant
 * (#3590/#3620): a transaction already in `matched` is replaced in place
 * rather than appended a second time.
 */
export function useAssignCreatedToGroup(args: UseAssignCreatedToGroupArgs) {
  const { setLocalTransactions, generateProposal } = args;
  return useCallback(
    (transactions: ProcessedTransaction[], entity: CreatedEntity) => {
      const firstTx = transactions[0];
      if (!firstTx) return;
      setLocalTransactions((prev) => moveToMatched(prev, transactions, entity));
      toast.success(
        `Created "${entity.entityName}" and assigned to ${pluralize(transactions.length)}`
      );
      void generateProposal({
        triggeringTransaction: firstTx,
        entityId: entity.entityId,
        entityName: entity.entityName,
        location: firstTx.location ?? null,
        transactionType: firstTx.transactionType ?? null,
      });
    },
    [setLocalTransactions, generateProposal]
  );
}

interface UseEntityCreatedArgs {
  selectedTransaction: ProcessedTransaction | null;
  setSelectedTransaction: Dispatch<SetStateAction<ProcessedTransaction | null>>;
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
}

/**
 * `EntityCreateDialog` completion handler: assigns the created entity to the
 * one transaction the dialog was opened for. Group-wide creation no longer
 * goes through the dialog — the group picker's create row names the entity and
 * calls {@link useAssignCreatedToGroup} directly.
 */
export function useEntityCreated(args: UseEntityCreatedArgs) {
  const { selectedTransaction, setSelectedTransaction, handleEntitySelect } = args;
  return useCallback(
    (entity: CreatedEntity) => {
      if (!selectedTransaction) return;
      handleEntitySelect(selectedTransaction, entity.entityId, entity.entityName);
      setSelectedTransaction(null);
    },
    [selectedTransaction, setSelectedTransaction, handleEntitySelect]
  );
}
