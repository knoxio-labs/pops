import { eq, max } from 'drizzle-orm';

import { events, syncMeta } from '../../db/index.js';
import { readMinimumProtocol } from '../../protocol/rollout.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** Where the client's view of the log stands against this server's. */
export interface SyncState {
  /** Random id of this database's history; rotated when a backup is restored. */
  readonly epoch: string;
  /** The latest committed change sequence, `0` on an empty log. */
  readonly maxSeq: number;
}

/** Read {@link SyncState}. A missing epoch is a broken database and throws. */
export function readSyncState(db: CommandDb): SyncState {
  const latest = db
    .select({ seq: max(events.seq) })
    .from(events)
    .get();
  const epoch = db.select().from(syncMeta).where(eq(syncMeta.key, 'epoch')).get();
  if (epoch === undefined) throw new Error('sync_meta has no epoch; migration 0012 seeds it');
  return { epoch: epoch.value, maxSeq: latest?.seq ?? 0 };
}

/** The lowest `Pops-Inventory-Protocol` this server serves. */
export function readMinProtocol(db: CommandDb): number {
  return readMinimumProtocol(db);
}
