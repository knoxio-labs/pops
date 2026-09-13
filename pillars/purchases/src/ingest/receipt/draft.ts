/**
 * A read receipt, shaped into fields a reviewer can edit — without the
 * admissibility guarantee {@link receiptToPurchase} requires.
 *
 * `purchase.ts` deliberately narrows its own entry point to
 * `AdmissibleGate`, so a reading the arithmetic gate refused cannot become a
 * fact by accident. This module exists because POPS-2454 needs the SAME
 * shaping — money parsed, lines allocated, capture resolved — for a reading
 * that has NOT cleared the gate, on the arm where a human is about to look
 * at it before anything is written. It reuses `purchase.ts`'s helpers
 * rather than re-implementing them, and produces a plain data shape with no
 * persistence meaning of its own: nothing here calls `createPurchase`, and
 * the caller decides what to do with the result.
 */
import { parseAmountCents } from '../money.js';
import { resolveCapture } from './capture.js';
import { CURRENCY_UNCERTAIN, resolveCurrency } from './currency.js';
import {
  captureInput,
  DATE_UNCERTAIN,
  occurredAt,
  offsetAt,
  TIMEZONE_UNCERTAIN,
  toItem,
  withAllocatedShipping,
} from './purchase.js';

import type { CreateCaptureInput, CreateItemInput } from '../../db/services/purchase-input.js';
import type { ResolvedCapture } from './capture.js';
import type { ExtractedReceipt } from './extraction.js';
import type { GateResult } from './gate.js';
import type { StoredReceipt } from './store.js';

export interface ReceiptDraftDocument {
  readonly documentUri: string;
  readonly kind: 'receipt';
}

/**
 * `toItem`'s output, with its array fields made mutable.
 *
 * `CreateItemInput` declares `tags`, `notes` and `units` as `readonly` —
 * correct for the DB-write type it also serves, and incompatible with the
 * wire schema's plain arrays, which zod always infers as mutable. This is
 * the one place that difference has to be bridged, since a draft item is a
 * WIRE value, not a DB-write value, even though today it is shaped by the
 * same helper.
 */
function toWireItem(item: CreateItemInput): CreateItemInput & {
  tags?: string[];
  notes?: string[];
  units?: { serialNumber?: string | null; inventoryItemUri?: string | null }[];
} {
  return {
    ...item,
    tags: item.tags === undefined ? undefined : [...item.tags],
    notes: item.notes === undefined ? undefined : [...item.notes],
    units: item.units === undefined ? undefined : item.units.map((unit) => ({ ...unit })),
  };
}

/**
 * Everything a reviewer can change before a receipt-derived draft becomes a
 * purchase. Shaped like {@link CreatePurchaseInput} minus the fields only the
 * save path may decide — `source`, `ingestMethod`, `checksum` and
 * `sourceOrderId` all name PROVENANCE, and a draft carries none of that: it
 * is not yet anything the pillar has agreed to keep.
 */
export interface ReceiptDraftFields {
  readonly merchantEntityName: string | null;
  readonly orderedAt: string;
  readonly orderedAtOffsetMinutes: number | null;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly surchargeCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly items: ReturnType<typeof toWireItem>[];
  readonly tags: string[];
  readonly capture: Required<CreateCaptureInput>;
  readonly documents: ReceiptDraftDocument[];
}

/**
 * The total a reviewer should start from.
 *
 * An admissible gate proved its own `totalCents` against the receipt's
 * lines, so that figure is used verbatim. An inadmissible one has no such
 * figure — that is exactly what "inadmissible" can mean — so this falls
 * back to the total as PRINTED, which is what a human corrects from, and
 * only when even that will not parse does it fall back to the components
 * the gate did manage to read.
 */
function startingTotalCents(extracted: ExtractedReceipt, gate: GateResult): number {
  if (gate.admissible) return gate.totalCents;
  const stated = parseAmountCents(extracted.total, { currency: extracted.currency });
  if (stated !== null) return stated;
  const taxComponent = gate.taxIncluded ? 0 : gate.taxCents;
  return (
    gate.lineTotalCents -
    gate.discountCents +
    gate.surchargeCents +
    gate.shippingCents +
    taxComponent
  );
}

export interface ReceiptDraftContext {
  readonly uploadedAt?: string;
  readonly capture?: ResolvedCapture;
}

/**
 * Shape a read receipt into editable fields, admissible or not.
 *
 * Mirrors `receiptToPurchase` step for step — same date resolution, same
 * per-line parsing, same shipping allocation, same capture resolution — so
 * a draft a reviewer saves unedited reproduces the purchase the old
 * upload-and-persist path would have written for an admissible reading.
 */
export function shapeReceiptDraft(
  extracted: ExtractedReceipt,
  gate: GateResult,
  stored: readonly StoredReceipt[],
  context: ReceiptDraftContext = {}
): ReceiptDraftFields {
  const uploadedAt = context.uploadedAt ?? new Date().toISOString();
  const capture = context.capture ?? resolveCapture(undefined, null, extracted.timeZone);
  const stated = occurredAt(extracted, capture.timeReference);
  const orderedAt = stated ?? capture.capturedAt ?? uploadedAt;

  // The same resolution the upload path uses (POPS-3570): a currency the
  // receipt did not state is inferred or left unresolved, and marked, never
  // defaulted to AUD on the draft route either.
  const resolvedCurrency = resolveCurrency(extracted);

  const tags = [
    ...(stated === null ? [DATE_UNCERTAIN] : []),
    ...(capture.zoneCertain ? [] : [TIMEZONE_UNCERTAIN]),
    ...(resolvedCurrency.uncertain ? [CURRENCY_UNCERTAIN] : []),
  ];

  const locale = { currency: extracted.currency };
  const readItems = extracted.lines
    .map((line) => toItem(line, locale))
    .filter((item): item is CreateItemInput => item !== null);
  const items = withAllocatedShipping(readItems, gate.shippingCents).map(toWireItem);

  return {
    merchantEntityName: extracted.merchantName,
    orderedAt,
    orderedAtOffsetMinutes: offsetAt(orderedAt, capture.timeReference),
    currency: resolvedCurrency.currency,
    subtotalCents: gate.lineTotalCents,
    taxCents: gate.taxIncluded ? 0 : gate.taxCents,
    surchargeCents: gate.surchargeCents,
    shippingCents: gate.shippingCents,
    discountCents: gate.discountCents,
    totalCents: startingTotalCents(extracted, gate),
    items,
    tags,
    capture: captureInput(capture),
    documents: stored.map((one) => ({ documentUri: one.uri, kind: 'receipt' as const })),
  };
}
