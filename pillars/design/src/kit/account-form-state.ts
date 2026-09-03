import { type AccountKind, ACCOUNT_KINDS, DAY_ONE_KINDS } from '@/fixtures/account-kinds';
import { type Account } from '@/fixtures/accounts';
import { type Currency, currencies } from '@/fixtures/currencies';
import { institutions } from '@/fixtures/institutions';
import {
  contacts,
  type Counterparty,
  type CounterpartyMode,
  merchants,
} from '@/kit/account-fields';
import { useState } from 'react';

export const KIND_OPTIONS = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((kind) => ({
  value: kind,
  label: DAY_ONE_KINDS.includes(kind)
    ? ACCOUNT_KINDS[kind].label
    : `${ACCOUNT_KINDS[kind].label} (not yet)`,
  disabled: !DAY_ONE_KINDS.includes(kind),
}));

/** Which counterparty a kind keeps, and where its options come from. */
function counterpartyFor(kind: AccountKind): { mode: CounterpartyMode; source: Counterparty[] } {
  if (kind === 'person') return { mode: 'person', source: contacts };
  if (kind === 'gift-card') return { mode: 'entity', source: merchants };
  return { mode: 'institution', source: institutions };
}

/**
 * An existing account's counterparty id: `institutionId` when it has one, or —
 * for a person or gift-card account, which only ever stored a free-text
 * `contact` name — whichever fixture counterparty has that exact name. A
 * contact typed by hand before this picker existed has nothing to resolve to
 * and the field opens unset, same as a brand new account.
 */
function initialCounterpartyId(account: Account | undefined): string | undefined {
  if (!account) return undefined;
  if (account.institutionId) return account.institutionId;
  if (!account.contact) return undefined;
  const pool = account.kind === 'person' ? contacts : merchants;
  return pool.find((c) => c.name === account.contact)?.id;
}

/** Fixture options plus whatever the picker on this form has minted locally. */
function useLocal<T>(fixture: T[]) {
  const [added, setAdded] = useState<T[]>([]);
  return { options: [...fixture, ...added], add: (item: T) => setAdded((prev) => [...prev, item]) };
}

/**
 * The account's whole editable state, including the one counterparty field
 * that stands in for "Institution", "Contact" or "Issuer" depending on kind —
 * one field, one picker, relabelled and resourced by `counterpartyFor` rather
 * than three separate fields for what is the same relationship. Selecting or
 * minting a person contact also fills the account's name, since a person
 * ledger's name and its counterparty are the same thing.
 */
export function useAccountFormState(
  account: Account | undefined,
  initialKind?: AccountKind,
  initialCurrency?: string
) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? initialKind ?? 'checking');
  const [name, setName] = useState(account?.name ?? '');
  const [counterpartyId, setCounterpartyId] = useState(() => initialCounterpartyId(account));
  const [currencyCode, setCurrencyCode] = useState(account?.currency ?? initialCurrency ?? 'AUD');
  const institutionPool = useLocal<Counterparty>(institutions);
  const contactPool = useLocal<Counterparty>(contacts);
  const merchantPool = useLocal<Counterparty>(merchants);
  const currencyPool = useLocal(currencies);
  const { mode, source } = counterpartyFor(kind);
  const pools: Record<CounterpartyMode, ReturnType<typeof useLocal<Counterparty>>> = {
    institution: institutionPool,
    person: contactPool,
    entity: merchantPool,
  };
  const pool = pools[mode];
  return {
    kind,
    setKind,
    name,
    setName,
    counterpartyMode: mode,
    counterpartyOptions: pool.options,
    counterpartySource: source,
    counterpartyId,
    selectCounterparty: (item: Counterparty) => {
      setCounterpartyId(item.id);
      if (mode === 'person') setName(item.name);
    },
    createCounterparty: (label: string) => {
      const item: Counterparty = {
        id: `pending-${label}`,
        name: label,
        colour: 'var(--muted-foreground)',
      };
      pool.add(item);
      setCounterpartyId(item.id);
      if (mode === 'person') setName(label);
    },
    currencyCode,
    setCurrencyCode,
    currencyPool,
    createCurrency: (c: Currency) => {
      currencyPool.add(c);
      setCurrencyCode(c.code);
    },
  };
}
