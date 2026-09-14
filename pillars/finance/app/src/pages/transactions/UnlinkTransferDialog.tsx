import { useTranslation } from 'react-i18next';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  formatDate,
  Skeleton,
} from '@pops/ui';

import { AccountLabel } from '../../components/accounts/AccountLabel';
import { SignedAmount } from '../../components/SignedAmount';
import { useTransactionCounterpart } from './transfer-link/useTransactionCounterpart';

import type { AccountOption } from '@pops/ui';

import type { Transaction } from './types';

interface Props {
  unlinkingTx: Transaction | null;
  setUnlinkingTx: (t: Transaction | null) => void;
  isUnlinking: boolean;
  accounts: AccountOption[];
  onConfirm: (tx: Transaction) => void;
}

/**
 * Confirms breaking a transfer pair by naming the counterpart being unlinked
 * from, not just the row the menu was opened on — an "are you sure" with
 * nothing to compare against cannot tell a correct link from a wrong one
 * (POPS-3941).
 */
export function UnlinkTransferDialog({
  unlinkingTx,
  setUnlinkingTx,
  isUnlinking,
  accounts,
  onConfirm,
}: Props) {
  const { t } = useTranslation('finance');
  const counterpartId = unlinkingTx?.relatedTransactionId ?? null;
  const query = useTransactionCounterpart(counterpartId);

  return (
    <AlertDialog open={!!unlinkingTx} onOpenChange={() => setUnlinkingTx(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('transactions.unlinkTransfer.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('transactions.unlinkTransfer.body')}</AlertDialogDescription>
        </AlertDialogHeader>
        <CounterpartSummary query={query} accounts={accounts} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUnlinking}>
            {t('transactions.unlinkTransfer.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => unlinkingTx && onConfirm(unlinkingTx)}
            disabled={isUnlinking}
          >
            {isUnlinking
              ? t('transactions.unlinkTransfer.unlinking')
              : t('transactions.unlinkTransfer.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CounterpartSummary({
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
    return (
      <p className="text-sm text-destructive">{t('transactions.unlinkTransfer.loadFailed')}</p>
    );
  }
  if (!query.data) return null;

  const counterpart = query.data;
  return (
    <div className="rounded-md border p-3 space-y-1 text-sm" data-testid="unlink-counterpart">
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
