import { TriangleAlert } from 'lucide-react';

import { AccountChip, balanceTone, Card, cn } from '@pops/ui';

import { toAccountOptions } from '../../components/accounts/toAccountOptions.js';
import { currencyFormat, formatBalanceCents } from './balance-display';

import type { Currency } from './account-subtotals';
import type { Account, Institution } from './types';

/**
 * The note under a person ledger's balance: the one kind whose sign does not
 * say enough on its own (a minus sign cannot say who is owed), so it keeps a
 * direction word. Every other kind reads off the number and its colour alone.
 */
function ledgerNote(account: Account): string {
  if (account.kind !== 'person') return '';
  const cents = account.balance.balanceCents;
  if (cents === 0) return 'settled up';
  return cents < 0 ? 'you owe' : 'owed to you';
}

/** `as of 1 Sept`, only when the balance is anchored on a real checkpoint — a transactions-basis figure has no such date. */
function asOfLabel(account: Account): string {
  if (account.balance.basis !== 'checkpoint') return '';
  const date = new Date(`${account.balance.asOf}T00:00:00`);
  return `as of ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
}

function subline(account: Account): string {
  return [ledgerNote(account), asOfLabel(account)].filter(Boolean).join(' · ');
}

function Balance({ account, currencies }: { account: Account; currencies: Currency[] }) {
  const format = currencyFormat(currencies, account.currency);
  const note = subline(account);
  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'block text-2xl font-semibold tabular-nums',
            balanceTone(account.balance.balanceCents, format.kind)
          )}
        >
          {formatBalanceCents(account.balance.balanceCents, format)}
        </span>
        {account.balance.inconsistent && (
          <TriangleAlert
            role="img"
            aria-label="Balance doesn't match the latest checkpoint"
            className="h-4 w-4 shrink-0 text-destructive"
          />
        )}
      </span>
      {note !== '' && <span className="block text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

/**
 * One tile in the accounts grid: `AccountChip`'s `full` variant for identity,
 * the balance headline in ledger tone (POPS-2886), and the kind and
 * person-ledger context `AccountChip` does not carry. Reusing
 * `toAccountOptions` (built for the account picker, POPS-2774) rather than
 * duplicating the institution join.
 */
export function AccountCard({
  account,
  institutions,
  currencies,
  onSelect,
}: {
  account: Account;
  institutions: Institution[];
  currencies: Currency[];
  onSelect: () => void;
}) {
  const [option] = toAccountOptions([account], institutions);
  if (!option) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block h-full min-h-11 w-full min-w-11 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card
        className={cn(
          'h-full gap-3 px-4 py-4 transition-colors hover:border-primary hover:bg-muted/50',
          account.archivedAt !== null && 'border-dashed opacity-60'
        )}
      >
        <AccountChip account={option} size="full" />
        <Balance account={account} currencies={currencies} />
        {account.kind === 'person' && account.entityId === null && (
          <p className="text-xs text-muted-foreground">Pending contact match</p>
        )}
      </Card>
    </button>
  );
}
