/**
 * The slice of the purchases receipt wire format that finance sends, reads
 * and passes through on its attachment routes.
 *
 * Restated here instead of imported: `@pops/purchases` depends on the
 * purchases backend's whole runtime graph, and finance needs six operations
 * of it. `scripts/ci/check-cross-pillar-expectations.mjs` pins those six to
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

/**
 * Response of `receipt.extract`, narrowed to what a ledger entry is suggested
 * from. The producer's draft also carries line items, tax and a merchant
 * match; finance records the full amount only and reads none of them.
 */
export const ReceiptReadingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('draft'),
    receiptUris: z.array(ReceiptUriSchema).min(1),
    draft: z.object({
      /** The instant of the purchase, ISO-8601 with a timezone. */
      orderedAt: z.iso.datetime({ offset: true }),
      /** Minutes ahead of UTC at the shop, when the reading resolved one. */
      orderedAtOffsetMinutes: z.int().nullish(),
      currency: z.string().min(1),
      totalCents: z.int(),
      merchantEntityName: z.string().nullish(),
    }),
  }),
  z.object({
    kind: z.literal('unreadable'),
    receiptUris: z.array(ReceiptUriSchema).min(1),
  }),
]);

export type ReceiptReading = z.infer<typeof ReceiptReadingSchema>;

/** The hash a receipt URI names. Call it only with a URI that matches {@link RECEIPT_URI_PATTERN}. */
export function receiptSha256(receiptUri: string): string {
  return receiptUri.slice(receiptUri.lastIndexOf('/') + 1);
}
