/**
 * Transaction service — CRUD operations against SQLite via Drizzle ORM.
 * SQLite is the source of truth. All operations are local.
 */
import crypto from "crypto";
import { count, desc, eq, like, gte, lte, and, sql, type SQL, type InferSelectModel } from "drizzle-orm";
import { getDrizzle } from "../../../db.js";
import { transactions } from "../../../db/schema/transactions.js";
import { NotFoundError } from "../../../shared/errors.js";
import type {
  TransactionRow,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionFilters,
} from "./types.js";

/** Map Drizzle's camelCase result to the snake_case TransactionRow interface. */
type DrizzleRow = InferSelectModel<typeof transactions>;
function toDbRow(row: DrizzleRow): TransactionRow {
  return {
    id: row.id,
    notion_id: row.notionId,
    description: row.description,
    account: row.account,
    amount: row.amount,
    date: row.date,
    type: row.type,
    tags: row.tags,
    entity_id: row.entityId,
    entity_name: row.entityName,
    location: row.location,
    country: row.country,
    related_transaction_id: row.relatedTransactionId,
    notes: row.notes,
    checksum: row.checksum,
    raw_row: row.rawRow,
    last_edited_time: row.lastEditedTime,
  };
}

/** Count + rows for a paginated list. */
export interface TransactionListResult {
  rows: TransactionRow[];
  total: number;
}

/** List transactions with optional filters. */
export function listTransactions(
  filters: TransactionFilters,
  limit: number,
  offset: number
): TransactionListResult {
  const db = getDrizzle();
  const conditions: SQL[] = [];

  if (filters.search) {
    conditions.push(like(transactions.description, `%${filters.search}%`));
  }
  if (filters.account) {
    conditions.push(eq(transactions.account, filters.account));
  }
  if (filters.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters.tag) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE json_each.value = ${filters.tag})`
    );
  }
  if (filters.entityId) {
    conditions.push(eq(transactions.entityId, filters.entityId));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toDbRow);

  const [countRow] = db
    .select({ total: count() })
    .from(transactions)
    .where(where)
    .all();

  return { rows, total: countRow.total };
}

/** Get a single transaction by id. Throws NotFoundError if missing. */
export function getTransaction(id: string): TransactionRow {
  const db = getDrizzle();
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();

  if (!row) throw new NotFoundError("Transaction", id);
  return toDbRow(row);
}

/**
 * Create a new transaction. Returns the created row.
 * Generates a local UUID and inserts directly into SQLite.
 */
export function createTransaction(input: CreateTransactionInput): TransactionRow {
  const db = getDrizzle();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(transactions)
    .values({
      id,
      description: input.description,
      account: input.account,
      amount: input.amount,
      date: input.date,
      type: input.type || "",
      tags: JSON.stringify(input.tags ?? []),
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      relatedTransactionId: input.relatedTransactionId ?? null,
      notes: input.notes ?? null,
      checksum: input.checksum ?? null,
      rawRow: input.rawRow ?? null,
      lastEditedTime: now,
    })
    .run();

  return getTransaction(id);
}

/**
 * Update an existing transaction. Returns the updated row.
 * Updates directly in SQLite.
 */
export function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): TransactionRow {
  // Verify it exists first
  getTransaction(id);

  const updates: Partial<DrizzleRow> = {};

  if (input.description !== undefined) {
    updates.description = input.description;
  }
  if (input.account !== undefined) {
    updates.account = input.account;
  }
  if (input.amount !== undefined) {
    updates.amount = input.amount;
  }
  if (input.date !== undefined) {
    updates.date = input.date;
  }
  if (input.type !== undefined) {
    updates.type = input.type ?? "";
  }
  if (input.tags !== undefined) {
    updates.tags = JSON.stringify(input.tags);
  }
  if (input.entityId !== undefined) {
    updates.entityId = input.entityId ?? null;
  }
  if (input.entityName !== undefined) {
    updates.entityName = input.entityName ?? null;
  }
  if (input.location !== undefined) {
    updates.location = input.location ?? null;
  }
  if (input.country !== undefined) {
    updates.country = input.country ?? null;
  }
  if (input.relatedTransactionId !== undefined) {
    updates.relatedTransactionId = input.relatedTransactionId ?? null;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes ?? null;
  }

  if (Object.keys(updates).length > 0) {
    updates.lastEditedTime = new Date().toISOString();

    getDrizzle().update(transactions).set(updates).where(eq(transactions.id, id)).run();
  }

  return getTransaction(id);
}

/**
 * Delete a transaction by ID. Throws NotFoundError if missing.
 * Deletes directly from SQLite.
 */
export function deleteTransaction(id: string): void {
  // Verify it exists first
  getTransaction(id);

  const result = getDrizzle()
    .delete(transactions)
    .where(eq(transactions.id, id))
    .run();
  if (result.changes === 0) throw new NotFoundError("Transaction", id);
}
