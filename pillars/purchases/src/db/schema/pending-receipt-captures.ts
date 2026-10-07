import { index, sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

import { CAPTURE_SOURCES } from '../../contract/constants.js';

export const pendingReceiptCaptures = sqliteTable(
  'pending_receipt_captures',
  {
    receiptKey: text('receipt_key').primaryKey(),
    clientCapturedAt: text('client_captured_at'),
    clientTimeZone: text('client_time_zone'),
    clientLatitude: real('client_latitude'),
    clientLongitude: real('client_longitude'),
    capturedAt: text('captured_at'),
    capturedAtSource: text('captured_at_source', { enum: CAPTURE_SOURCES }),
    utcOffsetMinutes: integer('utc_offset_minutes'),
    declaredTimeZone: text('declared_time_zone'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    locationSource: text('location_source', { enum: CAPTURE_SOURCES }),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [index('idx_pending_receipt_captures_expires_at').on(t.expiresAt)]
);
