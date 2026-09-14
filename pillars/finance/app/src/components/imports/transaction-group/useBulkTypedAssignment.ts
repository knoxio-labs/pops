import { needsTransactionType } from '../review/buildConfirmed';
import { usePendingTypedAssignment } from '../transaction-card/usePendingTypedAssignment';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../../lib/transaction-type';
import type { TransactionGroup as TransactionGroupType } from '../../../lib/transaction-utils';

interface UseBulkTypedAssignmentArgs {
  group: TransactionGroupType;
  onBulkEntitySelect?: (
    transactions: ProcessedTransaction[],
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onEntitySelect: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onCreateAndAssignAll: (
    transactions: ProcessedTransaction[],
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onLeaveUnassigned: (transaction: ProcessedTransaction, transactionType?: TransactionType) => void;
  onClose: () => void;
}

/**
 * Whether the group's bulk pick needs a forced type first, plus the
 * pending-assignment state machine wired to apply it across every
 * transaction in the group once one is chosen (POPS-2754).
 */
export function useBulkTypedAssignment(args: UseBulkTypedAssignmentArgs) {
  const {
    group,
    onBulkEntitySelect,
    onEntitySelect,
    onCreateAndAssignAll,
    onLeaveUnassigned,
    onClose,
  } = args;
  const forceType = group.transactions.some((t) => needsTransactionType(t));

  const applyAssignment = (
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => {
    if (onBulkEntitySelect) {
      onBulkEntitySelect(group.transactions, entityId, entityName, transactionType);
    } else {
      for (const t of group.transactions) onEntitySelect(t, entityId, entityName, transactionType);
    }
  };

  /** Loops the per-row action: unlike a pick, there is no bulk store write for this. */
  const applyLeaveUnassigned = (transactionType?: TransactionType) => {
    for (const t of group.transactions) {
      onLeaveUnassigned(t, needsTransactionType(t) ? transactionType : undefined);
    }
  };

  const pendingAssignment = usePendingTypedAssignment((assignment, chosenType) => {
    if (assignment.kind === 'select') {
      applyAssignment(assignment.entityId, assignment.entityName, chosenType);
    } else if (assignment.kind === 'create') {
      onCreateAndAssignAll(group.transactions, assignment.entityName, chosenType);
    } else {
      applyLeaveUnassigned(chosenType);
    }
    onClose();
  });

  return { forceType, applyAssignment, applyLeaveUnassigned, ...pendingAssignment };
}
