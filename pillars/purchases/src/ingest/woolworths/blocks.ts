/**
 * The shape of the extension's export file.
 *
 * Every field here was read off a live `ActivityDetails` response rather
 * than guessed. The schemas are deliberately permissive — `passthrough` on
 * the blocks, `unknown` for the union members nothing reads — because the
 * extension's job is to be a faithful copy of whatever the site returns,
 * and a strict schema would reject a whole year's export over one new field
 * in a block this pillar never looks at.
 *
 * What is NOT permissive is the handful of fields the mapping depends on.
 * Those are required, and a receipt missing one is reported rather than
 * ingested with a hole in it.
 */
import { z } from 'zod';

/** `{ prefixChar, description, amount }` — the only three fields a row has. */
export const ReceiptLineSchema = z
  .object({
    __typename: z.string().optional(),
    prefixChar: z.string().nullish(),
    description: z.string().nullish(),
    amount: z.string().nullish(),
  })
  .passthrough();

const BlockSchema = z.object({ __typename: z.string() }).passthrough();

export const ReceiptPageSchema = z
  .object({
    details: z.array(BlockSchema),
    download: z.object({ url: z.string().nullish(), filename: z.string().nullish() }).nullish(),
  })
  .passthrough();

export const ExportedReceiptSchema = z.object({
  activityDetailsId: z.string(),
  listRow: z.unknown().nullish(),
  receipt: ReceiptPageSchema,
});

export const WoolworthsExportSchema = z.object({
  source: z.literal('woolworths-everyday-rewards'),
  formatVersion: z.literal(1),
  capturedAt: z.string(),
  receipts: z.array(ExportedReceiptSchema),
});

export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;
export type ReceiptPage = z.infer<typeof ReceiptPageSchema>;
export type WoolworthsExport = z.infer<typeof WoolworthsExportSchema>;

const HeaderSchema = z
  .object({
    title: z.string().nullish(),
    content: z.string().nullish(),
    division: z.string().nullish(),
    storeNo: z.string().nullish(),
  })
  .passthrough();

const ItemsSchema = z.object({ items: z.array(ReceiptLineSchema) }).passthrough();

const SummarySchema = z
  .object({
    discounts: z.array(ReceiptLineSchema).nullish(),
    summaryItems: z.array(ReceiptLineSchema).nullish(),
    gst: ReceiptLineSchema.nullish(),
    receiptTotal: ReceiptLineSchema.nullish(),
  })
  .passthrough();

const PaymentSchema = z
  .object({
    description: z.string().nullish(),
    amount: z.string().nullish(),
    details: z.array(z.object({ text: z.string().nullish() }).passthrough()).nullish(),
  })
  .passthrough();

const PaymentsSchema = z.object({ payments: z.array(PaymentSchema) }).passthrough();

const FooterSchema = z
  .object({
    transactionDetails: z.string().nullish(),
    abnAndStore: z.string().nullish(),
  })
  .passthrough();

export type ReceiptHeader = z.infer<typeof HeaderSchema>;
export type ReceiptSummary = z.infer<typeof SummarySchema>;
export type ReceiptPayment = z.infer<typeof PaymentSchema>;
export type ReceiptFooter = z.infer<typeof FooterSchema>;

/**
 * The blocks this pillar reads, keyed by GraphQL `__typename`.
 *
 * `details` is a heterogeneous union in source order, and the order is not
 * a contract — so blocks are found by type, never by index. The two
 * `ReceiptDetailsCoupon` entries that also appear are ignored: they are
 * marketing, and one of them carries a barcode that would look like a
 * transaction reference without being one.
 */
function findBlock<T extends z.ZodTypeAny>(
  page: ReceiptPage,
  typename: string,
  schema: T
): z.infer<T> | null {
  const block = page.details.find((detail) => detail.__typename === typename);
  if (block === undefined) return null;
  const parsed = schema.safeParse(block);
  return parsed.success ? parsed.data : null;
}

export interface ReceiptBlocks {
  readonly header: ReceiptHeader | null;
  readonly lines: readonly ReceiptLine[] | null;
  readonly summary: ReceiptSummary | null;
  readonly payments: readonly ReceiptPayment[] | null;
  readonly footer: ReceiptFooter | null;
}

export function readBlocks(page: ReceiptPage): ReceiptBlocks {
  return {
    header: findBlock(page, 'ReceiptDetailsHeader', HeaderSchema),
    lines: findBlock(page, 'ReceiptDetailsItems', ItemsSchema)?.items ?? null,
    summary: findBlock(page, 'ReceiptDetailsSummary', SummarySchema),
    payments: findBlock(page, 'ReceiptDetailsPayments', PaymentsSchema)?.payments ?? null,
    footer: findBlock(page, 'ReceiptDetailsFooter', FooterSchema),
  };
}
