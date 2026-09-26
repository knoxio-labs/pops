import { eq } from 'drizzle-orm';

import { syncMeta } from '../schema.js';

import type { InventoryDb } from './internal.js';

const CONNECTIONS_CHANGED_AT_KEY = 'connections_changed_at';

/** Record the latest connection or fixture change at `now`. */
export function touchConnectionsChanged(db: InventoryDb, now: string): void {
  db.insert(syncMeta)
    .values({ key: CONNECTIONS_CHANGED_AT_KEY, value: now })
    .onConflictDoUpdate({ target: syncMeta.key, set: { value: now } })
    .run();
}

/** Read the latest connection or fixture change, or `null` when none exists. */
export function readConnectionsChangedAt(db: InventoryDb): string | null {
  return (
    db
      .select({ value: syncMeta.value })
      .from(syncMeta)
      .where(eq(syncMeta.key, CONNECTIONS_CHANGED_AT_KEY))
      .get()?.value ?? null
  );
}
