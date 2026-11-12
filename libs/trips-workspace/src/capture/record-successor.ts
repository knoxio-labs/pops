import { containsFields, sameFields } from './record-field-match';

type RevisionRow = { id: number; tripId: number; revision: number; removedAt: string | null };

/** Accept only the unchanged original receipt successor, never a later read or replay revision. */
export function ownRecordSuccessor<Row extends RevisionRow>({
  revision,
  input,
  receipt,
  current,
  tripId,
}: {
  revision: number;
  input: Partial<Row>;
  receipt: Row | undefined;
  current: Row | undefined;
  tripId: number | undefined;
}): Row | undefined {
  if (
    receipt === undefined ||
    current === undefined ||
    tripId === undefined ||
    receipt.tripId !== tripId ||
    receipt.removedAt !== null ||
    receipt.revision !== revision + 1 ||
    !sameFields(receipt, current) ||
    !containsFields(receipt, input)
  )
    return undefined;
  return receipt;
}
