/**
 * The four numbers packing turns on, in one row: how much is packed, how
 * the boxes stand, what is still loose, and whether every closed box can
 * be found again (has a label).
 */
import { Printer, TagIcon } from 'lucide-react';

import { Button, Progress, cn } from '@pops/ui';

import { packedPercent } from './moving-model';

import type { ReactNode } from 'react';

import type { MovingSummary } from './moving-model';

function Tile({
  label,
  value,
  detail,
  tone = 'plain',
  children,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: 'plain' | 'warning';
  children?: ReactNode;
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
      <div className="min-w-0 text-xs text-muted-foreground">{detail}</div>
      {children}
    </div>
  );
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Props for {@link MoveSummaryStrip}. */
export interface MoveSummaryStripProps {
  summary: MovingSummary;
  onPrintLabels?: () => void;
}

function LabelsTile({ summary, onPrintLabels }: MoveSummaryStripProps) {
  if (summary.unlabelledClosed === 0) {
    return (
      <Tile
        label="Labels"
        value={<TagIcon className="size-6 text-muted-foreground" aria-hidden />}
        detail="Every closed box has a label"
      />
    );
  }
  return (
    <Tile
      label="Labels"
      tone="warning"
      value={
        <span className="inline-flex items-center gap-2">
          <TagIcon className="size-5 text-warning" aria-hidden />
          {summary.unlabelledClosed}
        </span>
      }
      detail={
        <span className="flex items-center justify-between gap-2">
          <span className="text-foreground">
            {count(summary.unlabelledClosed, 'closed box has', 'closed boxes have')} no label
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 bg-background"
            onClick={onPrintLabels}
            prefix={<Printer className="size-3.5" aria-hidden />}
          >
            Print
          </Button>
        </span>
      }
    />
  );
}

/** The strip. */
export function MoveSummaryStrip({ summary, onPrintLabels }: MoveSummaryStripProps) {
  const percent = packedPercent(summary);
  const total = summary.packed + summary.looseCount + summary.inHand.length;
  const rooms = summary.loose.length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Packed"
        value={`${percent}%`}
        detail={`${summary.packed} of ${count(total, 'thing', 'things')} are in a box`}
      >
        <Progress value={percent} aria-label={`${percent}% packed`} className="mt-1 h-1.5" />
      </Tile>
      <Tile
        label="Boxes"
        value={summary.boxes.length}
        detail={`${summary.stages.packing} packing, ${summary.stages.full} full, ${summary.stages.closed} closed`}
      />
      <Tile
        label="Not packed"
        value={summary.looseCount}
        detail={
          summary.looseCount === 0
            ? `Nothing loose in the house${summary.inHand.length > 0 ? `, ${summary.inHand.length} in hand` : ''}`
            : `In ${count(rooms, 'room', 'rooms')}${summary.inHand.length > 0 ? `, plus ${summary.inHand.length} in hand` : ''}`
        }
      />
      <LabelsTile summary={summary} onPrintLabels={onPrintLabels} />
    </div>
  );
}
