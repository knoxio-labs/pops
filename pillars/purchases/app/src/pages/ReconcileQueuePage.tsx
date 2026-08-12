import { useTranslation } from 'react-i18next';

import { PageHeader } from '@pops/ui';

import type { ReactElement } from 'react';

/**
 * `/purchases` — the pillar's landing surface.
 *
 * A placeholder. The reconciliation queue itself is built separately; this
 * renders the slot it lands in and says so, rather than standing in for it
 * with sample rows an operator could mistake for their own data.
 */
export function ReconcileQueuePage(): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('reconcile.title')} description={t('reconcile.intro')} />
      <p className="text-muted-foreground text-sm">{t('reconcile.placeholder')}</p>
    </div>
  );
}
