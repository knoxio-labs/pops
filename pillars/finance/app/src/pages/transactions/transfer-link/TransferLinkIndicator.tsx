import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDate, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@pops/ui';

import { AccountLabel } from '../../../components/accounts/AccountLabel';
import { SignedAmount } from '../../../components/SignedAmount';
import { useTransactionCounterpart } from './useTransactionCounterpart';

import type { AccountOption } from '@pops/ui';

/**
 * The `Link2` badge beside a transfer's type, made to answer "linked to
 * what": opening it fetches and shows the other leg's account, date, amount
 * and description, with the account name itself a link to that account's
 * page (POPS-3941). The icon alone only told a reader a pair exists, never
 * which one.
 *
 * Fetched on open rather than for every linked row on the page — the same
 * one-request-per-opened-row tradeoff `PurchaseDetailDialog` makes for its
 * own cross-pillar lookup, here staying same-pillar but still a request this
 * page would otherwise pay per row rendered.
 */
export function TransferLinkIndicator({
  relatedTransactionId,
  accounts,
}: {
  relatedTransactionId: string;
  accounts: AccountOption[];
}) {
  const { t } = useTranslation('finance');
  const [open, setOpen] = useState(false);
  const query = useTransactionCounterpart(open ? relatedTransactionId : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('transactions.transferLink.open')}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Link2 className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2" align="start">
        <p className="text-xs font-medium text-muted-foreground">
          {t('transactions.transferLink.title')}
        </p>
        <TransferLinkBody query={query} accounts={accounts} />
      </PopoverContent>
    </Popover>
  );
}

function TransferLinkBody({
  query,
  accounts,
}: {
  query: ReturnType<typeof useTransactionCounterpart>;
  accounts: AccountOption[];
}) {
  const { t } = useTranslation('finance');

  if (query.isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{t('transactions.transferLink.failed')}</p>;
  }
  if (!query.data) return null;

  const counterpart = query.data;
  return (
    <div className="space-y-1 text-sm">
      <AccountLabel accounts={accounts} account={counterpart.accountId} size="compact" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{formatDate(counterpart.date)}</span>
        <SignedAmount amount={counterpart.amount} />
      </div>
      <p className="truncate text-muted-foreground" title={counterpart.description}>
        {counterpart.description}
      </p>
    </div>
  );
}
