import { TagIcon } from 'lucide-react';

import { Button, Progress, cn } from '@pops/ui';

import { packedPercent, type MovingSummary } from './moving-day-model.js';

import type { ReactNode } from 'react';

/** Renders the four moving-day counts and the missing-label action. */
export function MovingDaySummary({
  summary,
  onPrintLabels,
}: {
  readonly summary: MovingSummary;
  readonly onPrintLabels?: () => void;
}) {
  const percent = packedPercent(summary);
  const total = summary.packed + summary.looseCount + summary.inHand.length;
  const roomCount = summary.loose.length;
  const count = (value: number, singular: string, plural: string): string =>
    `${value} ${value === 1 ? singular : plural}`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryTile
        label="Packed"
        value={`${percent}%`}
        detail={`${summary.packed} of ${count(total, 'thing', 'things')} are in a box`}
      >
        <Progress value={percent} aria-label={`${percent}% packed`} className="mt-1.5" />
      </SummaryTile>
      <SummaryTile
        label="Boxes"
        value={summary.boxes.length}
        detail={`${summary.stages.packing} packing, ${summary.stages.full} full, ${summary.stages.closed} closed`}
      />
      <SummaryTile
        label="Not packed"
        value={summary.looseCount + summary.inHand.length}
        detail={
          summary.looseCount === 0
            ? `Nothing loose in the house${summary.inHand.length > 0 ? `, ${summary.inHand.length} in hand` : ''}`
            : `In ${count(roomCount, 'room', 'rooms')}${summary.inHand.length > 0 ? `, plus ${summary.inHand.length} in hand` : ''}`
        }
      />
      <SummaryTile
        label="Labels"
        value={summary.unlabelledClosed}
        detail={
          summary.unlabelledClosed === 0
            ? 'Every closed box has a label'
            : `${count(summary.unlabelledClosed, 'closed box has', 'closed boxes have')} no label`
        }
        tone={summary.unlabelledClosed === 0 ? 'plain' : 'warning'}
      >
        {summary.unlabelledClosed > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 bg-background"
            onClick={onPrintLabels}
            prefix={<TagIcon className="size-3.5" aria-hidden />}
          >
            Print
          </Button>
        ) : null}
      </SummaryTile>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  tone = 'plain',
  children,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
  readonly tone?: 'plain' | 'warning';
  readonly children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-xl border bg-card px-4 py-3',
        tone === 'warning' && 'border-warning/50 bg-warning/10'
      )}
    >
      <p className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="min-w-0 text-xs text-muted-foreground">{detail}</p>
      {children}
    </div>
  );
}
