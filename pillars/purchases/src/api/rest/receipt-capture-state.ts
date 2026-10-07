import {
  findPendingReceiptCapture,
  mergeReceiptClientCapture,
  upsertPendingReceiptCapture,
} from '../../db/services/pending-receipt-captures.js';
import { resolveCapture } from '../../ingest/receipt/capture.js';
import { captureInput } from '../../ingest/receipt/purchase.js';
import { DEFAULT_RECEIPT_RETENTION_MS } from '../../ingest/receipt/retention-sweep.js';

import type { PurchasesDb } from '../../db/index.js';
import type { ClientCapture, ResolvedCapture } from '../../ingest/receipt/capture.js';
import type { PhotoCapture } from '../../ingest/receipt/exif.js';

/** Resolved capture evidence and the client signals needed for a later retry. */
export interface ReceiptCaptureState {
  readonly clientCapture: ClientCapture;
  readonly capture: ResolvedCapture;
}

/** New and retained evidence to use while resolving a receipt's capture state. */
export interface ResolveReceiptCaptureStateInput {
  readonly clientCapture: ClientCapture | undefined;
  readonly photo: PhotoCapture | null;
  readonly modelTimeZone: string | null;
}

/** Resolve current capture evidence together with unexpired evidence kept for the same receipt. */
export function resolveReceiptCaptureState(
  db: PurchasesDb,
  receiptKey: string,
  input: ResolveReceiptCaptureStateInput
): ReceiptCaptureState {
  const pending = findPendingReceiptCapture(db, receiptKey);
  const clientCapture = mergeReceiptClientCapture(pending?.clientCapture, input.clientCapture);
  return {
    clientCapture,
    capture: resolveCapture(clientCapture, input.photo, input.modelTimeZone),
  };
}

/** Retain resolved and client capture facts for the same lifetime as an unsaved receipt. */
export function retainReceiptCaptureState(
  db: PurchasesDb,
  receiptKey: string,
  state: ReceiptCaptureState
): void {
  const now = new Date();
  upsertPendingReceiptCapture(db, {
    receiptKey,
    clientCapture: state.clientCapture,
    capture: captureInput(state.capture),
    expiresAt: new Date(now.getTime() + DEFAULT_RECEIPT_RETENTION_MS).toISOString(),
    now,
  });
}
