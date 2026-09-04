import { AccountSelect, Input, Label } from '@pops/ui';

import { useImportStore } from '../../../store/importStore';
import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';

import type { ProcessedTransaction } from '@pops/finance';

interface FieldProps {
  editedFields: Partial<ProcessedTransaction>;
  setEditedFields: React.Dispatch<React.SetStateAction<Partial<ProcessedTransaction>>>;
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  step,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background"
      />
    </div>
  );
}

/**
 * Once the import as a whole has a real account (POPS-2840), the per-row
 * "Account" free-text field becomes a picker over real accounts too — a row
 * can still name a different account than the import's own (a transfer's
 * other leg, say), just not by typing an arbitrary string. Before an account
 * is established for the import, or before the accounts list has loaded,
 * this falls back to the original free-text input rather than blocking edits
 * on a network round-trip.
 *
 * The picker's `onChange` threads BOTH the selected account's name and its id
 * to the caller (POPS-2852) — a row parsed with the import's own `accountId`
 * stamped on it (`column-map/validation.ts`) must have that id overwritten
 * too when the row is repointed at a different real account here, or the
 * commit path resolves the id directly and the edit silently has no effect on
 * which account the row actually lands in, even though its displayed name
 * changed.
 */
function AccountField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string, accountId: string | undefined) => void;
}) {
  const importAccountId = useImportStore((state) => state.accountId);
  const { accounts } = useAllAccounts();

  if (!importAccountId || !accounts) {
    return (
      <TextField
        id="account"
        label="Account"
        value={value}
        onChange={(v) => onChange(v, importAccountId ?? undefined)}
      />
    );
  }

  const selected = accounts.find((account) => account.name === value);
  return (
    <div className="space-y-2">
      <Label htmlFor="account">Account</Label>
      <AccountSelect
        accounts={accounts}
        value={selected?.id}
        onChange={(accountId, account) => onChange(account.name, accountId)}
        aria-label="Account"
      />
    </div>
  );
}

export function EditableFormFields({ editedFields, setEditedFields }: FieldProps) {
  const update = (key: keyof ProcessedTransaction, value: unknown) =>
    setEditedFields({ ...editedFields, [key]: value });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <TextField
        id="description"
        label="Description"
        autoFocus
        value={editedFields.description ?? ''}
        onChange={(v) => update('description', v)}
      />
      <TextField
        id="amount"
        label="Amount"
        type="number"
        step="0.01"
        value={editedFields.amount ?? 0}
        onChange={(v) => update('amount', parseFloat(v))}
      />
      <TextField
        id="date"
        label="Date"
        type="date"
        value={editedFields.date ?? ''}
        onChange={(v) => update('date', v)}
      />
      <AccountField
        value={editedFields.account ?? ''}
        onChange={(v, accountId) => setEditedFields({ ...editedFields, account: v, accountId })}
      />
      <TextField
        id="location"
        label="Location"
        value={editedFields.location ?? ''}
        placeholder="Optional"
        onChange={(v) => update('location', v)}
      />
    </div>
  );
}
