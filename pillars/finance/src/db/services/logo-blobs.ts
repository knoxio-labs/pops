/**
 * CRUD for `logo_blobs` (POPS-2804). Deliberately minimal — no update, since
 * a replacement is always a new row (see the schema doc comment); the
 * upload/removal orchestration that keeps `institutions.logo_asset_id` in
 * step lives in `src/api/modules/logo-upload.ts`, one layer up, because it
 * spans two tables.
 */
import { eq } from 'drizzle-orm';

import { LogoBlobNotFoundError } from '../errors.js';
import { logoBlobs } from '../schema.js';

import type { FinanceDb } from './internal.js';

export type LogoBlobRow = typeof logoBlobs.$inferSelect;

export interface CreateLogoBlobInput {
  contentType: string;
  data: Buffer;
}

/** Insert a new blob row and return it. */
export function createLogoBlob(db: FinanceDb, input: CreateLogoBlobInput): LogoBlobRow {
  const id = crypto.randomUUID();
  db.insert(logoBlobs)
    .values({ id, contentType: input.contentType, byteLength: input.data.length, data: input.data })
    .run();
  return getLogoBlob(db, id);
}

/** Get a blob by id. Throws `LogoBlobNotFoundError` if missing. */
export function getLogoBlob(db: FinanceDb, id: string): LogoBlobRow {
  const row = db.select().from(logoBlobs).where(eq(logoBlobs.id, id)).get();
  if (!row) throw new LogoBlobNotFoundError(id);
  return row;
}

/**
 * Delete a blob by id. Silently a no-op if it is already gone — callers use
 * this for best-effort cleanup of a superseded or removed logo, and a
 * missing row there is not an error.
 */
export function deleteLogoBlob(db: FinanceDb, id: string): void {
  db.delete(logoBlobs).where(eq(logoBlobs.id, id)).run();
}
