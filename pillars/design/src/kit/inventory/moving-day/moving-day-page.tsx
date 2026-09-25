/**
 * `/inventory/moving-day`: the move-out at a glance. Four numbers across
 * the top (packed, boxes, not packed, labels), then one of three views of
 * the boxes: by packing stage, by destination, or what is not packed yet.
 * "Which box is it in?" searches every box's contents and answers with
 * the box. Opening a box shows it in a side sheet with what is still
 * loose in its room, one click from going in.
 */
import { PackagePlus, Search, Truck } from 'lucide-react';
import { useMemo } from 'react';

import { Button, Input, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { PlacementPicker, StateBanner } from '../foundation';
import { FitPage, TabCount } from '../locations-tree/fit-page';
import { BoxPanel } from './box-panel';
import { DestinationBoard } from './destination-board';
import { FindResults } from './find-results';
import { LooseBoard } from './loose-board';
import { MoveSummaryStrip } from './move-summary-strip';
import { StageBoard } from './stage-board';
import { useMovingDay } from './use-moving-day';

import type { PlacementTarget, StateBannerProps, UndoToastProps } from '../foundation';
import type { MovingDayApi, MovingSeed } from './use-moving-day';

/** Props for {@link MovingDayPage}. */
export interface MovingDayPageProps {
  seed: MovingSeed;
  banner?: StateBannerProps;
  toast?: UndoToastProps;
}

function Board({ api }: { api: MovingDayApi }) {
  const board = {
    world: api.world,
    boxes: api.summary.boxes,
    selectedId: api.openBoxId,
    onAction: api.act,
    onOpenBox: api.setOpenBoxId,
  };
  if (api.query.trim() !== '') {
    return (
      <FindResults
        world={api.world}
        boxes={api.summary.boxes}
        query={api.query}
        onClear={() => api.setQuery('')}
        onOpenBox={api.setOpenBoxId}
      />
    );
  }
  if (api.view === 'destinations') return <DestinationBoard {...board} />;
  if (api.view === 'loose') return <LooseBoard summary={api.summary} onPack={api.startPacking} />;
  return <StageBoard {...board} />;
}

function Toolbar({ api }: { api: MovingDayApi }) {
  return (
    <div className="flex items-center gap-3">
      <Tabs
        value={api.view}
        onValueChange={(value) =>
          api.setView(value === 'destinations' || value === 'loose' ? value : 'boxes')
        }
      >
        <TabsList>
          <TabsTrigger value="boxes" className="px-3">
            By stage
          </TabsTrigger>
          <TabsTrigger value="destinations" className="px-3">
            By destination
          </TabsTrigger>
          <TabsTrigger value="loose" className="px-3">
            Not packed
            <TabCount n={api.summary.looseCount + api.summary.inHand.length} />
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative ml-auto w-80">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Which box is it in?"
          placeholder="Which box is it in? Type a thing or a box"
          value={api.query}
          onChange={(event) => api.setQuery(event.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );
}

function PackPicker({ api }: { api: MovingDayApi }) {
  const subject = useMemo(
    () => ({ kind: 'items' as const, ids: api.packing ?? [] }),
    [api.packing]
  );
  const recents = useMemo<PlacementTarget[]>(
    () =>
      api.summary.boxes
        .filter((box) => box.stage !== 'closed')
        .map((box) => ({ kind: 'container', containerId: box.box.id })),
    [api.summary.boxes]
  );
  return (
    <PlacementPicker
      world={api.world}
      subject={subject}
      recents={recents}
      open={api.packing !== null}
      onOpenChange={(open) => (open ? undefined : api.cancelPacking())}
      onPick={(target) => api.putIn(api.packing ?? [], target)}
      trigger={<span aria-hidden className="fixed right-1/3 bottom-28 size-px" />}
    />
  );
}

/** The page. */
export function MovingDayPage({ seed, banner, toast }: MovingDayPageProps) {
  const api = useMovingDay(seed);
  const home = api.world.locations.get(seed.homeId)?.name ?? 'the house';
  const open = api.summary.boxes.find((box) => box.box.id === api.openBoxId) ?? null;
  return (
    <FitPage
      title="Moving day"
      icon={Truck}
      description={`Packing up ${home}`}
      banner={banner ? <StateBanner {...banner} /> : undefined}
      toast={toast}
      actions={<Button prefix={<PackagePlus className="size-4" aria-hidden />}>New box</Button>}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <MoveSummaryStrip summary={api.summary} />
        <Toolbar api={api} />
        <div className="flex min-h-0 flex-1 flex-col">
          <Board api={api} />
        </div>
        {open ? (
          <BoxPanel
            world={api.world}
            homeId={seed.homeId}
            box={open}
            summary={api.summary}
            onAction={(action) => api.act(open.box.id, action)}
            onPutIn={(ids) => api.putIn(ids, { kind: 'container', containerId: open.box.id })}
            onClose={() => api.setOpenBoxId(null)}
          />
        ) : null}
      </div>
      <PackPicker api={api} />
    </FitPage>
  );
}
