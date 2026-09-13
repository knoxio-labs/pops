import { Button, Label } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';
import { ForcedTypePrompt } from '../transaction-card/ForcedTypePrompt';
import { type PendingAssignment } from '../transaction-card/usePendingTypedAssignment';
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
  onLeaveUnassigned: (transaction: ProcessedTransaction, transactionType?: TransactionType) => void;
  onClose: () => void;
}

/** The bulk forced-type prompt's message, naming the pending pick or the leave-unassigned choice. */
function bulkPromptMessage(pending: PendingAssignment, count: number): string {
  if (pending.kind === 'none') {
    return `At least one of these is a credit with no type yet — choose one to leave all ${count} transactions unassigned.`;
  }
  return `At least one of these is a credit with no type yet — choose one to finish assigning “${pending.entityName}” to all ${count} transactions.`;
}

type BulkAssignmentControlsProps = Pick<
  BulkEntitySelectorProps,
  'group' | 'entities' | 'onCreateAndAssignAll' | 'onClose'
> &
  ReturnType<typeof useBulkTypedAssignment>;

/** The picker, the leave-unassigned action, and the forced-type prompt once one of them needs it. */
function BulkAssignmentControls(props: BulkAssignmentControlsProps) {
  const { group, entities, onCreateAndAssignAll, onClose, forceType } = props;
  const {
    applyAssignment,
    applyLeaveUnassigned,
    pending,
    type,
    setType,
    request,
    cancel,
    confirm,
  } = props;

  return (
    <>
      <EntitySelect
        entities={entities}
        placeholder="Choose entity..."
        onChange={(entityId, entityName) => {
          if (forceType) return request({ kind: 'select', entityId, entityName });
          applyAssignment(entityId, entityName);
          onClose();
        }}
        onCreate={(entityName) => {
          if (forceType) return request({ kind: 'create', entityName });
          onCreateAndAssignAll(group.transactions, entityName);
          onClose();
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => {
          if (forceType) return request({ kind: 'none' });
          applyLeaveUnassigned();
          onClose();
        }}
      >
        Leave all unassigned
      </Button>
      {pending && (
        <ForcedTypePrompt
          message={bulkPromptMessage(pending, group.transactions.length)}
          type={type}
          onTypeChange={setType}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </>
  );
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
  onLeaveUnassigned,
  onClose,
}: BulkEntitySelectorProps) {
  const assignment = useBulkTypedAssignment({
    group,
    onBulkEntitySelect,
    onEntitySelect,
    onCreateAndAssignAll,
    onLeaveUnassigned,
    onClose,
  });

  return (
    <div className="mt-3 p-3 bg-card rounded-lg border border-border">
      <Label className="block mb-2">
        Select entity to assign to all {group.transactions.length} transactions:
      </Label>
      <BulkAssignmentControls
        group={group}
        entities={entities}
        onCreateAndAssignAll={onCreateAndAssignAll}
        onClose={onClose}
        {...assignment}
      />
    </div>
  );
}
