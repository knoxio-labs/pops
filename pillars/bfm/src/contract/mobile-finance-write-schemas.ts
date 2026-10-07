/**
 * Wire shapes for the `/mobile/finance` write, history and attachment routes.
 *
 * Money is integer minor units of the account's currency, as on every other
 * mobile finance shape. Strings finance owns the vocabulary of (`type`,
 * `action`, `actorKind`, `outcome`) stay open strings on a response, so a
 * value finance adds later decodes on a build that is already on a phone.
 */
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { MobileReceiptPartSchema } from './receipt.js';
import { TransactionDateSchema } from './transaction.js';

/** The `pops://` URI the receipt store issues for one stored file. */
export const MobileReceiptUriSchema = z
  .string()
  .regex(/^pops:\/\/purchases\/receipt\/[0-9a-f]{64}$/u, 'expected a receipt URI');

/** How many stored files one attach call may name; the receipt store's own ceiling. */
export const MOBILE_ATTACH_MAX_RECEIPT_URIS = 100;

/**
 * A new transaction. Finance decides which fields the caller may set: a guest
 * who sends `tags`, `entityId` or `entityName` is answered `400`.
 */
export const MobileCreateTransactionBodySchema = z.strictObject({
  accountId: z.string().min(1),
  description: z.string().min(1),
  /** Signed, in the account's currency: money out is negative. */
  amountMinorUnits: z.int(),
  date: TransactionDateSchema,
  /** Finance's transaction type. Finance refuses one it does not know. */
  type: z.string().min(1),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export type MobileCreateTransactionBody = z.infer<typeof MobileCreateTransactionBodySchema>;

/** The fields to change. An absent field is left as it is. */
export const MobileUpdateTransactionBodySchema = z.strictObject({
  accountId: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  /** Signed, in the currency of the account the transaction will sit on. */
  amountMinorUnits: z.int().optional(),
  date: TransactionDateSchema.optional(),
  type: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export type MobileUpdateTransactionBody = z.infer<typeof MobileUpdateTransactionBodySchema>;

/** A transaction as it stood at one moment. */
export const MobileTransactionHistoryFieldsSchema = z.object({
  accountId: z.string(),
  date: z.string(),
  amountMinorUnits: z.int(),
  /** The currency of `accountId`, which a move between accounts can change. */
  currency: z.string(),
  description: z.string(),
  type: z.string(),
  notes: z.string().nullable(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

export type MobileTransactionHistoryFields = z.infer<typeof MobileTransactionHistoryFieldsSchema>;

/** One recorded change to a transaction. */
export const MobileTransactionHistoryEventSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  /** The account the transaction sat on once the change had been applied. */
  accountId: z.string(),
  /** `create`, `update`, `delete` or `restore` today. */
  action: z.string(),
  /** `operator`, `guest` or `service` today. */
  actorKind: z.string(),
  actorEmail: z.string().nullable(),
  /** ISO-8601 timestamp of the change. */
  at: z.string(),
  /** Null for a create and a restore. */
  before: MobileTransactionHistoryFieldsSchema.nullable(),
  /** Null for a delete. */
  after: MobileTransactionHistoryFieldsSchema.nullable(),
  /** Names of the fields that differ between `before` and `after`. */
  changed: z.array(z.string()),
});

export type MobileTransactionHistoryEvent = z.infer<typeof MobileTransactionHistoryEventSchema>;

/** Every recorded change to one transaction, newest first. */
export const MobileTransactionHistorySchema = z.object({
  data: z.array(MobileTransactionHistoryEventSchema),
});

export type MobileTransactionHistory = z.infer<typeof MobileTransactionHistorySchema>;

/** One page of an account's changes, newest first. `nextCursor` is null on the last page. */
export const MobileAccountHistoryPageSchema = z.object({
  data: z.array(MobileTransactionHistoryEventSchema),
  nextCursor: z.string().nullable(),
});

export type MobileAccountHistoryPage = z.infer<typeof MobileAccountHistoryPageSchema>;

/** A receipt to read before the transaction it belongs to exists. */
export const MobileFinanceReceiptExtractBodySchema = z.strictObject({
  /** The account the new transaction will sit on. */
  accountId: z.string().min(1),
  parts: z.array(MobileReceiptPartSchema).min(1),
});

export type MobileFinanceReceiptExtractBody = z.infer<typeof MobileFinanceReceiptExtractBodySchema>;

/** What a read receipt proposes for a new transaction. The person reviews it before saving. */
export const MobileReceiptSuggestionSchema = z.object({
  date: TransactionDateSchema,
  /** The merchant as printed, or null when the receipt names none. */
  description: z.string().nullable(),
  /** The receipt's total as money out, in minor units of `currency`. */
  amountMinorUnits: z.int(),
  /** The currency the receipt is in, which may not be the account's. */
  currency: z.string(),
  /** True when `currency` is not the account's, so the amount needs converting by hand. */
  currencyMismatch: z.boolean(),
});

/**
 * What became of the receipt. The files are stored on every outcome, and
 * `receiptUris` is what the attach route takes once the transaction exists.
 */
export const MobileFinanceReceiptExtractSchema = z.object({
  /**
   * `suggested` carries a suggestion. `unreadable`, `unavailable` and
   * `already-a-purchase` carry none, and so does any outcome added later.
   */
  outcome: z.string(),
  receiptUris: z.array(z.string()),
  suggestion: MobileReceiptSuggestionSchema.nullable(),
});

export type MobileFinanceReceiptExtract = z.infer<typeof MobileFinanceReceiptExtractSchema>;

/**
 * Files to attach: new ones to store, or ones the receipt store already
 * holds. Exactly one of the two.
 */
export const MobileAttachToTransactionBodySchema = z
  .strictObject({
    parts: z.array(MobileReceiptPartSchema).min(1).optional(),
    receiptUris: z
      .array(MobileReceiptUriSchema)
      .min(1)
      .max(MOBILE_ATTACH_MAX_RECEIPT_URIS)
      .optional(),
  })
  .refine((body) => (body.parts === undefined) !== (body.receiptUris === undefined), {
    message: 'Send exactly one of parts and receiptUris',
  });

export type MobileAttachToTransactionBody = z.infer<typeof MobileAttachToTransactionBodySchema>;

/** One file attached to a transaction. Its bytes are read by id. */
export const MobileTransactionAttachmentSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  mediaType: z.string(),
  /** Order within the transaction, ascending. */
  position: z.int(),
  createdAt: z.string(),
  /** Email of whoever attached it, or null when that caller carried no identity. */
  createdBy: z.string().nullable(),
});

export type MobileTransactionAttachment = z.infer<typeof MobileTransactionAttachmentSchema>;

/** A transaction's attached files, in order. */
export const MobileTransactionAttachmentsSchema = z.object({
  data: z.array(MobileTransactionAttachmentSchema),
});

export type MobileTransactionAttachments = z.infer<typeof MobileTransactionAttachmentsSchema>;

/**
 * A `400` on a finance write: bfm's own refusal of a malformed request, or
 * finance's refusal of one it validated, relayed with finance's code.
 */
export const MobileFinanceRequestErrorSchema = ErrorBodySchema;

export type MobileFinanceRequestError = z.infer<typeof MobileFinanceRequestErrorSchema>;

/**
 * Finance let the caller see the account and refused the write: the account
 * is shared with them to view only. Not a credential problem, so the app
 * keeps the session and stops offering the edit.
 */
export const MobileFinanceForbiddenErrorSchema = ErrorBodySchema.extend({
  code: z.literal('finance.resource.forbidden'),
});

export type MobileFinanceForbiddenError = z.infer<typeof MobileFinanceForbiddenErrorSchema>;
