import { TRANSACTION_TYPE_OPTIONS, type TransactionType } from '../../../../lib/transaction-type';

export const TYPE_OPTIONS = [{ value: '', label: '— none —' }, ...TRANSACTION_TYPE_OPTIONS];

export const MATCH_TYPE_OPTIONS = [
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

export type TxnType = TransactionType;

export function parseTxnType(raw: string): TxnType | undefined {
  if (raw === '') return undefined;
  return raw as TxnType;
}
