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
