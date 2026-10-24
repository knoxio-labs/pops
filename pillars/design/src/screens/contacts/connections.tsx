import { Connections, connectionStates } from '@/experiments/contacts-import-review/connections';

import type { ScreenMeta } from '@/contract';

/** Google and iCloud read-only import connection proposals. */
export const meta: ScreenMeta = { title: 'Contact connections', order: 5, frame: 'web' };
/** Provider connection boundaries. */
export const states = connectionStates;
/** Stages connection status and import entry points. */
export default function ConnectionsScreen() {
  return <Connections />;
}
