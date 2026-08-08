/**
 * Shared helpers for the finance schema service layer.
 *
 * Only `FinanceDb` is re-exported from the package barrel so callers can type
 * the handle they pass in; any additional helpers added here stay internal
 * to `src/services/*.ts`.
 */
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { transactions } from '../schema.js';

/** A drizzle handle — either the top-level db or a transaction. */
export type FinanceDb = BetterSQLite3Database<Record<string, unknown>>;

/**
 * Raw drizzle transaction row. Here rather than beside either transactions
 * service so the read half and the write half can both name it without
 * importing each other.
 */
export type TransactionRow = typeof transactions.$inferSelect;
