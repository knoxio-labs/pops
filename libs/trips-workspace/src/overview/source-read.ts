import { assertSourceOwner } from '../shared/retained-session-store';

import type { RetainedSourceOwner } from '../shared/retained-session-store';

/** Reject delivery after a mutable connection change as well as dispatch through a stale captured owner. */
export async function readOverviewSource<Value>(
  owner: RetainedSourceOwner,
  read: () => Promise<Value>
): Promise<Value> {
  assertSourceOwner(owner);
  const value = await read();
  assertSourceOwner(owner);
  return value;
}
