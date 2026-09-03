import { parseStoredTags } from '../../db/tag-facets.js';
/**
 * Wire mapper for the transactions domain. The zod schemas now live in
 * the REST contract (`src/contract/rest-transactions.ts`); this file
 * keeps only the row → response projection and its TS shape.
 *
 * `amount` is the ONE place a transaction's money value crosses from the
 * pillar's internal integer-cents representation (#3665, CF041) to the
 * decimal-dollar wire contract, in both directions: `toTransaction` converts
 * a row's `amountCents` to dollars for the response, and
 * `toCreateTransactionInput`/`toUpdateTransactionInput` convert a request
 * body's dollar `amount` back to cents for the persistence layer.
 */
import { centsToDollars, dollarsToCents } from '../../money.js';
import { foreignChargeFields, type ForeignChargeFields } from './transaction-foreign-charge.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type {
  CreateTransactionInput,
  TransactionRow,
  UpdateTransactionInput,
} from '../../db/index.js';

/** API response shape (camelCase). */
export interface Transaction extends ForeignChargeFields {
  id: string;
  description: string;
  account: string;
  accountId: string;
  amount: number;
  date: string;
  type: TransactionType;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  lastEditedTime: string;
}

/**
 * Full-row snapshot returned by `delete` and accepted by `restore`
 * (`TransactionSnapshotSchema` in the REST contract) — dollars `amount`,
 * same as every other wire shape.
 */
export interface TransactionSnapshot extends ForeignChargeFields {
  id: string;
  notionId: string | null;
  description: string;
  account: string;
  accountId: string;
  amount: number;
  date: string;
  type: TransactionType;
  tags: string;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  checksum: string | null;
  rawRow: string | null;
  lastEditedTime: string;
  matchType: TransactionRow['matchType'];
  matchRuleId: string | null;
  matchConfidence: number | null;
}

/** Wire body accepted by `POST /transactions` (dollars `amount`). */
export interface CreateTransactionBody {
  description: string;
  account: string;
  amount: number;
  date: string;
  type: TransactionType;
  tags?: string[] | undefined;
  entityId?: string | null | undefined;
  entityName?: string | null | undefined;
  location?: string | null | undefined;
  country?: string | null | undefined;
  relatedTransactionId?: string | null | undefined;
  notes?: string | null | undefined;
  rawRow?: string | undefined;
  checksum?: string | undefined;
}

/** Wire body accepted by `PATCH /transactions/:id` (dollars `amount`). */
export interface UpdateTransactionBody {
  description?: string;
  account?: string;
  amount?: number;
  date?: string;
  type?: TransactionType;
  tags?: string[];
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  country?: string | null;
  relatedTransactionId?: string | null;
  notes?: string | null;
}

/** Map a SQLite row to the API response shape. */
export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    description: row.description,
    account: row.account,
    accountId: row.accountId,
    amount: centsToDollars(row.amountCents),
    date: row.date,
    type: row.type,
    tags: parseStoredTags(row.tags),
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    country: row.country,
    relatedTransactionId: row.relatedTransactionId,
    notes: row.notes,
    ...foreignChargeFields(row),
    lastEditedTime: row.lastEditedTime,
  };
}

/** Map a SQLite row to the delete/restore snapshot wire shape. */
export function toTransactionSnapshot(row: TransactionRow): TransactionSnapshot {
  return {
    id: row.id,
    notionId: row.notionId,
    description: row.description,
    account: row.account,
    accountId: row.accountId,
    amount: centsToDollars(row.amountCents),
    date: row.date,
    type: row.type,
    tags: row.tags,
    entityId: row.entityId,
    entityName: row.entityName,
    location: row.location,
    country: row.country,
    relatedTransactionId: row.relatedTransactionId,
    notes: row.notes,
    ...foreignChargeFields(row),
    checksum: row.checksum,
    rawRow: row.rawRow,
    lastEditedTime: row.lastEditedTime,
    matchType: row.matchType,
    matchRuleId: row.matchRuleId,
    matchConfidence: row.matchConfidence,
  };
}

/** Map a restore request's snapshot back to the persisted row shape. */
export function fromTransactionSnapshot(snapshot: TransactionSnapshot): TransactionRow {
  return {
    id: snapshot.id,
    notionId: snapshot.notionId,
    description: snapshot.description,
    account: snapshot.account,
    accountId: snapshot.accountId,
    amountCents: dollarsToCents(snapshot.amount),
    date: snapshot.date,
    type: snapshot.type,
    tags: snapshot.tags,
    entityId: snapshot.entityId,
    entityName: snapshot.entityName,
    location: snapshot.location,
    country: snapshot.country,
    relatedTransactionId: snapshot.relatedTransactionId,
    notes: snapshot.notes,
    ...foreignChargeFields(snapshot),
    checksum: snapshot.checksum,
    rawRow: snapshot.rawRow,
    lastEditedTime: snapshot.lastEditedTime,
    matchType: snapshot.matchType,
    matchRuleId: snapshot.matchRuleId,
    matchConfidence: snapshot.matchConfidence,
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateTransactionInput(body: CreateTransactionBody): CreateTransactionInput {
  return {
    description: body.description,
    account: body.account,
    amountCents: dollarsToCents(body.amount),
    date: body.date,
    type: body.type,
    tags: body.tags,
    entityId: body.entityId,
    entityName: body.entityName,
    location: body.location,
    country: body.country,
    relatedTransactionId: body.relatedTransactionId,
    notes: body.notes,
    rawRow: body.rawRow,
    checksum: body.checksum,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateTransactionInput(body: UpdateTransactionBody): UpdateTransactionInput {
  return {
    description: body.description,
    account: body.account,
    amountCents: body.amount === undefined ? undefined : dollarsToCents(body.amount),
    date: body.date,
    type: body.type,
    tags: body.tags,
    entityId: body.entityId,
    entityName: body.entityName,
    location: body.location,
    country: body.country,
    relatedTransactionId: body.relatedTransactionId,
    notes: body.notes,
  };
}
