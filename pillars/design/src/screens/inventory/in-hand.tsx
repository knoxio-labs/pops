import {
  coreWorld,
  headphones,
  inHandItems,
  screwdrivers,
  tapeMeasure,
  torch,
} from '@/fixtures/inventory/core';
import { recentPlacements } from '@/fixtures/inventory/recents';
import { orderInHand } from '@/kit/inventory/in-hand/in-hand-model';
import { InHandPage } from '@/kit/inventory/in-hand/in-hand-page';
import { PlacementPickerPanel } from '@/kit/inventory/placement-picker/placement-picker';
import { OFFLINE_REASON, OFFLINE_TITLE, StateBanner } from '@/kit/inventory/shared/state-banner';
import { UndoToast } from '@/kit/inventory/shared/undo-toast';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { InHandPageProps } from '@/kit/inventory/in-hand/in-hand-page';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'In hand', order: 4, frame: 'web' };

const base: InHandPageProps = { world: coreWorld, items: inHandItems };

function page(props: Partial<InHandPageProps>) {
  return function InHandState() {
    return <InHandPage {...base} {...props} />;
  };
}

/** Anchors the open picker under a row's Move verb. */
function PickerAt({ row, children }: { row: number; children: ReactNode }) {
  return (
    <div className="absolute right-2 z-10" style={{ top: `calc(${row + 1} * 3rem + 0.25rem)` }}>
      {children}
    </div>
  );
}

function picker(itemId: string, query?: string) {
  const row = orderInHand(inHandItems).findIndex((entry) => entry.id === itemId);
  return (
    <PickerAt row={row}>
      <PlacementPickerPanel
        world={coreWorld}
        subject={{ kind: 'items', ids: [itemId] }}
        recents={recentPlacements}
        initialQuery={query}
        onPick={() => undefined}
        onCreatePlace={() => undefined}
      />
    </PickerAt>
  );
}

const selected = {
  selected: new Set([tapeMeasure.id, screwdrivers.id]),
  anchorId: screwdrivers.id,
  focusedId: screwdrivers.id,
};

/**
 * `/inventory/in-hand`: several things in hand (default), two selected, a
 * previous place that was deleted, an item found loose with no place, just
 * put back with Undo, empty, loading, offline, stale and failed.
 */
export const states: ScreenStates = {
  'has-items': page({}),
  selected: page({ initialSelection: selected }),
  'previous-place-gone': page({
    initialSelection: { selected: new Set(), anchorId: headphones.id, focusedId: headphones.id },
    overlay: picker(headphones.id),
  }),
  'found-loose': page({
    initialSelection: { selected: new Set(), anchorId: torch.id, focusedId: torch.id },
    overlay: picker(torch.id, 'Hall'),
  }),
  'put-back': page({
    items: inHandItems.filter((entry) => entry.id !== tapeMeasure.id),
    toast: <UndoToast concept="putBack" message="Put Tape measure back in Red toolbox" />,
  }),
  empty: page({ items: [] }),
  loading: page({ body: 'loading' }),
  offline: page({
    disabledReason: OFFLINE_REASON,
    banner: (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Put back and Move are off until the connection is back."
        actionLabel="Retry"
      />
    ),
  }),
  stale: page({
    banner: (
      <StateBanner
        kind="stale"
        title="Changed elsewhere 1 min ago."
        detail="Joao's iPhone put something back. Reload to see it; your selection stays until you do."
        actionLabel="Reload"
      />
    ),
  }),
  error: page({ body: 'error' }),
};

export default page({});
