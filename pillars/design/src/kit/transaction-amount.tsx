import { type Account } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { balanceTone } from '@/kit/ledger-tone';
import { type TransactionType } from '@/kit/transaction-model';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';

import { cn, Label, TextInput } from '@pops/ui';

import type { LucideIcon } from 'lucide-react';

interface DirectionOption {
  value: TransactionType;
  label: string;
  icon: LucideIcon;
  tone: string;
}

/**
 * Money out first because it is the overwhelming majority of what anyone
 * enters, and its tone is the red the resulting negative delta will be shown
 * in — the control and the consequence agree on colour before anything is
 * saved.
 */
const DIRECTIONS: DirectionOption[] = [
  { value: 'out', label: 'Money out', icon: ArrowUpRight, tone: 'text-destructive' },
  { value: 'in', label: 'Money in', icon: ArrowDownLeft, tone: 'text-primary' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, tone: 'text-foreground' },
];

/**
 * The direction of the movement, and the transfer switch, as one segmented
 * control. It is the first field because it decides the sign of the amount and
 * the shape of the fields under it; a person who realises halfway through that
 * they are paying a card off changes this rather than starting again.
 */
export function DirectionField({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (next: TransactionType) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label id="direction-label">Direction</Label>
      <div
        role="radiogroup"
        aria-labelledby="direction-label"
        className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1"
      >
        {DIRECTIONS.map(({ value: option, label, icon: Icon, tone }) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            onClick={() => onChange(option)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm',
              option === value
                ? cn('bg-background font-medium shadow-sm', tone)
                : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The magnitude, never a sign: an amount typed with a minus is an error. */
export function AmountField({
  value,
  onChange,
  symbol,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  symbol: string;
  error?: string;
}) {
  return (
    <TextInput
      label="Amount"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
      prefix={symbol || undefined}
      error={error}
    />
  );
}

export interface EffectRow {
  /** `From` / `To` on a transfer; absent on a one-sided entry. */
  role?: string;
  account?: Account;
  delta: number;
}

function signed(delta: number, currency: string): string {
  return `${delta > 0 ? '+' : ''}${formatBalance(delta, currency)}`;
}

function EffectLine({ row }: { row: EffectRow }) {
  const { account, delta, role } = row;
  if (!account) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {role && <span className="w-10 shrink-0 text-xs uppercase">{role}</span>}
        <span>Not chosen yet</span>
      </div>
    );
  }
  const after = account.balance + delta;
  return (
    <div className="flex items-center gap-2 text-sm">
      {role && (
        <span className="w-10 shrink-0 text-xs text-muted-foreground uppercase">{role}</span>
      )}
      <AccountAvatar account={account} />
      <span className="min-w-0 flex-1 truncate">{account.name}</span>
      <span className={cn('shrink-0 tabular-nums', balanceTone({ ...account, balance: delta }))}>
        {signed(delta, account.currency)}
      </span>
      <span
        className={cn(
          'w-24 shrink-0 text-right text-xs tabular-nums',
          balanceTone({ ...account, balance: after })
        )}
      >
        {formatBalance(after, account.currency)}
      </span>
    </div>
  );
}

/**
 * What saving would write, in ledger signs and ledger colours, before it is
 * written. This is the check that catches a debit entered as a credit: the
 * number the person is about to commit is shown red or green beside the
 * balance it leaves behind, and no amount of mislabelling upstream survives it.
 */
export function LedgerEffect({ rows, note }: { rows: EffectRow[]; note: string }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase">Effect on balances</p>
      {rows.map((row, index) => (
        <EffectLine key={row.account?.id ?? `pending-${index}`} row={row} />
      ))}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
