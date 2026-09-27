import { CircleCheck, PackagePlus, Printer, Truck } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { MovingDaySummary } from './moving-day-board.js';
import { boxesByDestination, type MovingDayData } from './moving-day-model.js';

import type { ReactElement } from 'react';

const LOADING_TILES = ['packed', 'boxes', 'loose', 'labels'];
const LOADING_COLUMNS = ['packing', 'full', 'closed'];
const LOADING_CARDS = ['one', 'two', 'three'];

/** Renders the moving-day board geometry while its aggregate is pending. */
export function MovingDayLoading(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading boxes" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LOADING_TILES.map((tile) => (
          <Skeleton key={tile} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 w-full max-w-96" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
        {LOADING_COLUMNS.map((column) => (
          <div key={column} className="space-y-2 rounded-xl border p-2">
            {LOADING_CARDS.map((card) => (
              <Skeleton key={card} className="h-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders a retryable moving-day request failure. */
export function MovingDayError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={Truck}
        title="Could not load moving day"
        description="The inventory service did not answer. Try again."
        action={
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

/** Renders the first-run state and its route to item creation. */
export function MovingDayEmpty({
  looseCount,
  offline,
  onNewBox,
}: {
  readonly looseCount: number;
  readonly offline: boolean;
  readonly onNewBox: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
      <EmptyState
        icon={PackagePlus}
        title="No boxes yet"
        description={`${looseCount} ${looseCount === 1 ? 'thing is' : 'things are'} in the house. Add a box, then store things in it as you pack.`}
        action={
          <Button
            prefix={<PackagePlus className="size-4" aria-hidden />}
            disabled={offline}
            title={offline ? 'No connection' : undefined}
            onClick={onNewBox}
          >
            New box
          </Button>
        }
      />
    </div>
  );
}

/** Renders the completed move summary and the missing-label route. */
export function MovingDayDone({
  data,
  onPrintLabels,
}: {
  readonly data: MovingDayData;
  readonly onPrintLabels?: () => void;
}): ReactElement {
  const groups = boxesByDestination(data).filter((group) => group.boxes.length > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <MovingDaySummary summary={data} onPrintLabels={onPrintLabels} />
      <div className="flex flex-1 items-center justify-center rounded-xl border bg-card p-6">
        <div className="w-full max-w-md space-y-4 text-center">
          <CircleCheck className="mx-auto size-10 text-app-accent" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">All {data.boxes.length} boxes are closed</h2>
            <p className="text-sm text-muted-foreground">
              Nothing is loose in the house. {data.packed} things are in boxes.
            </p>
          </div>
          <ul className="divide-y rounded-lg border text-left text-sm">
            {groups.map((group) => (
              <li
                key={group.optionKey ?? 'none'}
                className="flex min-h-11 items-center justify-between px-3"
              >
                <span>{group.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {group.boxes.length === 1 ? '1 box' : `${group.boxes.length} boxes`}
                </span>
              </li>
            ))}
          </ul>
          {data.unlabelledClosed > 0 ? (
            <Button
              variant="outline"
              prefix={<Printer className="size-4" aria-hidden />}
              onClick={onPrintLabels}
            >
              Print {data.unlabelledClosed} missing labels
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
