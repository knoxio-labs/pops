import { type AccountKind, ACCOUNT_KINDS, DAY_ONE_KINDS } from '@/fixtures/account-kinds';
import { type Account, accounts as allAccounts } from '@/fixtures/accounts';
import { type Currency, currencies } from '@/fixtures/currencies';
import { type Institution, institutions } from '@/fixtures/institutions';
import { CurrencySelect } from '@/kit/currency-select';
import { InstitutionMark, InstitutionSelect } from '@/kit/institution-select';
import { Upload, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Account form', order: 3, frame: 'web' };

const KIND_OPTIONS = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((kind) => ({
  value: kind,
  label: DAY_ONE_KINDS.includes(kind)
    ? ACCOUNT_KINDS[kind].label
    : `${ACCOUNT_KINDS[kind].label} (not yet)`,
  disabled: !DAY_ONE_KINDS.includes(kind),
}));

function Hint({ children }: { children: ReactNode }) {
  return <p className="-mt-2 text-xs text-muted-foreground">{children}</p>;
}

/** The account's mark, large: an upload/replace/remove affordance over the current one. */
function AvatarField({ mark }: { mark: ReactNode }) {
  const [image, setImage] = useState<string>();
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : mark}
      </span>
      <div className="flex flex-col gap-1.5 text-sm">
        <label className="flex w-fit cursor-pointer items-center gap-1.5 text-primary">
          <Upload className="h-3.5 w-3.5" />
          {image ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) =>
              e.target.files?.[0] && setImage(URL.createObjectURL(e.target.files[0]))
            }
          />
        </label>
        {image ? (
          <button
            type="button"
            onClick={() => setImage(undefined)}
            className="flex w-fit items-center gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Optional.</p>
        )}
      </div>
    </div>
  );
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
      <TextInput label="Contact" defaultValue={account?.contact} placeholder="Search contacts…" />
      <Hint>A positive balance means they owe you.</Hint>
    </fieldset>
  );
}

/** Fixture options plus whatever the picker on this form has minted locally. */
function useLocal<T>(fixture: T[]) {
  const [added, setAdded] = useState<T[]>([]);
  return { options: [...fixture, ...added], add: (item: T) => setAdded((prev) => [...prev, item]) };
}

function useAccountFormState(
  account: Account | undefined,
  initialKind?: AccountKind,
  initialCurrency?: string
) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? initialKind ?? 'checking');
  const [institutionId, setInstitutionId] = useState(account?.institutionId);
  const [currencyCode, setCurrencyCode] = useState(account?.currency ?? initialCurrency ?? 'AUD');
  const institutionPool = useLocal(institutions);
  const currencyPool = useLocal(currencies);
  return {
    kind,
    setKind,
    institutionId,
    setInstitutionId,
    currencyCode,
    setCurrencyCode,
    institutionPool,
    createInstitution: (name: string) => {
      const id = `pending-${name}`;
      institutionPool.add({ id, name, colour: 'var(--muted-foreground)' });
      setInstitutionId(id);
    },
    currencyPool,
    createCurrency: (c: Currency) => {
      currencyPool.add(c);
      setCurrencyCode(c.code);
    },
  };
}

function AccountMark({ institution }: { institution?: Institution }) {
  if (institution) return <InstitutionMark institution={institution} />;
  return <ACCOUNT_KINDS.other.icon className="h-6 w-6 text-muted-foreground" />;
}

function AccountForm({
  account,
  initialKind,
  initialCurrency,
  cashCurrencyTaken = false,
  institutionQuery,
  currencyCreateQuery,
}: {
  account?: Account;
  initialKind?: AccountKind;
  initialCurrency?: string;
  /** Cash is one account per currency; the clash is shown inline, not on save. */
  cashCurrencyTaken?: boolean;
  institutionQuery?: string;
  currencyCreateQuery?: string;
}) {
  const f = useAccountFormState(account, initialKind, initialCurrency);
  const cashClash = f.kind === 'cash' && cashCurrencyTaken;
  const selectedInstitution = f.institutionPool.options.find((i) => i.id === f.institutionId);
  return (
    <Dialog open>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : 'Add account'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <AvatarField mark={<AccountMark institution={selectedInstitution} />} />
          <TextInput label="Name" defaultValue={account?.name ?? ''} placeholder="Everyday" />
          <InstitutionSelect
            options={f.institutionPool.options}
            selected={selectedInstitution}
            onChange={f.setInstitutionId}
            onCreate={f.createInstitution}
            initialQuery={institutionQuery}
          />
          <Select
            label="Kind"
            options={KIND_OPTIONS}
            value={f.kind}
            onChange={(e) => f.setKind(e.target.value as AccountKind)}
          />
          <CurrencySelect
            options={f.currencyPool.options}
            code={f.currencyCode}
            onChange={f.setCurrencyCode}
            onCreate={f.createCurrency}
            error={cashClash ? `A cash account in ${f.currencyCode} already exists.` : undefined}
            initialCreateQuery={currencyCreateQuery}
          />
          {f.kind === 'gift-card' && <GiftCardSection account={account} />}
          {f.kind === 'person' && <PersonSection account={account} />}
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
  'points-currency': () => <AccountForm initialKind="other" initialCurrency="MR" />,
  'new-institution': () => <AccountForm institutionQuery="Revolut" />,
  'create-currency': () => <AccountForm currencyCreateQuery="Velocity Points" />,
};

export default function AccountFormScreen() {
  return <AccountForm />;
}
