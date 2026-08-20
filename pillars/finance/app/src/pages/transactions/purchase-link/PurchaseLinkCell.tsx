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
 *
 * Its accessible name is composed from what it renders — the state, the order
 * count where there is one, then what clicking does. An `aria-label` naming
 * only the action would replace the state rather than add to it, and a reader
 * on a screen reader would get a column of identical buttons: the same
 * confirmed-as-derived collapse this component exists to avoid, one output
 * channel over. `confirmed` and `partlyConfirmed` share a badge variant, so
 * that word is the only thing telling them apart anywhere.
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
      title={t(HINT_KEY[state])}
      className="flex min-h-11 min-w-11 items-center gap-1 rounded-sm focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2"
    >
      <Badge variant={state === 'autoLinked' ? 'outline' : 'secondary'}>
        {t(LABEL_KEY[state])}
      </Badge>
      {combined && (
        <span className="text-muted-foreground text-xs">
          {t('transactions.purchaseLink.orders', { count: summary.purchaseCount })}
        </span>
      )}
      <span className="sr-only">{t('transactions.purchaseLink.open')}</span>
    </button>
  );
}
