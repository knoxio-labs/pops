import { eq, max } from 'drizzle-orm';

import { events, syncMeta, type SyncMetaKey } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** Where the client's view of the log stands against this server's. */
export interface SyncState {
  /** Random id of this database's history; rotated when a backup is restored. */
  readonly epoch: string;
  /** The latest committed change sequence, `0` on an empty log. */
  readonly maxSeq: number;
}

function requireMeta(db: CommandDb, key: SyncMetaKey): string {
  const row = db.select().from(syncMeta).where(eq(syncMeta.key, key)).get();
  if (!row) throw new Error(`sync_meta has no ${key}; migration 0012 seeds it`);
  return row.value;
}

/** Read {@link SyncState}. A missing epoch is a broken database and throws. */
export function readSyncState(db: CommandDb): SyncState {
  const latest = db
    .select({ seq: max(events.seq) })
    .from(events)
    .get();
  return { epoch: requireMeta(db, 'epoch'), maxSeq: latest?.seq ?? 0 };
}

/** The lowest `Pops-Inventory-Protocol` this server serves. */
export function readMinProtocol(db: CommandDb): number {
  const minProtocol = Number.parseInt(requireMeta(db, 'min_protocol'), 10);
  if (!Number.isSafeInteger(minProtocol) || minProtocol < 1) {
    throw new Error('sync_meta.min_protocol is not a positive integer');
  }
  return minProtocol;
}
