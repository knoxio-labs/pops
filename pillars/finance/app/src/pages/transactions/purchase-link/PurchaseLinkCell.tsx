import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import type { TransactionLinkSummary } from './types';

/** Which claim the row carries. Both counts non-zero is its own state, not a rounding. */
type LinkState = 'confirmed' | 'partlyConfirmed' | 'autoLinked';

function linkStateOf(summary: TransactionLinkSummary): LinkState {
  if (summary.confirmedChargeCount === 0) return 'autoLinked';
  if (summary.derivedChargeCount === 0) return 'confirmed';
  return 'partlyConfirmed';
}

const HINT_KEY: Record<LinkState, string> = {
  confirmed: 'transactions.purchaseLink.confirmedHint',
  partlyConfirmed: 'transactions.purchaseLink.partlyConfirmedHint',
  // The panel's own wording for the same claim, so a row and the panel it
  // opens do not describe one link two ways.
  autoLinked: 'transactions.purchaseDetail.autoLinkedHint',
};

const LABEL_KEY: Record<LinkState, string> = {
  confirmed: 'transactions.purchaseLink.confirmed',
  partlyConfirmed: 'transactions.purchaseLink.partlyConfirmed',
  autoLinked: 'transactions.purchaseLink.autoLinked',
};

/**
 * The indicator itself: what a transaction bought, on the row rather than
 * behind a menu.
 *
 * A transaction no order explains renders nothing. Most of a statement is
 * that case, and a column of "no" would be a column of noise; the absence is
 * the answer, and it is the same absence the producer expresses by leaving the
 * URI out of its response.
 *
 * A derived link is styled and worded apart from a confirmed one for the
 * reason the panel does it: one is what the matcher currently believes and a
 * later sweep may withdraw it, the other is a decision somebody made. A single
 * "has a purchase" tick would report the first as the second on every row it
 * drew.
 *
 * The badge is a button because the panel it opens is otherwise reachable only
 * from the row's action menu, which is where this feature was going
 * unnoticed — an indicator that says "there is something here" and cannot be
 * followed is half an answer.
 */
export function PurchaseLinkCell({
  summary,
  onOpen,
}: {
  summary: TransactionLinkSummary | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation('finance');
  if (summary === undefined) return null;

  const state = linkStateOf(summary);
  const combined = summary.purchaseCount > 1;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-link-state={state}
      data-purchase-count={summary.purchaseCount}
      title={t(HINT_KEY[state])}
      aria-label={t('transactions.purchaseLink.open')}
      className="flex items-center gap-1 rounded-sm focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2"
    >
      <Badge variant={state === 'autoLinked' ? 'outline' : 'secondary'}>
        {t(LABEL_KEY[state])}
      </Badge>
      {combined && (
        <span className="text-muted-foreground text-xs">
          {t('transactions.purchaseLink.orders', { count: summary.purchaseCount })}
        </span>
      )}
    </button>
  );
}
