import { activityStates } from '@/kit/inventory/sync/sync-states';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Activity', order: 81, frame: 'web' };

/**
 * The Sync page opened on its Activity segment (Activity has no nav item of
 * its own, owner decision 1). The same states appear on the Sync screen
 * prefixed `activity-`.
 */
export const states: ScreenStates = Object.fromEntries(
  Object.entries(activityStates).filter(([name]) => name !== 'default')
);

export default activityStates.default ?? (() => null);
