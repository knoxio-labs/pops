import { useTranslation } from 'react-i18next';

import { formatDate } from '@pops/ui';

import { Fact } from '../../facts.js';

import type { ReactElement } from 'react';

import type { Purchase } from './types.js';

/**
 * Who the order was with, when, and how it reached the pillar.
 *
 * The merchant entity id is shown beside its label rather than instead of it.
 * Every export-ingested order carries a label and no id, and the two say
 * different things: the label is text the merchant wrote, the id is an
 * identity the fleet can resolve. Collapsing them would let a label be read
 * as an identity, which is the failure the search adapter also guards.
 */
export function OrderIdentity({ purchase }: { purchase: Purchase }): ReactElement {
  const { t } = useTranslation('purchases');
  const notRecorded = t('purchase.notRecorded');

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Fact
        label={t('purchase.field.orderedAt')}
        value={formatDate(purchase.orderedAt)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.field.status')}
        value={t(`purchase.status.${purchase.status}`)}
        missingLabel={notRecorded}
      />
      <Fact label={t('purchase.field.source')} value={purchase.source} missingLabel={notRecorded} />
      <Fact
        label={t('purchase.field.sourceOrderId')}
        value={purchase.sourceOrderId}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.field.merchantEntityId')}
        value={purchase.merchantEntityId}
        missingLabel={t('purchase.field.merchantUnresolved')}
      />
      <Fact
        label={t('purchase.field.ingestMethod')}
        value={t(`purchase.ingest.${purchase.ingestMethod}`)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.field.settlement')}
        value={t(`purchase.settlement.${purchase.settlementMode}`)}
        missingLabel={notRecorded}
      />
      <Fact
        label={t('purchase.field.paymentHint')}
        value={purchase.paymentHint}
        missingLabel={notRecorded}
      />
    </dl>
  );
}
