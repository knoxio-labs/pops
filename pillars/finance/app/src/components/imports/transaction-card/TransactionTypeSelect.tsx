import { Label, Select as UiSelect } from '@pops/ui';

import { TRANSACTION_TYPE_OPTIONS, type TransactionType } from '../../../lib/transaction-type';

interface TransactionTypeSelectProps {
  value: TransactionType | undefined;
  onChange: (next: TransactionType) => void;
  id?: string;
}

/**
 * Transaction-type picker shared by the full edit modal
 * (`EditableTransactionCard`) and the inline forced-type prompt in
 * `EntitySection`. `value` is `undefined` until a type has actually been
 * chosen, which the caller renders as the select's placeholder rather than
 * defaulting silently — a credit's type must be an explicit choice
 * (POPS-2754).
 */
export function TransactionTypeSelect({
  value,
  onChange,
  id = 'transactionType',
}: TransactionTypeSelectProps) {
  return (
    <div className="mb-4 p-3 bg-info/10 rounded-lg">
      <Label htmlFor={id} className="block mb-2 font-semibold">
        Transaction Type
      </Label>
      <UiSelect
        id={id}
        name="type"
        value={value ?? ''}
        placeholder="Select a type…"
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value as TransactionType);
        }}
        options={TRANSACTION_TYPE_OPTIONS}
      />
      <p className="text-xs mt-1 text-info">
        {value === 'transfer' &&
          "Transfers don't need an entity - they move money between accounts"}
        {value === 'income' && 'Income transactions: salary, interest, refunds, etc.'}
        {value === 'purchase' && 'Expenses require an entity (merchant/payee)'}
      </p>
    </div>
  );
}
