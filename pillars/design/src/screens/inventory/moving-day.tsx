import {
  MOVING_HOME_ID,
  movingDestinations,
  movingDoneWorld,
  movingNotStartedWorld,
  movingWorld,
} from '@/fixtures/inventory/moving-day';
import { MovingDayPage } from '@/kit/inventory/moving-day/moving-day-page';
import {
  MovingDayDone,
  MovingDayLoading,
  MovingDayNotStarted,
} from '@/kit/inventory/moving-day/moving-day-states';
import { summariseMove } from '@/kit/inventory/moving-day/moving-model';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { MovingDayPageProps } from '@/kit/inventory/moving-day/moving-day-page';
import type { MovingSeed } from '@/kit/inventory/moving-day/use-moving-day';

export const meta: ScreenMeta = { title: 'Moving day', order: 7, frame: 'web' };

const base: MovingSeed = {
  world: movingWorld,
  homeId: MOVING_HOME_ID,
  destinations: movingDestinations,
};

function page(seed: Partial<MovingSeed> = {}, extra: Partial<MovingDayPageProps> = {}) {
  return function MovingDayState() {
    return <MovingDayPage seed={{ ...base, ...seed }} {...extra} />;
  };
}

/**
 * The move-out overview: what is packed where, which boxes are packing,
 * full or closed, and what is not packed yet.
 */
export const states: ScreenStates = {
  overview: page(),
  'by-destination': page({ view: 'destinations' }),
  'not-packed': page({ view: 'loose' }),
  'container-progress': page({ openBoxId: 'mv-k04' }),
  'find-in-boxes': page({ query: 'plate' }),
  'find-nothing': page({ query: 'kettle lead' }),
  'box-closed': page({}, { toast: { concept: 'closed', message: 'Closed Kitchen 03' } }),
  done: () => (
    <MovingDayDone
      world={movingDoneWorld}
      summary={summariseMove(movingDoneWorld, MOVING_HOME_ID, movingDestinations)}
    />
  ),
  empty: () => (
    <MovingDayNotStarted
      loose={summariseMove(movingNotStartedWorld, MOVING_HOME_ID, new Map()).looseCount}
    />
  ),
  loading: () => <MovingDayLoading />,
  offline: page(
    {},
    {
      banner: {
        kind: 'offline',
        title: 'No connection. Showing the boxes as they were.',
        detail: 'Closing, packing and marking full come back when the connection does.',
      },
    }
  ),
  stale: page(
    {},
    {
      banner: {
        kind: 'stale',
        title: 'Boxes changed on iPhone 30 seconds ago.',
        detail: 'Someone is packing on the phone. Reload to see what they closed.',
        actionLabel: 'Reload',
      },
    }
  ),
};

export default function MovingDayScreen() {
  return <MovingDayPage seed={base} />;
}
