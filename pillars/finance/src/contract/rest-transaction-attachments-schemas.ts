/**
 * The slice of the purchases receipt wire format that finance sends, reads
 * and passes through on its attachment routes.
 *
 * Restated here instead of imported: `@pops/purchases` depends on the
 * purchases backend's whole runtime graph, and finance needs five operations
 * of it. `scripts/ci/check-cross-pillar-expectations.mjs` pins those five to
 * the producer's published contract.
 */
import { z } from 'zod';

/** The `pops://` URI the receipt store issues for one stored file. */
export const RECEIPT_URI_PATTERN = /^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u;

export const ReceiptUriSchema = z
  .string()
  .regex(RECEIPT_URI_PATTERN, 'expected a receipt URI, e.g. pops://purchases/receipt/<sha256>');

/** How many files one reference call may name; the producer's own ceiling. */
export const MAX_RECEIPT_REFERENCES_PER_CALL = 100;

/** One file to store. The producer decides which media types it accepts. */
export const ReceiptPartSchema = z.object({
  mediaType: z.string().min(1),
  /** The file, base64 with no data-URI prefix. */
  dataBase64: z.string().min(1),
});

export type ReceiptPart = z.infer<typeof ReceiptPartSchema>;

/** Response of `receipt.store`: one URI per part, in the order sent. */
export const StoredReceiptUrisSchema = z.object({
  receiptUris: z.array(ReceiptUriSchema).min(1),
});

/** Response of `receipt.read` and `receipt.thumbnail`. */
export const StoredReceiptBytesSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  mediaType: z.string().min(1),
  byteLength: z.int().min(1),
  dataBase64: z.string().min(1),
});

export type StoredReceiptBytes = z.infer<typeof StoredReceiptBytesSchema>;

/** The hash a receipt URI names. Call it only with a URI that matches {@link RECEIPT_URI_PATTERN}. */
export function receiptSha256(receiptUri: string): string {
  return receiptUri.slice(receiptUri.lastIndexOf('/') + 1);
}
