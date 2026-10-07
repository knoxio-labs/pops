/**
 * The finance shapes behind the mobile write, history and attachment routes,
 * and the mapping from each to the shape bfm publishes.
 *
 * Validated for the reason `wire.ts` gives: the router type a caller declares
 * is an assertion about finance, and these schemas are the check.
 */
import { z } from 'zod';

import { FALLBACK_MOBILE_CURRENCY } from '../../contract/rest-schemas.js';
import { currencyFractionDigits, FinanceTransactionDetailSchema, toMinorUnits } from './wire.js';

import type {
  MobileFinanceReceiptExtract,
  MobileTransactionAttachment,
  MobileTransactionHistoryEvent,
  MobileTransactionHistoryFields,
} from '../../contract/mobile-finance-write-schemas.js';

/** Response of finance's `transactions.create` and `transactions.update`. */
export const FinanceTransactionWriteResponseSchema = z.object({
  data: FinanceTransactionDetailSchema,
});

const FinanceHistoryFieldsSchema = z.object({
  accountId: z.string(),
  date: z.string(),
  amount: z.number(),
  description: z.string(),
  type: z.string(),
  notes: z.string().nullable(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  tags: z.array(z.string()),
});

type FinanceHistoryFields = z.infer<typeof FinanceHistoryFieldsSchema>;

const FinanceHistoryEventSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  accountId: z.string(),
  action: z.string(),
  actorKind: z.string(),
  actorEmail: z.string().nullable(),
  at: z.string(),
  before: FinanceHistoryFieldsSchema.nullable(),
  after: FinanceHistoryFieldsSchema.nullable(),
  changed: z.array(z.string()),
});

export type FinanceHistoryEvent = z.infer<typeof FinanceHistoryEventSchema>;

export const FinanceTransactionHistoryResponseSchema = z.object({
  data: z.array(FinanceHistoryEventSchema),
});

export const FinanceAccountHistoryResponseSchema = z.object({
  data: z.array(FinanceHistoryEventSchema),
  pagination: z.object({ hasMore: z.boolean() }),
});

const FinanceAttachmentSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
  mediaType: z.string(),
  position: z.int(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});

export const FinanceAttachmentsResponseSchema = z.object({
  data: z.array(FinanceAttachmentSchema),
});

export const FinanceAttachmentBytesResponseSchema = z.object({
  data: z.object({
    sha256: z.string(),
    mediaType: z.string(),
    byteLength: z.int(),
    dataBase64: z.string(),
  }),
});

/**
 * `outcome` is read as an open string and `suggestion` as optional, so an
 * outcome finance adds later still reaches the phone with its stored files.
 */
export const FinanceReceiptExtractResponseSchema = z.object({
  data: z.object({
    outcome: z.string(),
    receiptUris: z.array(z.string()),
    suggestion: z
      .object({
        date: z.string(),
        description: z.string().nullable(),
        amountCents: z.int(),
        currency: z.string(),
        currencyMismatch: z.boolean(),
      })
      .optional(),
  }),
});

type FinanceReceiptExtract = z.infer<typeof FinanceReceiptExtractResponseSchema>['data'];

/**
 * Integer minor units of `currency` as the decimal amount finance takes.
 * The inverse of {@link toMinorUnits}.
 */
export function fromMinorUnits(amountMinorUnits: number, currency: string): number {
  return amountMinorUnits / 10 ** currencyFractionDigits(currency);
}

/** The accounts whose currency a page of history events needs. */
export function historyAccountIds(events: readonly FinanceHistoryEvent[]): string[] {
  return events.flatMap((event) =>
    [event.before, event.after].flatMap((fields) => (fields === null ? [] : [fields.accountId]))
  );
}

/** Finance names the amount field `amount`; the mobile shape calls it `amountMinorUnits`. */
function toMobileChangedField(field: string): string {
  return field === 'amount' ? 'amountMinorUnits' : field;
}

function toMobileHistoryFields(
  fields: FinanceHistoryFields,
  currencies: ReadonlyMap<string, string>
): MobileTransactionHistoryFields | null {
  const currency = currencies.get(fields.accountId) ?? FALLBACK_MOBILE_CURRENCY;
  const amountMinorUnits = toMinorUnits(fields.amount, currency);
  if (amountMinorUnits === null) return null;
  return {
    accountId: fields.accountId,
    date: fields.date,
    amountMinorUnits,
    currency,
    description: fields.description,
    type: fields.type,
    notes: fields.notes,
    entityId: fields.entityId,
    entityName: fields.entityName,
    tags: fields.tags,
  };
}

/**
 * Finance history events as the mobile ones, or `null` when an amount cannot
 * be represented in its account's currency.
 *
 * `currencies` maps each account an event names to its currency. An account
 * missing from it falls back to {@link FALLBACK_MOBILE_CURRENCY}, as a
 * transaction row does: an event can name an account the caller can no longer
 * read.
 */
export function toMobileHistoryEvents(
  events: readonly FinanceHistoryEvent[],
  currencies: ReadonlyMap<string, string>
): MobileTransactionHistoryEvent[] | null {
  const mapped: MobileTransactionHistoryEvent[] = [];
  for (const event of events) {
    const before = event.before === null ? null : toMobileHistoryFields(event.before, currencies);
    const after = event.after === null ? null : toMobileHistoryFields(event.after, currencies);
    if ((event.before !== null && before === null) || (event.after !== null && after === null)) {
      return null;
    }
    mapped.push({
      id: event.id,
      transactionId: event.transactionId,
      accountId: event.accountId,
      action: event.action,
      actorKind: event.actorKind,
      actorEmail: event.actorEmail,
      at: event.at,
      before,
      after,
      changed: event.changed.map(toMobileChangedField),
    });
  }
  return mapped;
}

/** Finance attachment rows as the mobile ones, without the store's own URI. */
export function toMobileAttachments(
  rows: z.infer<typeof FinanceAttachmentsResponseSchema>['data']
): MobileTransactionAttachment[] {
  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transactionId,
    mediaType: row.mediaType,
    position: row.position,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }));
}

/** Finance's receipt reading as the mobile one. A receipt total is already in minor units. */
export function toMobileReceiptExtract(read: FinanceReceiptExtract): MobileFinanceReceiptExtract {
  return {
    outcome: read.outcome,
    receiptUris: read.receiptUris,
    suggestion:
      read.suggestion === undefined
        ? null
        : {
            date: read.suggestion.date,
            description: read.suggestion.description,
            amountMinorUnits: read.suggestion.amountCents,
            currency: read.suggestion.currency,
            currencyMismatch: read.suggestion.currencyMismatch,
          },
  };
}
