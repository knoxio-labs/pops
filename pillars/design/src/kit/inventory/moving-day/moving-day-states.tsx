/**
 * Moving day before and after: loading (one skeleton in the page's shape),
 * not started (no boxes yet, and the one action that starts), and done
 * (everything closed, with what is left to do on the day).
 */
import { CircleCheck, PackagePlus, Printer, Truck } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { FitPage } from '../locations-tree/fit-page';
import { boxesByDestination } from './moving-model';

import type { PlacementWorld } from '../foundation';
import type { MovingSummary } from './moving-model';

const TILES = ['t1', 't2', 't3', 't4'];
const COLUMNS = ['c1', 'c2', 'c3'];
const CARDS = ['k1', 'k2', 'k3', 'k4'];

/** Loading. */
export function MovingDayLoading() {
  return (
    <FitPage title="Moving day" icon={Truck} description="Loading boxes">
      <div
        aria-busy="true"
        aria-label="Loading boxes"
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="grid grid-cols-4 gap-3">
          {TILES.map((tile) => (
            <Skeleton key={tile} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-96" />
        <div className="grid flex-1 grid-cols-3 gap-3">
          {COLUMNS.map((column) => (
            <div key={column} className="space-y-2 rounded-xl border p-2">
              {CARDS.map((card) => (
                <Skeleton key={card} className="h-20" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </FitPage>
  );
}

/** No boxes yet. */
export function MovingDayNotStarted({ loose }: { loose: number }) {
  return (
    <FitPage title="Moving day" icon={Truck}>
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          icon={PackagePlus}
          title="No boxes yet"
          description={`${loose} things are in the house. Add a box, name it for the room it is packed in (Kitchen 01), then store things in it as you pack. Each box gets a label code so you can find it again.`}
          action={<Button prefix={<PackagePlus className="size-4" aria-hidden />}>New box</Button>}
        />
      </div>
    </FitPage>
  );
}

/** Everything packed and closed. */
export function MovingDayDone({
  world,
  summary,
}: {
  world: PlacementWorld;
  summary: MovingSummary;
}) {
  const groups = boxesByDestination(world, summary.boxes);
  return (
    <FitPage title="Moving day" icon={Truck} description="Packing is done">
      <div className="flex flex-1 items-center justify-center rounded-xl border bg-card">
        <div className="max-w-md space-y-4 text-center">
          <CircleCheck className="mx-auto size-10 text-app-accent" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">All {summary.boxes.length} boxes are closed</h2>
            <p className="text-sm text-muted-foreground">
              Nothing is loose in the house. {summary.packed} things are in boxes.
            </p>
          </div>
          <ul className="divide-y rounded-lg border text-left text-sm">
            {groups.map((group) => (
              <li
                key={group.destination?.id ?? 'none'}
                className="flex h-10 items-center justify-between px-3"
              >
                <span>{group.destination?.name ?? 'No destination'}</span>
                <span className="tabular-nums text-muted-foreground">
                  {group.boxes.length === 1 ? '1 box' : `${group.boxes.length} boxes`}
                </span>
              </li>
            ))}
          </ul>
          {summary.unlabelledClosed > 0 ? (
            <Button variant="outline" prefix={<Printer className="size-4" aria-hidden />}>
              Print {summary.unlabelledClosed} missing labels
            </Button>
          ) : null}
        </div>
      </div>
    </FitPage>
  );
}
