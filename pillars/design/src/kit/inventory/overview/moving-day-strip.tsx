/**
 * The Overview's moving-day line: shown while a move is under way, one row
 * of progress (boxes closed, what is still open, what is packed) and the
 * way into the moving-day page. It never grows into a second dashboard.
 */
import { ArrowRight } from 'lucide-react';

import { Button, Card, Progress } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';

import type { MovingProgress } from './overview-model';

/** Props for {@link MovingDayStrip}. */
export interface MovingDayStripProps {
  progress: MovingProgress;
  /** The destination the move is headed to, as the moving-day page names it. */
  destination: string;
  onOpen?: () => void;
}

/** The strip. */
export function MovingDayStrip({ progress, destination, onOpen }: MovingDayStripProps) {
  const Icon = INVENTORY_ICONS.container;
  const percent = progress.total === 0 ? 0 : Math.round((progress.closed / progress.total) * 100);
  return (
    <Card className="flex shrink-0 flex-row items-center gap-4 border-app-accent/30 bg-app-accent/5 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
        <Icon className="size-4.5 text-app-accent" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">Moving to {destination}</span>
          <span className="text-muted-foreground">
            {progress.closed} of {progress.total} boxes closed · {progress.open} open ·{' '}
            {progress.full} marked full · {progress.packed} things packed
          </span>
        </p>
        <Progress
          value={percent}
          aria-label={`${progress.closed} of ${progress.total} boxes closed`}
          className="h-1.5 max-w-md"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onOpen}
        suffix={<ArrowRight className="size-3.5" aria-hidden />}
      >
        Moving day
      </Button>
    </Card>
  );
}
