import { balanceTone, cn } from '@pops/ui';

import { currencySubtotals, type Currency } from './account-subtotals';
import { currencyFormat, formatBalanceCents } from './balance-display';

import type { Account } from './types';

/**
 * One figure per currency in play, never blended into a single number
 * (POPS-2813): AUD and EUR cannot be added without an exchange rate, and
 * there is no rate source or staleness story yet. Points never appear here —
 * they are not money. A single currency still gets its label, so the reader
 * never has to infer what unit the number is in from the accounts below it.
 */
export function AccountSubtotals({
  accounts,
  currencies,
}: {
  accounts: Account[];
  currencies: Currency[];
}) {
  const totals = currencySubtotals(accounts, currencies);
  if (totals.length === 0) return null;
  return (
    <div
      data-testid="account-subtotals"
      className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b pb-4"
    >
      {totals.map(({ currency, totalCents }) => {
        const format = currencyFormat(currencies, currency);
        return (
          <span key={currency} className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'text-lg font-semibold tabular-nums',
                balanceTone(totalCents, format.kind)
              )}
            >
              {formatBalanceCents(totalCents, format)}
            </span>
            <span className="text-xs text-muted-foreground">{currency}</span>
          </span>
        );
      })}
      <span className="text-xs text-muted-foreground">
        Held minus owed, per currency — points are not counted, and nothing is converted.
      </span>
    </div>
  );
}
