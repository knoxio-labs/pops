/**
 * Zod shapes for the `transactions.*` sub-router — the wire bodies, the
 * snapshot, and the list query.
 *
 * Split from `rest-transactions.ts` (which keeps the routes) on the same
 * per-domain `*-schemas.ts` convention the corrections, tag-rules and imports
 * contracts already follow.
 */
import { z } from 'zod';

import { TRANSACTION_MATCH_TYPES } from '../db/index.js';
import { FX_CAPTURE_SOURCES } from './fx-capture.js';
import { TransactionTypeSchema } from './rest-corrections-schemas.js';
import { LimitQuery, NonEmptyString, OffsetQuery } from './rest-schemas.js';

/** Wire shape served by the transaction handlers. */
export const TransactionSchema = z.object({
  id: z.string(),
  description: z.string(),
  account: z.string(),
  accountId: z.string(),
  amount: z.number(),
  date: z.string(),
  type: TransactionTypeSchema,
  tags: z.array(z.string()),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  relatedTransactionId: z.string().nullable(),
  notes: z.string().nullable(),
  /** Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units. */
  foreignAmountMinor: z.number().int().nullable(),
  /** ISO-4217 alpha-3 of the charge abroad. */
  foreignCurrency: z.string().nullable(),
  /** The issuer's foreign-transaction fee in AUD cents — a fee, not a converted total. */
  fxFeeCents: z.number().int().nullable(),
  /**
   * Which capture path read this row's foreign charge, or null when no importer
   * declared one (POPS-2647). Null is not "domestic": it is "nobody looked".
   */
  fxCaptureSource: z.enum(FX_CAPTURE_SOURCES).nullable(),
  lastEditedTime: z.string(),
});

/**
 * Full SQLite row snapshot returned by `delete` and accepted by `restore`
 * — preserves the original id, dedup metadata (`checksum`, `rawRow`),
 * and `notionId` so an Undo restores everything a re-import would dedupe
 * against. `tags` is the raw JSON string here (not the parsed array).
 */
export const TransactionSnapshotSchema = z.object({
  id: z.string(),
  notionId: z.string().nullable(),
  description: z.string(),
  account: z.string(),
  accountId: z.string(),
  amount: z.number(),
  date: z.string(),
  type: TransactionTypeSchema,
  tags: z.string(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  relatedTransactionId: z.string().nullable(),
  notes: z.string().nullable(),
  /** Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units. */
  foreignAmountMinor: z.number().int().nullable(),
  /** ISO-4217 alpha-3 of the charge abroad. */
  foreignCurrency: z.string().nullable(),
  /** The issuer's foreign-transaction fee in AUD cents — a fee, not a converted total. */
  fxFeeCents: z.number().int().nullable(),
  /**
   * Which capture path read this row's foreign charge (POPS-2647). Carried on
   * the snapshot so an Undo restores the row's provenance too — a restore that
   * dropped it would turn a captured domestic row into an uncaptured one.
   */
  fxCaptureSource: z.enum(FX_CAPTURE_SOURCES).nullable(),
  checksum: z.string().nullable(),
  rawRow: z.string().nullable(),
  lastEditedTime: z.string(),
  matchType: z.enum(TRANSACTION_MATCH_TYPES).nullable(),
  matchRuleId: z.string().min(1).nullable(),
  matchConfidence: z.number().min(0).max(1).nullable(),
});

export const CreateTransactionBody = z.object({
  description: z.string().min(1, 'Description is required'),
  account: z.string().min(1, 'Account is required'),
  amount: z.number(),
  date: z.string().min(1, 'Date is required'),
  type: TransactionTypeSchema,
  tags: z.array(z.string()).optional().default([]),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  relatedTransactionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rawRow: z.string().optional(),
  checksum: z.string().optional(),
});

export const UpdateTransactionBody = z.object({
  description: z.string().min(1, 'Description cannot be empty').optional(),
  account: z.string().min(1, 'Account cannot be empty').optional(),
  amount: z.number().optional(),
  date: z.string().min(1, 'Date cannot be empty').optional(),
  type: TransactionTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  entityId: z.string().nullable().optional(),
  entityName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  relatedTransactionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const TransactionQuery = z.object({
  search: z.string().optional(),
  account: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tag: z.string().optional(),
  entityId: z.string().optional(),
  type: TransactionTypeSchema.optional(),
  limit: LimitQuery,
  offset: OffsetQuery,
  /**
   * Keyset anchor — the `date` of the last row the caller already has. Sent
   * with `beforeId`; the pair selects rows sorting strictly after that row
   * under the list's `date DESC, id DESC` order.
   *
   * Prefer this over `offset` for anything that pages a list which can change
   * underneath it: an insertion shifts every offset by one, so an infinite
   * scroll re-shows one row and never shows another. A keyset anchor names a
   * position in the data rather than a distance from the start, so it is
   * unaffected. `offset` stays for callers that jump to a page.
   *
   * The `.describe()` is not decoration — it is the only way this invariant
   * reaches the OpenAPI document, and the document is all a client author or a
   * generated SDK ever sees. A JSDoc comment here reaches neither.
   *
   * Both halves are validated rather than taken as free strings, because an
   * anchor is compared lexicographically and a bad one changes which rows come
   * back WITHOUT failing. An empty pair yields `date < ''`, which matches
   * nothing and reads to a paging caller as "you have reached the end"; a
   * `beforeDate` that is not a date sorts wherever its characters happen to
   * fall, silently returning everything or nothing. Neither is a failure the
   * caller can see, which is what makes rejecting them at the edge worth the
   * two lines.
   */
  beforeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'beforeDate must be a date-only YYYY-MM-DD value')
    .optional()
    .describe(
      'Keyset anchor: the `date` of the last row you already have, as `YYYY-MM-DD`. ' +
        'Must be sent together with `beforeId` — supplying one without the other is a 400, ' +
        'because a date alone cannot separate rows that share it. ' +
        'Returns rows sorting strictly after that row under `date DESC, id DESC`. ' +
        'Prefer this over `offset` when paging a list that can change underneath you.'
    ),
  /** Keyset anchor — the `id` of the last row the caller already has. Sent with `beforeDate`. */
  beforeId: NonEmptyString.optional().describe(
    'Keyset anchor: the `id` of the last row you already have. ' +
      'Must be sent together with `beforeDate` — supplying one without the other is a 400. ' +
      'This half is what separates rows sharing a date.'
  ),
});
