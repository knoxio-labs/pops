import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/**
 * The layers below this one, named as absent.
 *
 * The merchant lens is specified as total → treemap by tag → line items →
 * per-item buy count, last bought, inventory presence. Only the first exists:
 * no route serves the rest. Saying so where the panels would have been is the
 * cheap version of the same discipline the residual gets — an empty treemap
 * or a placeholder chart would read as "nothing to show", which is a claim
 * about the data rather than about the software.
 */
export function AbsentDrillDown(): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <section className="space-y-2 rounded-md border border-dashed p-4">
      <h2 className="text-sm font-semibold">{t('merchants.absent.title')}</h2>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
        <li>{t('merchants.absent.tags')}</li>
        <li>{t('merchants.absent.items')}</li>
        <li>{t('merchants.absent.inventory')}</li>
      </ul>
    </section>
  );
}
