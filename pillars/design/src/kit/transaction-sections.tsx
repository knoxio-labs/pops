import { accounts as allAccounts } from '@/fixtures/accounts';
import { currenciesByCode } from '@/fixtures/currencies';
import {
  AmountField,
  DirectionField,
  type EffectRow,
  LedgerEffect,
} from '@/kit/transaction-amount';
import {
  AccountField,
  DateField,
  DescriptionField,
  EntityField,
  FixedAccountField,
  TagsField,
} from '@/kit/transaction-fields';
import {
  deltaFor,
  type EntrySide,
  TODAY,
  toMinorUnits,
  type TransactionDraft,
  type TransactionErrors,
  type TransactionType,
  validate,
} from '@/kit/transaction-model';
import { ArrowDown } from 'lucide-react';
import { useState } from 'react';

/** A fixture account by id, for the accounts a draft names. */
export const byId = (id?: string) => allAccounts.find((account) => account.id === id);

/** How the modal arrived: which fields were decided before it opened. */
export interface Opening {
  type?: TransactionType;
  accountId?: string;
  toAccountId?: string;
  amount?: string;
  date?: string;
  description?: string;
  entity?: string;
  tags?: string[];
  /** The side that was preset by where the modal was opened from. */
  fixed?: EntrySide;
  fixedReason?: string;
  editing?: boolean;
  /** Open already validated, as a rejected save leaves the form. */
  submitted?: boolean;
}

/**
 * The draft the modal edits, and everything derived from it: the currency the
 * amount is denominated in, its value in minor units, and the errors. Errors
 * are withheld until the form has been submitted once, so an untouched form is
 * never red.
 */
export function useDraft(opening: Opening) {
  const [type, setType] = useState<TransactionType>(opening.type ?? 'out');
  const [amount, setAmount] = useState(opening.amount ?? '');
  const [date, setDate] = useState(opening.date ?? TODAY);
  const [description, setDescription] = useState(opening.description ?? '');
  const draft: TransactionDraft = {
    type,
    accountId: opening.accountId,
    toAccountId: opening.toAccountId,
    amount,
    date,
    description,
  };
  const currency = (byId(draft.accountId) ?? byId(draft.toAccountId))?.currency ?? 'AUD';
  const minorUnits = toMinorUnits(amount, currency);
  return {
    draft,
    setType,
    setAmount,
    setDate,
    setDescription,
    currency,
    minorUnits,
    errors: opening.submitted ? validate(draft, minorUnits) : {},
  };
}

const NOTES: Record<TransactionType, string> = {
  out: 'Written as a negative entry, and counted as spending.',
  in: 'Written as a positive entry, and not counted as income until it is tagged as such.',
  transfer:
    'One movement, two entries that sum to zero. Nothing is spent and net worth does not change.',
};

/** The rows the effect panel shows — the transfer's second side included before it is chosen. */
function effectRows(draft: TransactionDraft, minorUnits: number): EffectRow[] {
  const magnitude = Number.isNaN(minorUnits) ? 0 : Math.abs(minorUnits);
  const from = {
    role: draft.type === 'transfer' ? 'From' : undefined,
    account: byId(draft.accountId),
    delta: deltaFor(draft.type, 'from', magnitude),
  };
  if (draft.type !== 'transfer') return [from];
  return [
    from,
    { role: 'To', account: byId(draft.toAccountId), delta: deltaFor(draft.type, 'to', magnitude) },
  ];
}

function AccountsSection({
  opening,
  type,
  errors,
}: {
  opening: Opening;
  type: TransactionType;
  errors: TransactionErrors;
}) {
  const field = (side: EntrySide, label: string, id?: string, error?: string) => {
    const account = byId(id);
    if (opening.fixed === side && account) {
      return (
        <FixedAccountField
          label={label}
          account={account}
          accounts={allAccounts}
          reason={opening.fixedReason ?? ''}
        />
      );
    }
    return <AccountField label={label} accounts={allAccounts} initialId={id} error={error} />;
  };
  if (type !== 'transfer') return field('from', 'Account', opening.accountId, errors.account);
  return (
    <div className="space-y-2">
      {field('from', 'From', opening.accountId, errors.account)}
      <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
      {field('to', 'To', opening.toAccountId, errors.toAccount)}
    </div>
  );
}

/** Every field of the modal, in the order the direction rule makes them matter. */
export function FormBody({ opening, f }: { opening: Opening; f: ReturnType<typeof useDraft> }) {
  const { draft, errors } = f;
  return (
    <div className="space-y-4">
      <DirectionField value={draft.type} onChange={f.setType} />
      <AccountsSection opening={opening} type={draft.type} errors={errors} />
      <AmountField
        value={draft.amount}
        onChange={f.setAmount}
        symbol={currenciesByCode.get(f.currency)?.symbol ?? ''}
        error={errors.amount}
      />
      <LedgerEffect rows={effectRows(draft, f.minorUnits)} note={NOTES[draft.type]} />
      <DateField value={draft.date} onChange={f.setDate} error={errors.date} />
      <DescriptionField value={draft.description} onChange={f.setDescription} />
      {draft.type !== 'transfer' && <EntityField initialName={opening.entity} />}
      <TagsField initial={opening.tags} />
    </div>
  );
}
