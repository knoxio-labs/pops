import { readWebSyncLedger } from '../sync/ledger.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryWebSyncLedgerContract } from '../../contract/rest-sync-ledger.js';
import type { InventoryDb } from '../../db/index.js';

type Request = ServerInferRequest<typeof inventoryWebSyncLedgerContract>;

/** Build the read-only web sync-ledger handler. */
export function makeWebSyncLedgerHandlers(db: InventoryDb) {
  return {
    get: async (_request: Request['get']) => ({
      status: 200 as const,
      body: readWebSyncLedger(db, new Date().toISOString()),
    }),
  };
}
