import { Button } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';
import { needsTransactionType } from '../review/buildConfirmed';
import { ForcedTypePrompt } from './ForcedTypePrompt';
import { type PendingAssignment, usePendingTypedAssignment } from './usePendingTypedAssignment';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../../lib/transaction-type';

export interface TypedEntityPickerProps {
  transaction: ProcessedTransaction;
  entities?: Array<{ id: string; name: string }>;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onCreateEntityWithName?: (
    transaction: ProcessedTransaction,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  /** Resolve the row with deliberately no merchant (POPS-3748). Omitted, the action does not render. */
  onLeaveUnassigned?: (
    transaction: ProcessedTransaction,
    transactionType?: TransactionType
  ) => void;
}

/** The forced-type prompt's message, naming the pending pick or the leave-unassigned choice. */
function promptMessage(pending: PendingAssignment): string {
  if (pending.kind === 'none') {
    return 'This is a credit with no type yet — choose one to leave it unassigned.';
  }
  return `This is a credit with no type yet — choose one to finish assigning “${pending.entityName}”.`;
}

function LeaveUnassignedButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onClick}>
      Leave unassigned
    </Button>
  );
}

/** Applies whichever pending assignment the forced-type prompt was blocking, now that a type is chosen. */
function applyPending(
  props: Pick<
    TypedEntityPickerProps,
    'transaction' | 'onEntitySelect' | 'onCreateEntityWithName' | 'onLeaveUnassigned'
  >,
  assignment: PendingAssignment,
  chosenType: TransactionType
): void {
  const { transaction, onEntitySelect, onCreateEntityWithName, onLeaveUnassigned } = props;
  if (assignment.kind === 'select') {
    onEntitySelect?.(transaction, assignment.entityId, assignment.entityName, chosenType);
    return;
  }
  if (assignment.kind === 'create') {
    onCreateEntityWithName?.(transaction, assignment.entityName, chosenType);
    return;
  }
  onLeaveUnassigned?.(transaction, chosenType);
}

/**
 * The picker itself, plus the forced-type prompt for a credit with no type
 * yet (POPS-2754) — `moveOneToMatched` would otherwise carry the row into
 * `matched` still untyped. Split out of `EntitySection` to keep the pending-
 * assignment state machine's branching out of the parent component.
 */
export function TypedEntityPicker(props: TypedEntityPickerProps) {
  const { transaction, entities, onEntitySelect, onCreateEntityWithName, onLeaveUnassigned } =
    props;
  const forceType = needsTransactionType(transaction);
  const { pending, type, setType, request, cancel, confirm } = usePendingTypedAssignment(
    (assignment, chosenType) => applyPending(props, assignment, chosenType)
  );

  return (
    <>
      <EntitySelect
        entities={entities ?? []}
        value={pending?.kind === 'select' ? pending.entityId : (transaction.entity?.entityId ?? '')}
        onChange={(entityId, entityName) => {
          if (forceType) {
            request({ kind: 'select', entityId, entityName });
            return;
          }
          onEntitySelect?.(transaction, entityId, entityName);
        }}
        onCreate={
          onCreateEntityWithName
            ? (entityName) => {
                if (forceType) {
                  request({ kind: 'create', entityName });
                  return;
                }
                onCreateEntityWithName(transaction, entityName);
              }
            : undefined
        }
      />
      {onLeaveUnassigned && (
        <LeaveUnassignedButton
          onClick={() => (forceType ? request({ kind: 'none' }) : onLeaveUnassigned(transaction))}
        />
      )}
      {pending && (
        <ForcedTypePrompt
          message={promptMessage(pending)}
          type={type}
          onTypeChange={setType}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </>
  );
}
