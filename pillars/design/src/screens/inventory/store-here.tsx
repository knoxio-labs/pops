import {
  deskTarget,
  kitchen13Target,
  linen02Target,
  multiPick,
  office04Target,
  storeWorld,
} from '@/fixtures/inventory/store-here';
import { StoreHereStage } from '@/kit/inventory/store-here/store-here-stage';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { StoreHereTarget } from '@/kit/inventory/shared/contracts';
import type { StoreHereOpening } from '@/kit/inventory/store-here/store-here-sheet';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Store here', order: 4, frame: 'web' };

/**
 * The Store here sheet (iOS parity #3), opened from a container or a place:
 * create new items straight into it, or search and tick existing ones, with
 * refusals in the move plan's words, a closed target refused, a full one
 * warned, and the Undo once stored.
 */
function stage(
  target: StoreHereTarget,
  tab: 'new' | 'existing',
  opening: StoreHereOpening = {}
): () => ReactNode {
  return function StoreHereState() {
    return <StoreHereStage target={target} world={storeWorld} tab={tab} opening={opening} />;
  };
}

export const states: ScreenStates = {
  'new-tab': stage(kitchen13Target, 'new', { created: ['Milk frother', 'Tea towels'] }),
  'existing-tab': stage(kitchen13Target, 'existing'),
  'existing-search': stage(kitchen13Target, 'existing', { query: 'cable' }),
  'existing-multi-pick': stage(kitchen13Target, 'existing', { selected: multiPick }),
  'existing-carries-contents': stage(deskTarget, 'existing', {
    query: 'tub',
    selected: ['box-cables'],
  }),
  'no-matches': stage(kitchen13Target, 'existing', { query: 'snorkel' }),
  'target-closed': stage(office04Target, 'existing'),
  'target-full': stage(linen02Target, 'existing', { selected: ['itm-sheets'] }),
  'place-target': stage(deskTarget, 'new'),
  done: stage(kitchen13Target, 'existing', { stored: 3 }),
  offline: stage(kitchen13Target, 'existing', { offline: true }),
};

const ExistingTab = stage(kitchen13Target, 'existing');

export default function StoreHereScreen() {
  return <ExistingTab />;
}
