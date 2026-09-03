/**
 * Account CRUD against finance's SQLite via drizzle (POPS-2767).
 *
 * Follows the standard service pattern: db-arg services, typed domain
 * errors, no HTTP concerns. "Delete" is a soft archive (`archivedAt`) rather
 * than a row delete — an account is referenced by every transaction it ever
 * carried (`transactions.account_id`), so removing the row outright would
 * either cascade-delete transaction history or leave it dangling. Archiving
 * hides an account from active views without touching what already points
 * at it, and is reversible by patching `archivedAt` back to `null`.
 */
import { asc, eq } from 'drizzle-orm';

import {
  AccountCashCurrencyConflictError,
  AccountNameConflictError,
  AccountNotFoundError,
} from '../errors.js';
import { accounts } from '../schema.js';
import { isAccountCashCurrencyConflict, isAccountNameConflict } from './account-conflict.js';

import type { AccountKind } from '../../contract/account-kind.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape. */
export type AccountRow = typeof accounts.$inferSelect;

/** Fields accepted on create. */
export interface CreateAccountInput {
  name: string;
  institutionId?: string | null;
  kind: AccountKind;
  currency: string;
  displayOrder?: number;
  entityId?: string | null;
}

/** Same shape as create — all fields optional for PATCH semantics, plus `archivedAt`. */
export interface UpdateAccountInput {
  name?: string;
  institutionId?: string | null;
  kind?: AccountKind;
  currency?: string;
  displayOrder?: number;
  entityId?: string | null;
  archivedAt?: string | null;
}

function translateWriteConflict(err: unknown, name: string, currency: string): never {
  if (isAccountNameConflict(err)) throw new AccountNameConflictError(name);
  if (isAccountCashCurrencyConflict(err)) throw new AccountCashCurrencyConflictError(currency);
  throw err;
}

/** List every account, ordered by `displayOrder` then name. */
export function listAccounts(db: FinanceDb): AccountRow[] {
  return db.select().from(accounts).orderBy(asc(accounts.displayOrder), asc(accounts.name)).all();
}

/** Get a single account by id. Throws `AccountNotFoundError` if missing. */
export function getAccount(db: FinanceDb, id: string): AccountRow {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new AccountNotFoundError(id);
  return row;
}

/**
 * Create a new account. Throws `AccountNameConflictError` for a
 * case-insensitive duplicate name, or `AccountCashCurrencyConflictError` for
 * a second `cash` account in a currency that already has one — both mapped
 * from the SQLite constraint violation rather than pre-checked, since an
 * account is short-lived, low-cardinality data where the race is not worth a
 * read-then-write.
 */
export function createAccount(db: FinanceDb, input: CreateAccountInput): AccountRow {
  const id = crypto.randomUUID();
  try {
    db.insert(accounts)
      .values({
        id,
        name: input.name,
        institutionId: input.institutionId ?? null,
        kind: input.kind,
        currency: input.currency,
        displayOrder: input.displayOrder ?? 0,
        entityId: input.entityId ?? null,
      })
      .run();
  } catch (err) {
    translateWriteConflict(err, input.name, input.currency);
  }
  return getAccount(db, id);
}

function buildAccountUpdates(input: UpdateAccountInput): Partial<typeof accounts.$inferInsert> {
  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.institutionId !== undefined) updates.institutionId = input.institutionId ?? null;
  if (input.kind !== undefined) updates.kind = input.kind;
  if (input.currency !== undefined) updates.currency = input.currency;
  if (input.displayOrder !== undefined) updates.displayOrder = input.displayOrder;
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.archivedAt !== undefined) updates.archivedAt = input.archivedAt ?? null;
  return updates;
}

/**
 * Patch an account. Throws `AccountNotFoundError` if missing. No-op writes
 * (empty `input`) still re-read the row but skip the UPDATE.
 *
 * A patch that would collide with an existing account's name, or move a
 * second account into `(cash, currency)`, maps to the same conflict errors
 * `createAccount` throws, using the post-patch values.
 */
export function updateAccount(db: FinanceDb, id: string, input: UpdateAccountInput): AccountRow {
  const current = getAccount(db, id);

  const updates = buildAccountUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    const effectiveName = input.name ?? current.name;
    const effectiveCurrency = input.currency ?? current.currency;

    try {
      db.update(accounts).set(updates).where(eq(accounts.id, id)).run();
    } catch (err) {
      translateWriteConflict(err, effectiveName, effectiveCurrency);
    }
  }

  return getAccount(db, id);
}

/**
 * Archive an account (`archivedAt = now`). Throws `AccountNotFoundError` if
 * missing. Idempotent — archiving an already-archived account leaves its
 * `archivedAt` timestamp untouched rather than bumping it.
 */
export function archiveAccount(db: FinanceDb, id: string): AccountRow {
  const current = getAccount(db, id);
  if (current.archivedAt !== null) return current;

  db.update(accounts)
    .set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(accounts.id, id))
    .run();
  return getAccount(db, id);
}
