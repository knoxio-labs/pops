/** Handlers for the aggregate `webSummary.*` REST sub-router. */
import { readWebSummary } from '../web/summary.js';

import type { InventoryDb } from '../../db/index.js';

/** Build the read-only `GET /web/summary` handler. */
export function makeWebSummaryHandlers(db: InventoryDb) {
  return {
    get: async () => ({ status: 200 as const, body: readWebSummary(db) }),
  };
}
