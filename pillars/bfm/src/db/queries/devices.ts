import { eq } from 'drizzle-orm';

import { devices } from '../schema.js';

import type { BfmDb } from '../open-bfm-db.js';
import type { DeviceRow } from '../schema.js';

/**
 * Load one device by id, revoked or not.
 *
 * The revoked rows are deliberately in scope. The guard has to tell "no such
 * device" from "device we no longer trust" to answer 401 versus 403, and a
 * query that filtered `revokedAt IS NULL` would erase exactly that
 * distinction at the point it is needed.
 */
export function findDeviceById(db: BfmDb, id: string): DeviceRow | undefined {
  return db.select().from(devices).where(eq(devices.id, id)).get();
}

/**
 * Record that a device made contact.
 *
 * `seenAt` is passed in rather than taken from a clock in here so a caller can
 * write the same instant it puts in its response, and so a test can prove the
 * column advances without racing the millisecond the column's own default
 * would give it.
 *
 * Deliberately NOT called from the guard. Every authenticated request passing
 * through `requireDevice` would turn a read path into a write path on a
 * Litestream-replicated database, and whether that is worth coalescing is
 * POPS-1469 rather than a decision to make silently here. Today the one caller
 * is the bootstrap route, which a launching app calls once.
 */
export function touchDevice(db: BfmDb, id: string, seenAt: string): void {
  db.update(devices).set({ lastSeenAt: seenAt }).where(eq(devices.id, id)).run();
}
