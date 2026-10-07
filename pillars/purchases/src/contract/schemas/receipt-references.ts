/**
 * Wire shapes for pinning a stored receipt file to an owner on another
 * pillar. The routes that use them are on the `receipt` sub-router in
 * `rest-receipts.ts`.
 */
import { z } from 'zod';

import { PopsUriSchema, popsUriPattern } from './scalars.js';

const RECEIPT_URI_MESSAGE = 'expected a receipt URI, e.g. pops://purchases/receipt/<sha256>';

/**
 * A `pops://purchases/receipt/<sha256>` URI, and nothing else this pillar mints.
 *
 * The shared factory pins the pillar and type and accepts any id; this id is
 * always a SHA-256, which the refinement adds.
 */
export const ReceiptUriSchema = z
  .string()
  .regex(popsUriPattern('purchases', 'receipt'), RECEIPT_URI_MESSAGE)
  .refine((uri) => /\/[0-9a-f]{64}$/u.test(uri), { message: RECEIPT_URI_MESSAGE });

/**
 * How many files one reference call may name.
 *
 * An owner is one row on another pillar holding a handful of pages. The
 * ceiling keeps one request inside one SQL statement's bound-parameter limit
 * rather than making the write chunk itself.
 */
export const MAX_RECEIPT_REFERENCES_PER_CALL = 100;

export const StoredReceiptUrisSchema = z.object({
  /** Every part, in the order it was sent. */
  receiptUris: z.array(ReceiptUriSchema).min(1),
});

export const AddReceiptReferencesBodySchema = z.object({
  /** Whatever holds the files as evidence, on any pillar: `pops://<pillar>/<type>/<id>`. */
  ownerUri: PopsUriSchema,
  receiptUris: z.array(ReceiptUriSchema).min(1).max(MAX_RECEIPT_REFERENCES_PER_CALL),
});

export const RemoveReceiptReferencesBodySchema = z.object({
  ownerUri: PopsUriSchema,
  /** Omitted: release every file this owner holds. */
  receiptUris: z.array(ReceiptUriSchema).min(1).max(MAX_RECEIPT_REFERENCES_PER_CALL).optional(),
});
