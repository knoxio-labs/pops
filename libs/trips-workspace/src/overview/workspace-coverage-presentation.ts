import { dateRange } from './model';

import type { AccommodationCoverage } from '../visit/coverage';
import type { OverviewLabels } from './types';

/** Format the recorded interval and the explicit coverage classification together. */
export function coverageIntervalLabel(
  interval: { arrival: string; departure: string; state: AccommodationCoverage['state'] },
  labels: OverviewLabels,
  locale: string
): string {
  return `${dateRange(interval.arrival, interval.departure, locale)} · ${coverageLabel(interval.state, labels)}`;
}

/** Convert a coverage classification to the host's localized label. */
export function coverageLabel(
  state: AccommodationCoverage['state'],
  labels: OverviewLabels
): string {
  if (state === 'covered') return labels.sleepPlan.covered;
  if (state === 'missing') return labels.sleepPlan.open;
  return labels.sleepPlan.unknown;
}

/** Use semantic trip colors for visible interval labels. */
export function coverageLabelTone(state: AccommodationCoverage['state']): string {
  if (state === 'covered') return 'bg-trip-stay-soft text-trip-stay';
  if (state === 'missing') return 'bg-trip-attention-soft text-trip-attention';
  return 'bg-trip-sunken text-trip-muted';
}

/** Use semantic trip colors for each dated coverage segment. */
export function coverageTrackTone(state: AccommodationCoverage['state']): string {
  if (state === 'covered') return 'bg-trip-stay';
  if (state === 'missing') return 'bg-trip-attention';
  return 'border-y border-dashed border-trip-line bg-trip-sunken';
}
