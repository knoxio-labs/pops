import { Label } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';
import { ForcedTypePrompt } from '../transaction-card/ForcedTypePrompt';
import { useBulkTypedAssignment } from './useBulkTypedAssignment';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../../lib/transaction-type';
import type { TransactionGroup as TransactionGroupType } from '../../../lib/transaction-utils';

export interface BulkEntitySelectorProps {
  group: TransactionGroupType;
  entities: Array<{ id: string; name: string }>;
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
 * Group-wide entity picker. When any transaction in the group is a credit
 * with no type yet, applying the pick is deferred behind the same
 * forced-type prompt `EntitySection` uses for a single row (POPS-2754) —
 * otherwise the whole group would land in `matched` still untyped and get
 * silently excluded from import.
 */
export function BulkEntitySelector({
  group,
  entities,
  onBulkEntitySelect,
  onEntitySelect,
  onCreateAndAssignAll,
  onClose,
}: BulkEntitySelectorProps) {
  const { forceType, applyAssignment, pending, type, setType, request, cancel, confirm } =
    useBulkTypedAssignment({
      group,
      onBulkEntitySelect,
      onEntitySelect,
      onCreateAndAssignAll,
      onClose,
    });

  return (
    <div className="mt-3 p-3 bg-card rounded-lg border border-border">
      <Label className="block mb-2">
        Select entity to assign to all {group.transactions.length} transactions:
      </Label>
      <EntitySelect
        entities={entities}
        placeholder="Choose entity..."
        onChange={(entityId, entityName) => {
          if (forceType) {
            request({ kind: 'select', entityId, entityName });
            return;
          }
          applyAssignment(entityId, entityName);
          onClose();
        }}
        onCreate={(entityName) => {
          if (forceType) {
            request({ kind: 'create', entityName });
            return;
          }
          onCreateAndAssignAll(group.transactions, entityName);
          onClose();
        }}
      />
      {pending && (
        <ForcedTypePrompt
          message={`At least one of these is a credit with no type yet — choose one to finish assigning “${pending.entityName}” to all ${group.transactions.length} transactions.`}
          type={type}
          onTypeChange={setType}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </div>
  );
}
