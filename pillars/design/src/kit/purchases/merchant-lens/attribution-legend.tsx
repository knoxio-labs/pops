import { Badge } from '@pops/ui';

import type { MerchantResolution } from '@/fixtures/purchases-merchant-spend';

/** The badge text for a resolution, shared with the merchant row that wears the same badge. */
export const ATTRIBUTION_BADGE_LABEL: Record<MerchantResolution, string> = {
  entity: 'Resolved entity',
  name: 'Grouped by name',
  unattributed: 'Unattributed',
};

const EXPLAIN: Record<MerchantResolution, string> = {
  entity:
    "Grouped on a contacts entity id, the operative identity. The label shown is the one from the group's newest order, ranked as text: a merchant renamed since then can still be wearing its older name (POPS-1854).",
  name: "Grouped on the merchant's label because no entity is attached, so this is a label total, not an entity total. Two merchants sharing a label share this row, and renaming one splits its history. No export adapter resolves a merchant entity today, so every exported order lands here (POPS-1852).",
  unattributed:
    'The order names no merchant. Kept as its own group rather than dropped, so the groups still add up to the spend.',
};

const RESOLUTIONS = Object.keys(ATTRIBUTION_BADGE_LABEL) as MerchantResolution[];

/**
 * What each grouping badge means, and what it costs.
 *
 * The roll-up reports the confidence its key can support rather than
 * claiming an identity it does not have, which only helps if the reader
 * knows the difference. A label-grouped total presented as an entity total
 * is the same false certainty as a dropped residual, one dimension over.
 */
export function AttributionLegend() {
  return (
    <section className="bg-muted/40 space-y-2 rounded-md border p-4">
      <h2 className="text-sm font-semibold">How these merchants are grouped</h2>
      <dl className="space-y-2 text-xs">
        {RESOLUTIONS.map((resolution) => (
          <div key={resolution} className="flex flex-wrap items-baseline gap-2">
            <dt>
              <Badge variant="outline">{ATTRIBUTION_BADGE_LABEL[resolution]}</Badge>
            </dt>
            <dd className="text-muted-foreground flex-1">{EXPLAIN[resolution]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
