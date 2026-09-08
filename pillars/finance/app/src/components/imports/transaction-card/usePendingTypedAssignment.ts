import { useState } from 'react';

import type { TransactionType } from '../../../lib/transaction-type';

export type PendingAssignment =
  | { kind: 'select'; entityId: string; entityName: string }
  | { kind: 'create'; entityName: string };

/**
 * Holds an entity pick/create that is waiting on a required transaction type
 * before it can be applied. A credit with no type would otherwise reach
 * `moveOneToMatched` still untyped and get silently excluded from import
 * (POPS-2754) — this is the state machine behind the "choose a type first"
 * prompt shared by `EntitySection` (single row) and `TransactionGroup`'s bulk
 * picker.
 */
export function usePendingTypedAssignment(
  onConfirm: (pending: PendingAssignment, type: TransactionType) => void
) {
  const [pending, setPending] = useState<PendingAssignment | null>(null);
  const [type, setType] = useState<TransactionType | undefined>(undefined);

  const cancel = () => {
    setPending(null);
    setType(undefined);
  };

  const confirm = () => {
    if (!pending || !type) return;
    onConfirm(pending, type);
    cancel();
  };

  return { pending, type, setType, request: setPending, cancel, confirm };
}
