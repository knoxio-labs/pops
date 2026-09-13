/**
 * Writing a purchase from a typed, reviewer-approved draft.
 *
 * Two callers share this: saving a corrected receipt-derived draft, and
 * creating a purchase typed by hand. Both arrive here already validated and
 * already carrying the provenance the CALLER decided — never the phone —
 * which is what keeps a manual entry from masquerading as an upload
 * (POPS-2454). This file's only job is the write itself: register the
 * source on first use, persist, read the result back, map a refusal.
 */
import { createPurchase, getPurchase, upsertSource } from '../../db/index.js';
import { tryMapServiceError } from './error-mapping.js';

import type { PurchaseDetail, PurchasesDb } from '../../db/index.js';
import type { CreatePurchaseInput } from '../../db/services/purchase-input.js';
import type { UpsertSourceInput } from '../../db/services/sources.js';
import type { ErrorBody } from './error-mapping.js';

export type DraftPersisted =
  | { readonly kind: 'written'; readonly detail: PurchaseDetail }
  | { readonly kind: 'refused'; readonly status: 400 | 409; readonly body: ErrorBody };

/**
 * Register a draft source on first use, the same lazy pattern
 * `receipt-persist.ts` uses for the drop-zone: the source exists the moment
 * something writes under it, rather than after an operator remembers to
 * seed it.
 */
export function ensureDraftSource(db: PurchasesDb, source: UpsertSourceInput): void {
  upsertSource(db, source);
}

/**
 * Persist a `CreatePurchaseInput` already shaped by the caller and read the
 * written row back, or map the refusal.
 *
 * The idempotency key travels as both `checksum` and `sourceOrderId` on
 * `input` (the caller's job, not this function's) — `createPurchase`
 * already refuses a repeat of either as a 409 inside one transaction, so a
 * retried save is rejected rather than duplicated, and a save that fails
 * partway writes nothing.
 */
export function persistDraftPurchase(db: PurchasesDb, input: CreatePurchaseInput): DraftPersisted {
  let id: string;
  try {
    id = createPurchase(db, input);
  } catch (error) {
    const mapped = tryMapServiceError(error);
    if (mapped?.status === 409) return { kind: 'refused', status: 409, body: mapped.body };
    if (mapped?.status === 400 || mapped?.status === 404) {
      return { kind: 'refused', status: 400, body: mapped.body };
    }
    throw error;
  }

  const detail = getPurchase(db, id);
  if (detail === undefined) {
    throw new Error(`createPurchase returned id ${id} but it could not be read back`);
  }
  return { kind: 'written', detail };
}
