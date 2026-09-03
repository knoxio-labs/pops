import {
  type AccountKind,
  ACCOUNT_KINDS,
  DAY_ONE_KINDS,
  sideBlurb,
} from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { type ReactNode, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Switch,
  TextInput,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account form', order: 3, frame: 'web' };

/**
 * Reserved kinds are offered but disabled: hiding them makes the vocabulary
 * look shorter than it is, and someone would ask for a kind that is coming.
 */
const KIND_OPTIONS = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((kind) => ({
  value: kind,
  label: DAY_ONE_KINDS.includes(kind)
    ? ACCOUNT_KINDS[kind].label
    : `${ACCOUNT_KINDS[kind].label} (not yet)`,
  disabled: !DAY_ONE_KINDS.includes(kind),
}));

const CURRENCY_OPTIONS = ['AUD', 'EUR', 'USD', 'GBP', 'BRL'].map((c) => ({ value: c, label: c }));

function Hint({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-xs text-muted-foreground">{children}</p>;
}

/** Gift cards carry an expiry, an issuer, and credentials that are never read back. */
function GiftCardSection({ account }: { account?: Account }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Gift card</legend>
      <TextInput label="Expires" type="date" defaultValue={account?.expires ?? ''} />
      <TextInput label="Issuer" defaultValue={account?.contact ?? ''} placeholder="PayLab" />
      <TextInput label="Card number" type="password" placeholder={account ? '•••• stored' : ''} />
      <Hint>Write-only. Stored encrypted and never shown again.</Hint>
      <TextInput label="PIN" type="password" placeholder={account ? '•••• stored' : ''} />
    </fieldset>
  );
}

/** A person ledger is keyed to a contacts entity; the sign says who owes whom. */
function PersonSection({ account }: { account?: Account }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border p-4">
      <legend className="px-1 text-xs font-medium text-muted-foreground">Person</legend>
      <TextInput
        label="Contact"
        defaultValue={account?.contact ?? ''}
        placeholder="Search contacts…"
      />
      <Hint>A positive balance means they owe you.</Hint>
    </fieldset>
  );
}

function ArchivedRow({
  account,
  archived,
  onChange,
}: {
  account?: Account;
  archived: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <div>
        <Label htmlFor="archived">Archived</Label>
        <p className="text-xs text-muted-foreground">
          Hidden from pickers. Its {account?.transactionCount ?? 0} transactions stay.
        </p>
      </div>
      <Switch id="archived" checked={archived} onCheckedChange={onChange} />
    </div>
  );
}

function AccountFields({
  account,
  kind,
  onKindChange,
  cashClash,
}: {
  account?: Account;
  kind: AccountKind;
  onKindChange: (next: AccountKind) => void;
  cashClash: boolean;
}) {
  return (
    <>
      <TextInput label="Name" defaultValue={account?.name ?? ''} placeholder="Everyday" />
      <TextInput label="Institution" defaultValue={account?.institution ?? ''} placeholder="ANZ" />
      <Select
        label="Kind"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(e) => onKindChange(e.target.value as AccountKind)}
      />
      <Select
        label="Currency"
        options={CURRENCY_OPTIONS}
        defaultValue={account?.currency ?? 'AUD'}
        error={cashClash ? 'A cash account in AUD already exists.' : undefined}
      />
      <TextInput
        label="History complete from"
        type="date"
        defaultValue={account?.historyCompleteFrom ?? ''}
      />
      <Hint>Before this date the history is known to be incomplete.</Hint>
    </>
  );
}

export function AccountForm({
  account,
  initialKind,
  cashCurrencyTaken = false,
}: {
  account?: Account;
  initialKind?: AccountKind;
  /** Cash is one account per currency; the clash is shown inline, not on save. */
  cashCurrencyTaken?: boolean;
}) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? initialKind ?? 'checking');
  const [archived, setArchived] = useState(account?.archived ?? false);
  const cashClash = kind === 'cash' && cashCurrencyTaken;
  return (
    <Dialog open>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : 'Add account'}</DialogTitle>
          <DialogDescription>{sideBlurb(ACCOUNT_KINDS[kind].side)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <AccountFields
            account={account}
            kind={kind}
            onKindChange={setKind}
            cashClash={cashClash}
          />
          {kind === 'gift-card' && <GiftCardSection account={account} />}
          {kind === 'person' && <PersonSection account={account} />}
          <ArchivedRow account={account} archived={archived} onChange={setArchived} />
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button disabled={cashClash}>{account ? 'Save' : 'Create account'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const byId = (id: string) => allAccounts.find((a) => a.id === id);

export const states: ScreenStates = {
  'edit-credit-card': () => <AccountForm account={byId('a2')} />,
  'gift-card': () => <AccountForm account={byId('a6')} />,
  person: () => <AccountForm account={byId('a7')} />,
  'cash-currency-taken': () => <AccountForm initialKind="cash" cashCurrencyTaken />,
  archived: () => <AccountForm account={byId('a9')} />,
};

export default function AccountFormScreen() {
  return <AccountForm />;
}
