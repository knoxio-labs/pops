/**
 * Every container state of the item page: open, closed, full, the unpack
 * flow from start to outcome, selection, bulk move, Store here, empty and
 * tablet. Kitchen 12 carries them all, so the list stays the same list.
 */
import {
  emptyShoebox,
  kitchen12Contents,
  kitchen12Workspace,
} from '@/fixtures/inventory/container-workspace';
import { recentPlacements } from '@/fixtures/inventory/recents';

import { EMPTY_SELECTION } from '../foundation';
import { ItemDetailPage } from '../item-detail/item-detail-page';
import { initialUnpack } from './unpack-model';

import type { ComponentType } from 'react';

import type { ItemDetailModel } from '../item-detail/detail-model';
import type { ItemDetailPageProps } from '../item-detail/item-detail-page';
import type { ExitKind, UnpackState } from './unpack-model';

const open = kitchen12Workspace('open');
const closed = kitchen12Workspace('closed', true);
const full = kitchen12Workspace('open', true);
const inside = kitchen12Contents(open);

function unpacked(
  outCount: number,
  access: 'open' | 'closed',
  phase: UnpackState['phase']
): UnpackState {
  const how: ExitKind = 'take-out';
  return {
    ...initialUnpack(inside.slice(outCount), access),
    phase,
    out: inside.slice(0, outCount).map((id) => ({ id, how })),
  };
}

function state(
  model: ItemDetailModel,
  extra: Omit<ItemDetailPageProps, 'model'> = {}
): ComponentType {
  return function ContainerState() {
    return <ItemDetailPage model={model} recents={recentPlacements} {...extra} />;
  };
}

const selected = (ids: readonly string[]) => ({
  ...EMPTY_SELECTION,
  selected: new Set(ids),
  anchorId: ids[0] ?? null,
  focusedId: ids.at(-1) ?? null,
});

/** The container states. */
export const containerStates: Record<string, ComponentType> = {
  container: state(open),
  'container-closed': state(closed),
  'container-full': state(full),
  'container-selected': state(open, { workspace: { selection: selected(inside.slice(1, 4)) } }),
  'container-unpacking': state(open, {
    workspace: {
      unpack: unpacked(5, 'open', 'unpacking'),
      selection: selected(inside.slice(5, 7)),
    },
  }),
  'container-closed-partial': state(closed, {
    workspace: { unpack: unpacked(5, 'closed', 'closed-partial') },
  }),
  'container-emptied-choose-outcome': state(open, {
    workspace: { unpack: unpacked(inside.length, 'open', 'emptied') },
  }),
  'container-retire-confirm': state(open, {
    workspace: { unpack: unpacked(inside.length, 'open', 'confirm-retire') },
  }),
  'container-move-plan': state(open, { workspace: { moveIds: inside.slice(0, 3) } }),
  'container-store-here': state(open, { workspace: { storeHereOpen: true } }),
  'container-empty': state(emptyShoebox),
  'container-empty-filtered': state(open, { workspace: { query: 'zzz' } }),
  'container-tablet': () => (
    <div className="mx-auto w-full max-w-164">
      <ItemDetailPage model={open} recents={recentPlacements} />
    </div>
  ),
};
