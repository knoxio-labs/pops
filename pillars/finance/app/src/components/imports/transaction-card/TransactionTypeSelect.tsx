import { useId } from 'react';

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
 * `EntitySection`/`TransactionGroup`. `value` is `undefined` until a type has
 * actually been chosen, which the caller renders as the select's placeholder
 * rather than defaulting silently — a credit's type must be an explicit
 * choice (POPS-2754).
 *
 * `id` defaults to a `useId()`-generated value rather than a fixed literal:
 * unlike the single edit-modal usage this replaced, the forced-type prompt
 * can be live on more than one row at once (a picker opened on two different
 * uncertain rows without confirming the first), and a shared literal id would
 * break every affected `<label htmlFor>` association once a second instance
 * mounts.
 */
export function TransactionTypeSelect({ value, onChange, id }: TransactionTypeSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="mb-4 p-3 bg-info/10 rounded-lg">
      <Label htmlFor={selectId} className="block mb-2 font-semibold">
        Transaction Type
      </Label>
      <UiSelect
        id={selectId}
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
