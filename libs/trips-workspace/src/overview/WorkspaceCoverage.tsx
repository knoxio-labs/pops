import { BedDouble } from 'lucide-react';

import { Badge } from '@pops/ui';

import { coverageRecords, coverageScale, coverageTotals } from './workspace-coverage-model';
import { WorkspaceCoverageTimeline } from './WorkspaceCoverageTimeline';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Render the selected Trip's overnight coverage and retain uncertainty for undated Visits. */
export function WorkspaceCoverage(props: OverviewViewProps): JSX.Element | null {
  const visits = props.sources.visits?.filter((visit) => visit.tripId === props.tripId);
  if (!visits?.length) return null;
  const records = coverageRecords(visits, props);
  const totals = coverageTotals(records);
  const scale = coverageScale(records, props.locale);
  return (
    <section
      aria-label={props.labels.sleepPlan.title}
      className="space-y-3 rounded-2xl border border-trip-line bg-trip-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BedDouble className="size-4 text-trip-stay" aria-hidden />
          {props.labels.sleepPlan.title}
        </h2>
        <div
          role="group"
          className="flex flex-wrap gap-2"
          aria-label={props.labels.status('workspace.summary')}
        >
          {totals.covered > 0 && (
            <Badge className="border-trip-stay/30 bg-trip-stay-soft text-trip-stay">
              {totals.covered} · {props.labels.sleepPlan.covered}
            </Badge>
          )}
          {totals.open > 0 && (
            <Badge className="border-trip-attention/30 bg-trip-attention-soft text-trip-attention">
              {props.labels.sleepPlan.openNights(totals.open)}
            </Badge>
          )}
          {totals.unknownVisits > 0 && (
            <Badge variant="outline" className="border-dashed text-trip-muted">
              {totals.unknownVisits} · {props.labels.sleepPlan.unknown}
            </Badge>
          )}
        </div>
      </div>
      <WorkspaceCoverageTimeline {...props} records={records} scale={scale} />
    </section>
  );
}
