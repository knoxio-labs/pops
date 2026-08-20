import { useTranslation } from 'react-i18next';

import { formatCents } from '@pops/ui';

import { Fact } from '../../facts.js';

import type { ReactElement } from 'react';

import type { PurchaseAccounting } from './types.js';

interface AccountingSplitProps {
  accounting: PurchaseAccounting;
  currency: string;
}

/**
 * What of this order is accounted for, and what is not.
 *
 * `residualCents` is rendered verbatim from the server and is on screen even
 * when it is zero, the same rule the merchant lens follows one level up: a
 * residual that disappears when it is nil makes its absence mean both "all
 * accounted for" and "this view does not show that", and a reader cannot tell
 * those apart. Nothing here is recomputed from the other figures.
 */
export function AccountingSplit({ accounting, currency }: AccountingSplitProps): ReactElement {
  const { t } = useTranslation('purchases');
  const notRecorded = t('purchase.notRecorded');

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="purchase-accounting">
      <Fact
        label={t('purchase.accounting.total')}
        value={formatCents(accounting.totalCents, currency)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.accounting.matched')}
        value={formatCents(accounting.matchedCents, currency)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.accounting.awaiting')}
        value={formatCents(accounting.awaitingImportCents, currency)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.accounting.residual')}
        value={formatCents(accounting.residualCents, currency)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.accounting.refunded')}
        value={formatCents(accounting.refundedCents, currency)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.accounting.netSpend')}
        value={formatCents(accounting.netSpendCents, currency)}
        missingLabel={notRecorded}
      />
    </dl>
  );
}
