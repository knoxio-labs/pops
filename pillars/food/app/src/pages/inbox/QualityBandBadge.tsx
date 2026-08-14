/**
 * Colour-coded pill showing a draft's quality band. Hover surfaces the top
 * signals from `scoreDraft` so triagers see why a draft landed in a band
 * without opening the inspector. The tooltip is a native `title` attribute,
 * not a Radix Tooltip — a portal is disproportionate to a transient hover hint.
 */
import { type ReactElement } from 'react';

import type { QualityBand } from '../../food-api-shared-types.js';
import type { InboxListResponses } from '../../food-api/types.gen.js';

type QualitySignal = InboxListResponses[200]['items'][number]['topSignals'][number];

interface Props {
  band: QualityBand;
  topSignals: readonly QualitySignal[];
  bandLabel: string;
}

const BAND_CLASS: Record<QualityBand, string> = {
  clean: 'bg-success/15 text-success',
  minor: 'bg-warning/15 text-warning',
  attention: 'bg-stat-orange/15 text-stat-orange',
  blocked: 'bg-destructive/15 text-destructive',
};

export function QualityBandBadge({ band, topSignals, bandLabel }: Props): ReactElement {
  const tooltip = topSignals.length === 0 ? bandLabel : topSignals.map((s) => s.code).join('\n');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${BAND_CLASS[band]}`}
      title={tooltip}
      data-testid="quality-band-badge"
      data-band={band}
    >
      {bandLabel}
    </span>
  );
}
