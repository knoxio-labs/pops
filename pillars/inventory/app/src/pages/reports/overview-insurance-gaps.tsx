import { Camera, CircleDollarSign } from 'lucide-react';

import { Button } from '@pops/ui';

import { ReportPanel } from './reports-parts.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { InsuranceGapReason } from './insurance-model.js';

function GapRow({
  icon: Icon,
  count,
  detail,
  reason,
  onOpen,
}: {
  readonly icon: LucideIcon;
  readonly count: number;
  readonly detail: string;
  readonly reason: InsuranceGapReason;
  readonly onOpen: (reason: InsuranceGapReason) => void;
}): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto min-h-11 w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal"
      onClick={() => onOpen(reason)}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium tabular-nums">{count} items</span>
        <span className="text-xs whitespace-normal text-muted-foreground">{detail}</span>
      </span>
    </Button>
  );
}

/** Renders the insurance-gap panel using the report totals supplied by Inventory. */
export function OverviewInsuranceGaps({
  report,
  onOpen,
}: {
  readonly report: WebReportsValuesResponse;
  readonly onOpen: (reason: InsuranceGapReason) => void;
}): ReactElement {
  return (
    <ReportPanel title="What an insurer would ask about">
      <div className="divide-y divide-border/60">
        <GapRow
          icon={CircleDollarSign}
          count={report.totals.unvalued}
          detail="No replacement value, so they add nothing to the totals."
          reason="unvalued"
          onOpen={onOpen}
        />
        <GapRow
          icon={Camera}
          count={report.totals.withoutPhoto}
          detail="No photo to show they exist or what state they were in."
          reason="without-photo"
          onOpen={onOpen}
        />
      </div>
    </ReportPanel>
  );
}
