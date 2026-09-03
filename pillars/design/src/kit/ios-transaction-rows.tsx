import { accounts as allAccounts } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { importRows } from '@/fixtures/import-review';
import { iosDay } from '@/kit/ios-account-balance';
import { AccountMark } from '@/kit/ios-account-mark';
import { IosHairline } from '@/kit/ios-controls';
import { FactCard } from '@/kit/ios-fact-card';
import { Fragment } from 'react';

import type { Account } from '@/fixtures/accounts';
import type { ImportRow } from '@/fixtures/import-review';

/** Every third row is a transfer, so the chip has somewhere to be seen in situ. */
const COUNTERPARTS: Record<string, string> = { r2: 'a4', r5: 'a7' };

const signed = (row: ImportRow) => (row.type === 'debit' ? -row.amountCents : row.amountCents);

/**
 * The account chip inside a transaction row, at the width it actually gets.
 * A transaction names another account only when it is a transfer, and by then
 * the row has a date, a description and an amount on it already — so the chip
 * is the 24pt mark and whatever of the name survives truncation. The mark is
 * doing the identifying here; the name is the caption.
 */
function TransferChip({ account }: { account: Account }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <AccountMark account={account} size="sm" />
      <span className="ios-subheadline truncate">{account.name}</span>
    </span>
  );
}

function TransactionRow({ row, currency }: { row: ImportRow; currency: string }) {
  const counterpart = allAccounts.find((a) => a.id === COUNTERPARTS[row.id]);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        {counterpart ? (
          <TransferChip account={counterpart} />
        ) : (
          <p className="ios-subheadline truncate">{row.description}</p>
        )}
        <p className="ios-caption" style={{ color: 'var(--ios-muted-foreground)' }}>
          {iosDay(row.date)}
          {row.entity === undefined ? '' : ` · ${row.entity}`}
          {counterpart ? ' · Transfer' : ''}
        </p>
      </div>
      <span className="ios-subheadline shrink-0 tabular-nums">
        {formatBalance(signed(row), currency)}
      </span>
    </div>
  );
}

/**
 * The last few transactions on an account, as the phone shows them.
 * `spendOnly` drops the credits for the kinds that only ever spend down — a
 * salary landing in a gift card is a fixture artefact, not a design.
 */
export function RecentTransactions({
  currency,
  count = 5,
  spendOnly = false,
}: {
  currency: string;
  count?: number;
  spendOnly?: boolean;
}) {
  const rows = importRows.filter((row) => !spendOnly || row.type === 'debit');
  return (
    <FactCard title="Recent">
      <div>
        {rows.slice(0, count).map((row, index) => (
          <Fragment key={row.id}>
            {index > 0 ? <IosHairline /> : null}
            <TransactionRow row={row} currency={currency} />
          </Fragment>
        ))}
      </div>
    </FactCard>
  );
}
