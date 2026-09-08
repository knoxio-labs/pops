import { useId } from 'react';

import { Button } from '@pops/ui';

import { TransactionTypeSelect } from './TransactionTypeSelect';

import type { TransactionType } from '../../../lib/transaction-type';

interface ForcedTypePromptProps {
  message: string;
  type: TransactionType | undefined;
  onTypeChange: (next: TransactionType) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Blocks an entity pick/create until a transaction type is chosen. Shared by
 * `EntitySection` (single-row picker) and `TransactionGroup`'s bulk picker —
 * see {@link usePendingTypedAssignment} for the state machine behind it.
 */
export function ForcedTypePrompt({
  message,
  type,
  onTypeChange,
  onConfirm,
  onCancel,
}: ForcedTypePromptProps) {
  const typeSelectId = useId();
  return (
    <div
      className="mt-2 p-2 rounded-md border border-warning/30 bg-warning/10 space-y-2"
      role="group"
      aria-label="Transaction type required"
    >
      <p className="text-xs text-warning">{message}</p>
      <TransactionTypeSelect id={typeSelectId} value={type} onChange={onTypeChange} />
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={!type}>
          Confirm
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
