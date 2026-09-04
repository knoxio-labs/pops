/**
 * Currency CRUD against finance's SQLite via drizzle (POPS-2802).
 *
 * Follows the standard service pattern: db-arg services, typed domain
 * errors, no HTTP concerns. Unlike most finance tables, `code` (not a
 * generated UUID) is the primary key — a currency's identity is its code.
 */
import { asc, eq, sql } from 'drizzle-orm';

import {
  CurrencyConflictError,
  CurrencyDecimalsInUseError,
  CurrencyInUseError,
  CurrencyNotFoundError,
} from '../errors.js';
import { currencies } from '../schema.js';
import { isCurrencyCodeConflict } from './currency-conflict.js';

import type { CurrencyKind } from '../../contract/currency-kind.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape. */
export type CurrencyRow = typeof currencies.$inferSelect;

/** Fields accepted on create. `code` is the primary key and immutable thereafter. */
export interface CreateCurrencyInput {
  code: string;
  name: string;
  symbol?: string | null;
  decimals: number;
  kind: CurrencyKind;
}

/** Same shape as create — all fields optional for PATCH semantics. `code` is never patchable. */
export interface UpdateCurrencyInput {
  name?: string;
  symbol?: string | null;
  decimals?: number;
  kind?: CurrencyKind;
}

/** List every currency, ordered by code. */
export function listCurrencies(db: FinanceDb): CurrencyRow[] {
  return db.select().from(currencies).orderBy(asc(currencies.code)).all();
}

/** Get a single currency by code. Throws `CurrencyNotFoundError` if missing. */
export function getCurrency(db: FinanceDb, code: string): CurrencyRow {
  const row = db.select().from(currencies).where(eq(currencies.code, code)).get();
  if (!row) throw new CurrencyNotFoundError(code);
  return row;
}

/**
 * Create a new currency. Throws `CurrencyConflictError` if `code` is already
 * taken — the PRIMARY KEY is the single source of truth for this, mapped
 * from the SQLite constraint violation rather than pre-checked, since a
 * currency code is short-lived, low-cardinality data where the race is not
 * worth a read-then-write.
 */
export function createCurrency(db: FinanceDb, input: CreateCurrencyInput): CurrencyRow {
  try {
    db.insert(currencies)
      .values({
        code: input.code,
        name: input.name,
        symbol: input.symbol ?? null,
        decimals: input.decimals,
        kind: input.kind,
      })
      .run();
  } catch (err) {
    if (isCurrencyCodeConflict(err)) throw new CurrencyConflictError(input.code);
    throw err;
  }
  return getCurrency(db, input.code);
}

/**
 * Patch a currency's `name`, `symbol`, `kind` and/or `decimals`. Throws
 * `CurrencyNotFoundError` if missing, or `CurrencyConflictError` — unreachable
 * today since `code` is immutable and every other field is unconstrained, kept
 * only for symmetry with `createCurrency`'s mapping.
 *
 * Changing `decimals` while {@link isCurrencyInUse} is true throws
 * `CurrencyDecimalsInUseError`: reinterpreting the minor-unit count would
 * silently change how every balance already stored in this currency renders.
 * Only `decimals` is guarded — name, symbol and kind remain editable on a
 * currency already referenced by an account.
 */
export function updateCurrency(
  db: FinanceDb,
  code: string,
  input: UpdateCurrencyInput
): CurrencyRow {
  getCurrency(db, code);
  if (input.decimals !== undefined && isCurrencyInUse(db, code)) {
    throw new CurrencyDecimalsInUseError(code);
  }

  const updates: Partial<typeof currencies.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.symbol !== undefined) updates.symbol = input.symbol ?? null;
  if (input.decimals !== undefined) updates.decimals = input.decimals;
  if (input.kind !== undefined) updates.kind = input.kind;

  if (Object.keys(updates).length > 0) {
    try {
      db.update(currencies).set(updates).where(eq(currencies.code, code)).run();
    } catch (err) {
      if (isCurrencyCodeConflict(err)) throw new CurrencyConflictError(code);
      throw err;
    }
  }

  return getCurrency(db, code);
}

/**
 * Whether any other table currently references `code` through a `currency`
 * column. Scans `sqlite_master` for user tables carrying a column literally
 * named `currency` and checks each for a matching row, rather than naming a
 * specific table — no table has one yet (`accounts.currency` lands in
 * POPS-2767), so this returns `false` today and starts refusing in-use
 * deletes automatically the moment that column exists, with no change
 * needed here.
 */
export function isCurrencyInUse(db: FinanceDb, code: string): boolean {
  const tables = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'currencies'`
  );

  for (const { name } of tables) {
    const quotedTable = sql.raw(`"${name.replace(/"/g, '""')}"`);
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${quotedTable})`);
    if (!columns.some((column) => column.name === 'currency')) continue;

    const match = db.get<{ found: number }>(
      sql`SELECT 1 AS found FROM ${quotedTable} WHERE "currency" = ${code} LIMIT 1`
    );
    if (match) return true;
  }
  return false;
}

/**
 * Delete a currency. Throws `CurrencyNotFoundError` if missing, or
 * `CurrencyInUseError` if {@link isCurrencyInUse} finds a referencing row —
 * currently unreachable (see {@link isCurrencyInUse}), kept so the refusal
 * path exists ahead of POPS-2767.
 */
export function deleteCurrency(db: FinanceDb, code: string): void {
  getCurrency(db, code);
  if (isCurrencyInUse(db, code)) throw new CurrencyInUseError(code);
  const result = db.delete(currencies).where(eq(currencies.code, code)).run();
  if (result.changes === 0) throw new CurrencyNotFoundError(code);
}
