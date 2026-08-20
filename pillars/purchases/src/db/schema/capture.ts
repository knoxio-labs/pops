/**
 * `purchase_capture` — what the device and the photograph said about
 * themselves.
 *
 * A receipt photographed at the till carries two facts the paper never
 * states: when the shutter fired, and where the phone was standing. Both are
 * recorded data rather than inference, and both were discarded until now —
 * the drop-zone inferred a timezone from a printed address and dated an
 * undated receipt from its upload.
 *
 * Storing the location was a decision rather than a by-product of reading
 * the file, and it is recorded as one in
 * [ADR-047](../../../../../docs/architecture/adr-047-purchases-stores-capture-location.md).
 * Read that before widening what this table holds or what may join it.
 *
 * **Its own table rather than columns on `purchases`.** The coordinates are
 * the most sensitive thing this pillar stores, and a column on the order row
 * is a column every `SELECT` over an order carries into every serializer,
 * every log line that dumps a row, and every future read path written by
 * someone who never thought about it. A separate table has to be joined
 * deliberately, which is the property that keeps a location out of a
 * response nobody meant to put it in.
 *
 * One row per order, keyed on the order: several photographs of one long
 * receipt are one capture event, and a client that could say something
 * different about frame three would be describing a different shop.
 *
 * Every column is nullable because every one of them is ordinarily absent.
 * iOS and Android strip EXIF on share, screenshots never had any, a PDF
 * invoice is not a photograph, and a browser drop-zone sends no capture
 * block at all.
 *
 * Coordinates are `real`, not integer microdegrees. The all-money-is-cents
 * rule exists because subset-sum in the reconciliation ladder is exact over
 * integers; nothing sums a latitude, and EXIF states one as a rational the
 * camera already rounded.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { CAPTURE_SOURCES } from '../../contract/constants.js';
import { purchases } from './purchases.js';

export const purchaseCapture = sqliteTable(
  'purchase_capture',
  {
    purchaseId: text('purchase_id')
      .primaryKey()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /** ISO-8601 instant the shutter fired. NOT when the shop happened. */
    capturedAt: text('captured_at'),
    capturedAtSource: text('captured_at_source', { enum: CAPTURE_SOURCES }),
    /**
     * Minutes ahead of UTC at capture, as stated rather than derived. It
     * places the reading in time and does not name a zone: `+09:30` is
     * Adelaide and Broken Hill, and in December it is neither.
     */
    utcOffsetMinutes: integer('utc_offset_minutes'),
    /** The IANA zone the client declared, when it declared one. */
    declaredTimeZone: text('declared_time_zone'),
    /** WGS-84 signed decimal degrees, south negative. */
    latitude: real('latitude'),
    /** WGS-84 signed decimal degrees, west negative. */
    longitude: real('longitude'),
    locationSource: text('location_source', { enum: CAPTURE_SOURCES }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [index('idx_purchase_capture_captured_at').on(t.capturedAt)]
);
