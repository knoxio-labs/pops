/**
 * `/inventory`: where things stand. Counts, what is open, what is in hand
 * and what just happened, with the verbs that finish each. The panels fill
 * the viewport and scroll inside; the page itself never scrolls.
 */
import { LayoutDashboard } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { NewItemButton } from '../shared/new-item-button';
import { InventoryPage } from '../shared/page-frame';
import { FirstRunCard } from './first-run';
import { LoadError } from './inventory-page';
import { MovingDayStrip } from './moving-day-strip';
import { movingProgress, openContainerRows, overviewCounts } from './overview-model';
import { InHandPanel, OpenContainersPanel } from './overview-panels';
import { RecentWorkPanel } from './recent-work-panel';
import { StatTiles } from './stat-tiles';

import type { ReactNode } from 'react';

import type { EventModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';

/** Props for {@link OverviewPage}. */
export interface OverviewPageProps {
  world: PlacementWorld;
  events: readonly EventModel[];
  now: string;
  body?: 'panels' | 'first-run' | 'loading' | 'error';
  banner?: ReactNode;
  /** Mutations are off (offline): every verb says why. */
  disabledReason?: string;
  /** Present while a move is under way. */
  moving?: { destination: string };
  onNavigate?: (path: string) => void;
}

function Panels({ world, events, now, disabledReason, moving, onNavigate }: OverviewPageProps) {
  const ctx = { world, disabledReason, onNavigate };
  const inHand = [...world.items.values()].filter(
    (entry) => entry.placement.kind === 'in-hand' && entry.lifecycle === 'active'
  );
  return (
    <>
      <StatTiles counts={overviewCounts(world)} onNavigate={onNavigate} />
      {moving ? (
        <MovingDayStrip
          progress={movingProgress(world)}
          destination={moving.destination}
          onOpen={() => onNavigate?.('/inventory/moving-day')}
        />
      ) : null}
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 md:grid-rows-2 xl:grid-cols-3 xl:grid-rows-1">
        <OpenContainersPanel rows={openContainerRows(world)} ctx={ctx} />
        <InHandPanel items={inHand} ctx={ctx} />
        <RecentWorkPanel
          events={events}
          now={now}
          disabledReason={disabledReason}
          onNavigate={onNavigate}
          className="md:col-span-2 xl:col-span-1"
        />
      </div>
    </>
  );
}

function LoadingBody() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-busy="true"
      aria-label="Loading overview"
    >
      <div className="grid grid-cols-3 gap-3">
        {['a', 'b', 'c'].map((key) => (
          <Skeleton key={key} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {['a', 'b', 'c'].map((key) => (
          <Skeleton key={key} className="h-full min-h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** The Overview page. */
export function OverviewPage(props: OverviewPageProps) {
  const body = props.body ?? 'panels';
  return (
    <InventoryPage
      title="Overview"
      icon={LayoutDashboard}
      actions={
        <NewItemButton offline={props.disabledReason !== undefined} onNavigate={props.onNavigate} />
      }
      banner={props.banner}
      bodyClassName="gap-3"
    >
      {body === 'panels' ? <Panels {...props} /> : null}
      {body === 'first-run' ? <FirstRunCard onNavigate={props.onNavigate} /> : null}
      {body === 'loading' ? <LoadingBody /> : null}
      {body === 'error' ? (
        <LoadError
          title="The overview did not load"
          detail="Counts and panels come from one request, and it timed out. Nothing was changed."
        />
      ) : null}
    </InventoryPage>
  );
}
