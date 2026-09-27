import { ArrowRight } from 'lucide-react';

import { Button, Card, Progress } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';

import type { ReactElement } from 'react';

import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';

/** Renders moving-day progress when at least one box has been closed. */
export function MovingDayStrip({
  progress,
  onOpen,
}: {
  progress: WebSummaryGetResponse['moving'];
  onOpen: () => void;
}): ReactElement {
  const percent = progress.total === 0 ? 0 : Math.round((progress.closed / progress.total) * 100);
  return (
    <Card className="flex shrink-0 flex-row items-center gap-4 border-app-accent/30 bg-app-accent/5 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-app-accent/15">
        <INVENTORY_ICONS.container className="size-4 text-app-accent" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">Packing up the house</span>
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
