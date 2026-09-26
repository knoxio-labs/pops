import { sql } from 'drizzle-orm';
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** The latest whole sync-ledger report received from each authenticated device. */
export const deviceSyncLedgers = sqliteTable(
  'device_sync_ledgers',
  {
    deviceId: text('device_id').primaryKey(),
    deviceLabel: text('device_label').notNull(),
    reportedAt: text('reported_at').notNull(),
    receivedAt: text('received_at').notNull(),
    report: text('report').notNull(),
  },
  (table) => [check('ck_device_sync_ledgers_report', sql`json_valid(${table.report})`)]
);
