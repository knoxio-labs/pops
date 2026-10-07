import { eq, lte } from 'drizzle-orm';

import { pendingReceiptCaptures } from '../schema.js';

import type { ClientCapture, CaptureLocation } from '../../ingest/receipt/capture.js';
import type { PendingReceiptCaptureInsert } from '../schema.js';
import type { PurchasesDb } from './internal.js';
import type { CreateCaptureInput } from './purchase-input.js';

/** Client and resolved capture facts held until a receipt is saved or expires. */
export interface PendingReceiptCapture {
  readonly clientCapture: ClientCapture | undefined;
  readonly capture: Required<CreateCaptureInput>;
  readonly expiresAt: string;
}

/** Merge a later upload's capture facts over facts retained for the same receipt. */
export function mergeReceiptClientCapture(
  previous: ClientCapture | undefined,
  current: ClientCapture | undefined
): ClientCapture {
  return {
    capturedAt: current?.capturedAt ?? previous?.capturedAt,
    timeZone: current?.timeZone ?? previous?.timeZone,
    location: current?.location ?? previous?.location,
  };
}

/** Read a receipt's temporary capture facts, deleting an expired row on access. */
export function findPendingReceiptCapture(
  db: PurchasesDb,
  receiptKey: string,
  now: Date = new Date()
): PendingReceiptCapture | undefined {
  const row = db
    .select()
    .from(pendingReceiptCaptures)
    .where(eq(pendingReceiptCaptures.receiptKey, receiptKey))
    .all()[0];
  if (row === undefined) return undefined;

  const expiration = Date.parse(row.expiresAt);
  if (!Number.isFinite(expiration) || expiration <= now.getTime()) {
    deletePendingReceiptCapture(db, receiptKey);
    return undefined;
  }

  const location = captureLocation(row.clientLatitude, row.clientLongitude);
  const clientCapture = {
    capturedAt: row.clientCapturedAt ?? undefined,
    timeZone: row.clientTimeZone ?? undefined,
    location,
  };
  return {
    clientCapture:
      clientCapture.capturedAt === undefined &&
      clientCapture.timeZone === undefined &&
      clientCapture.location === undefined
        ? undefined
        : clientCapture,
    capture: {
      capturedAt: row.capturedAt,
      capturedAtSource: row.capturedAtSource,
      utcOffsetMinutes: row.utcOffsetMinutes,
      declaredTimeZone: row.declaredTimeZone,
      latitude: row.latitude,
      longitude: row.longitude,
      locationSource: row.locationSource,
    },
    expiresAt: row.expiresAt,
  };
}

/** Store capture facts until their receipt is saved or the receipt retention window expires. */
export function upsertPendingReceiptCapture(
  db: PurchasesDb,
  input: {
    readonly receiptKey: string;
    readonly clientCapture: ClientCapture | undefined;
    readonly capture: Required<CreateCaptureInput>;
    readonly expiresAt: string;
    readonly now?: Date;
  }
): void {
  const values = pendingCaptureValues(input);
  if (!hasCaptureFacts(input.capture)) return;

  findPendingReceiptCapture(db, input.receiptKey, input.now);
  db.insert(pendingReceiptCaptures)
    .values(values)
    .onConflictDoUpdate({
      target: pendingReceiptCaptures.receiptKey,
      set: pendingCaptureUpdate(values),
    })
    .run();
}

/** Remove pending metadata after the receipt has become a purchase. */
export function deletePendingReceiptCapture(db: PurchasesDb, receiptKey: string): void {
  db.delete(pendingReceiptCaptures).where(eq(pendingReceiptCaptures.receiptKey, receiptKey)).run();
}

/** Delete pending capture metadata that has reached its receipt retention deadline. */
export function pruneExpiredReceiptCaptures(db: PurchasesDb, now: Date): number {
  return db
    .delete(pendingReceiptCaptures)
    .where(lte(pendingReceiptCaptures.expiresAt, now.toISOString()))
    .run().changes;
}

function captureLocation(
  latitude: number | null,
  longitude: number | null
): CaptureLocation | undefined {
  if (latitude === null || longitude === null) return undefined;
  return { latitude, longitude };
}

function hasCaptureFacts(capture: Required<CreateCaptureInput>): boolean {
  return (
    capture.capturedAt !== null ||
    capture.utcOffsetMinutes !== null ||
    capture.declaredTimeZone !== null ||
    capture.latitude !== null
  );
}

function pendingCaptureValues(input: {
  readonly receiptKey: string;
  readonly clientCapture: ClientCapture | undefined;
  readonly capture: Required<CreateCaptureInput>;
  readonly expiresAt: string;
}): PendingReceiptCaptureInsert {
  const clientCapture = clientCaptureColumns(input.clientCapture);
  return {
    receiptKey: input.receiptKey,
    ...clientCapture,
    ...input.capture,
    expiresAt: input.expiresAt,
  };
}

function clientCaptureColumns(
  clientCapture: ClientCapture | undefined
): Pick<
  PendingReceiptCaptureInsert,
  'clientCapturedAt' | 'clientTimeZone' | 'clientLatitude' | 'clientLongitude'
> {
  const location = clientCapture?.location;
  return {
    clientCapturedAt: clientCapture?.capturedAt ?? null,
    clientTimeZone: clientCapture?.timeZone ?? null,
    clientLatitude: location?.latitude ?? null,
    clientLongitude: location?.longitude ?? null,
  };
}

function pendingCaptureUpdate(
  values: PendingReceiptCaptureInsert
): Omit<PendingReceiptCaptureInsert, 'receiptKey' | 'expiresAt'> {
  const { receiptKey: _receiptKey, expiresAt: _expiresAt, ...updated } = values;
  return updated;
}
