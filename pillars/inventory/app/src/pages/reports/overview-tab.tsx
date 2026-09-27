import { BarChart3 } from 'lucide-react';

import { Button, Card, CardContent, EmptyState, Skeleton } from '@pops/ui';

import { OverviewFigures } from './overview-figures.js';
import { OverviewPanels } from './overview-panels.js';
import { isValueReportEmpty } from './reports-model.js';
import { ReportPanel, ReportSkeletonRows } from './reports-parts.js';

import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';
import type { ReportTab } from './reports-model.js';

/** Props for the server-backed Reports Overview tab. */
export interface OverviewTabProps {
  readonly values: WebReportsValuesResponse | undefined;
  readonly entries: readonly ReportEntry[];
  readonly status: 'ready' | 'loading' | 'error';
  readonly now: Date;
  readonly onOpenTab: (tab: ReportTab) => void;
  readonly onOpenInsuranceGaps: () => void;
  readonly onRetry: () => void;
}

function FigureSkeleton(): ReactElement {
  return (
    <Card className="gap-2 p-4" aria-hidden>
      <CardContent className="space-y-2 p-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton(): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" aria-busy="true">
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <FigureSkeleton key={`report-figure-${String(index)}`} />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportPanel title="Value by room">
          <ReportSkeletonRows />
        </ReportPanel>
        <ReportPanel title="Ending in 90 days">
          <ReportSkeletonRows />
        </ReportPanel>
        <ReportPanel title="What an insurer would ask about">
          <ReportSkeletonRows count={2} />
        </ReportPanel>
      </div>
    </div>
  );
}

function OverviewError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center"
      role="alert"
    >
      <BarChart3 className="size-10 text-muted-foreground/40" aria-hidden />
      <div>
        <h2 className="font-semibold">Reports did not load</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The inventory service did not answer. Nothing was changed.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** Renders the overview figures and the three report panels. */
export function OverviewTab(props: OverviewTabProps): ReactElement {
  if (props.status === 'error') return <OverviewError onRetry={props.onRetry} />;
  if (props.status === 'loading') return <OverviewSkeleton />;
  if (props.values === undefined || isValueReportEmpty(props.values)) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-lg border">
        <EmptyState
          icon={BarChart3}
          title="Nothing to report yet"
          description="Add active items and give them a replacement value to see the inventory report."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <OverviewFigures
        report={props.values}
        entries={props.entries}
        now={props.now}
        onOpenTab={props.onOpenTab}
      />
      <OverviewPanels
        report={props.values}
        entries={props.entries}
        now={props.now}
        onOpenTab={props.onOpenTab}
        onOpenInsuranceGaps={props.onOpenInsuranceGaps}
      />
    </div>
  );
}
