import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import type { ReactElement } from 'react';

import type { MerchantResolution } from './types.js';

interface LegendEntry {
  badgeKey: string;
  explainKey: string;
}

/**
 * Keyed on the contract's own discriminator, so a resolution added
 * server-side stops compiling here rather than silently rendering a legend
 * with one fewer entry than the roll-up can produce.
 */
const LEGEND = {
  entity: {
    badgeKey: 'merchants.attribution.entity',
    explainKey: 'merchants.attribution.explain.entity',
  },
  name: {
    badgeKey: 'merchants.attribution.name',
    explainKey: 'merchants.attribution.explain.name',
  },
  unattributed: {
    badgeKey: 'merchants.attribution.unattributed',
    explainKey: 'merchants.attribution.explain.unattributed',
  },
} satisfies Record<MerchantResolution, LegendEntry>;

/**
 * What each grouping badge means, and what it costs.
 *
 * The roll-up reports the confidence its key can support rather than claiming
 * an identity it does not have, which only helps if the reader knows the
 * difference. A label-grouped total presented as an entity total is the same
 * false certainty as a dropped residual, one dimension over.
 */
export function AttributionLegend(): ReactElement {
  const { t } = useTranslation('purchases');

  return (
    <section className="bg-muted/40 space-y-2 rounded-md border p-4">
      <h2 className="text-sm font-semibold">{t('merchants.attribution.title')}</h2>
      <dl className="space-y-2 text-xs">
        {Object.values(LEGEND).map((entry) => (
          <div key={entry.badgeKey} className="flex flex-wrap items-baseline gap-2">
            <dt>
              <Badge variant="outline">{t(entry.badgeKey)}</Badge>
            </dt>
            <dd className="text-muted-foreground flex-1">{t(entry.explainKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
