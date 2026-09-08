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
  onClose: () => void;
}

/**
 * Whether the group's bulk pick needs a forced type first, plus the
 * pending-assignment state machine wired to apply it across every
 * transaction in the group once one is chosen (POPS-2754).
 */
export function useBulkTypedAssignment(args: UseBulkTypedAssignmentArgs) {
  const { group, onBulkEntitySelect, onEntitySelect, onCreateAndAssignAll, onClose } = args;
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

  const pendingAssignment = usePendingTypedAssignment((assignment, chosenType) => {
    if (assignment.kind === 'select') {
      applyAssignment(assignment.entityId, assignment.entityName, chosenType);
    } else {
      onCreateAndAssignAll(group.transactions, assignment.entityName, chosenType);
    }
    onClose();
  });

  return { forceType, applyAssignment, ...pendingAssignment };
}
