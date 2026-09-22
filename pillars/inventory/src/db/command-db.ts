import type { RunResult } from 'better-sqlite3';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

/** A synchronous drizzle handle: the database or a transaction (or savepoint) on it. */
export type CommandDb = BaseSQLiteDatabase<'sync', RunResult, Record<string, unknown>>;
