import { useTranslation } from 'react-i18next';

import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  formatCents,
  formatDate,
  Skeleton,
} from '@pops/ui';

import { LinkedPurchaseCard } from './LinkedPurchaseCard';
import { summariseSettlement, type SettlementSummary } from './settlement';
import { usePurchasesForTransaction } from './usePurchasesForTransaction';

import type { TFunction } from 'i18next';

import type { Transaction } from '../types';
import type { LinkedPurchase } from './types';

/**
 * What one finance transaction bought, read from the purchases pillar.
 *
 * The panel is opened per transaction rather than shown as a column on the
 * table because the reverse lookup takes one transaction URI: indicating
 * purchase-backed rows across a 50-row page would mean 50 cross-pillar
 * requests to draw one column. See this directory's README.
 */
export function PurchaseDetailDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('finance');
  const state = usePurchasesForTransaction(transaction?.id ?? null);
  const summary =
    transaction === null ? null : summariseSettlement(state.entries, transaction.amount);

  return (
    <Dialog open={transaction !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('transactions.purchaseDetail.title')}</DialogTitle>
          <DialogDescription>
            {transaction === null
              ? null
              : `${transaction.description} · ${formatDate(transaction.date)}`}
          </DialogDescription>
        </DialogHeader>
        <Body state={state} summary={summary} />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  state,
  summary,
}: {
  state: ReturnType<typeof usePurchasesForTransaction>;
  summary: SettlementSummary | null;
}) {
  const { t } = useTranslation('finance');

  if (state.isLoading) {
    return (
      <div className="space-y-3" aria-label={t('transactions.purchaseDetail.loadingLabel')}>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state.error !== null) {
    return <FailureNotice state={state} />;
  }

  if (state.entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t('transactions.purchaseDetail.empty')}</p>
    );
  }

  return (
    <div className="space-y-4">
      {summary !== null && <SettlementLine summary={summary} />}
      <ul aria-label={t('transactions.purchaseDetail.ordersLabel')} className="space-y-3">
        {state.entries.map((entry: LinkedPurchase) => (
          <LinkedPurchaseCard key={entry.purchase.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

/**
 * A pillar that is down and a request that was refused are different answers,
 * and only one of them says anything about this transaction. Reporting an
 * unreachable purchases as a failure of the transaction on screen would send
 * a reader looking for a problem in their own data.
 *
 * The upstream detail line is shown only for a refusal, where it is the
 * pillar's own sentence about what it would not do. An outage has no such
 * sentence — only a transport message no reader can act on, in whatever
 * language the layer that produced it happened to be written in.
 */
function FailureNotice({ state }: { state: ReturnType<typeof usePurchasesForTransaction> }) {
  const { t } = useTranslation('finance');

  return (
    <Alert variant={state.isUnavailable ? 'default' : 'destructive'}>
      <p className="font-semibold">
        {state.isUnavailable
          ? t('transactions.purchaseDetail.unavailable')
          : t('transactions.purchaseDetail.failed')}
      </p>
      {!state.isUnavailable && state.error !== null && (
        <p className="text-sm">{state.error.message}</p>
      )}
      <Button variant="link" size="sm" onClick={state.refetch} className="mt-2 px-0">
        {t('common:tryAgain')}
      </Button>
    </Alert>
  );
}

function residualLine(t: TFunction<'finance'>, unaccountedCents: number, currency: string): string {
  if (unaccountedCents === 0) return t('transactions.purchaseDetail.fullyAccounted');
  const amount = formatCents(Math.abs(unaccountedCents), currency);
  return unaccountedCents > 0
    ? t('transactions.purchaseDetail.unaccounted', { amount })
    : t('transactions.purchaseDetail.overAccounted', { amount });
}

/**
 * How much of the transaction the orders actually explain.
 *
 * Always rendered, including when it balances, for the reason the merchant
 * lens states: a view that shows the residual only when it is inconvenient
 * teaches a reader that its absence means zero, when it can equally mean
 * nobody computed it. Where the charges settled in more than one currency
 * there is no residual to render — saying so is the same commitment, since
 * the alternative is a total that reads as authoritative and means nothing.
 */
function SettlementLine({ summary }: { summary: SettlementSummary }) {
  const { t } = useTranslation('finance');

  return (
    <div className="rounded-md border p-3 space-y-1" data-testid="settlement-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {summary.kind === 'settled'
            ? t('transactions.purchaseDetail.accountedFor', {
                linked: formatCents(summary.linkedCents, summary.currency),
                total: formatCents(summary.transactionCents, summary.currency),
              })
            : t('transactions.purchaseDetail.mixedCurrency', {
                currencies: summary.currencies.join(', '),
              })}
        </p>
        {summary.orderCount > 1 && (
          <Badge variant="outline">
            {t('transactions.purchaseDetail.combined', { count: summary.orderCount })}
          </Badge>
        )}
      </div>
      {summary.kind === 'settled' ? (
        <p className="text-muted-foreground text-xs" data-unaccounted={summary.unaccountedCents}>
          {residualLine(t, summary.unaccountedCents, summary.currency)}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs" data-unaccounted="mixed-currency">
          {t('transactions.purchaseDetail.mixedCurrencyResidual')}
        </p>
      )}
    </div>
  );
}
