import { activityEvents } from '@/fixtures/inventory/activity';
import { coreWorld } from '@/fixtures/inventory/core';
import { DESIGN_NOW } from '@/fixtures/inventory/sync-cases';
import { OverviewPage } from '@/kit/inventory/overview/overview-page';
import { buildWorld } from '@/kit/inventory/shared/placement-model';
import { OFFLINE_REASON, OFFLINE_TITLE, StateBanner } from '@/kit/inventory/shared/state-banner';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { OverviewPageProps } from '@/kit/inventory/overview/overview-page';

export const meta: ScreenMeta = { title: 'Overview', order: 0, frame: 'web' };

const base: OverviewPageProps = { world: coreWorld, events: activityEvents, now: DESIGN_NOW };

function page(props: Partial<OverviewPageProps>) {
  return function OverviewState() {
    return <OverviewPage {...base} {...props} />;
  };
}

/**
 * `/inventory`, in every state it can open in: working (default), before
 * anything exists, during a move, loading, offline, stale, failed, and with
 * changes from a phone waiting for a decision.
 */
export const states: ScreenStates = {
  'first-run': page({ world: buildWorld([], []), events: [], body: 'first-run' }),
  'moving-day': page({ moving: { destination: 'Banksia Road flat' } }),
  loading: page({ body: 'loading' }),
  offline: page({
    disabledReason: OFFLINE_REASON,
    banner: (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Close, Put back, Move and Undo are off until the connection is back."
        actionLabel="Retry"
      />
    ),
  }),
  stale: page({
    banner: (
      <StateBanner
        kind="stale"
        title="Changed elsewhere 2 min ago."
        detail="Joao's iPhone moved 3 things. Reload to see them; nothing here changes on its own."
        actionLabel="Reload"
      />
    ),
  }),
  error: page({ body: 'error' }),
  'needs-attention': page({
    banner: (
      <StateBanner
        kind="needs-attention"
        title="5 changes from Joao's iPhone need a decision."
        detail="Until then they stay on the phone, and the items show Needs attention."
        actionLabel="Review in Sync"
      />
    ),
  }),
};

export default page({});
