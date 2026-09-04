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
import { and, asc, count, eq, inArray, isNotNull, isNull, like } from 'drizzle-orm';

import { DAY_ONE_ACCOUNT_KINDS } from '../../contract/account-kind.js';
import { AccountNotFoundError, ReservedAccountKindError } from '../errors.js';
import { accounts } from '../schema.js';
import {
  translateWriteConflict,
  validatePersonEntityInvariant,
  validatePersonEntityInvariantOnUpdate,
} from './account-entity-invariant.js';
import * as entityPrecreateOutboxService from './entity-precreate-outbox.js';

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

/** Filters + pagination accepted by `listAccounts`. */
export interface ListAccountsOptions {
  search?: string | undefined;
  kind?: AccountKind | undefined;
  archived?: boolean | undefined;
  limit: number;
  offset: number;
}

/** Result of a paginated `listAccounts` call. */
export interface AccountListResult {
  rows: AccountRow[];
  total: number;
}

/** One `{ id, displayOrder }` pair accepted by `reorderAccounts`. */
export interface AccountReorderEntry {
  id: string;
  displayOrder: number;
}

/** Options accepted by `createAccount` beyond the row's own fields. */
export interface CreateAccountOptions {
  /**
   * Escape hatch for the one legitimate case where a `person` account is
   * inserted with `entityId = null`: the caller already tried to resolve the
   * contact via `contacts.createOrFetchByName` and got a TRANSIENT failure
   * (contacts unreachable), so the account is created now and an
   * `entity_precreate_outbox` row is queued in the same transaction for
   * `reconcile-contacts-outbox.ts` to fill in later. Never set this from
   * request input directly — it exists only for the orchestration layer that
   * already tried and failed to resolve a real `entityId` (see
   * `api/modules/accounts/resolve-person-account-entity.ts`).
   */
  allowPendingEntity?: boolean;
}

function isDayOneAccountKind(kind: AccountKind): boolean {
  return (DAY_ONE_ACCOUNT_KINDS as readonly AccountKind[]).includes(kind);
}

/**
 * List accounts matching the given filters, ordered by `displayOrder` then
 * name, with a total count for pagination.
 *
 * `search` matches `name` case-insensitively (SQLite `LIKE`'s default ASCII
 * case-folding), `kind` is an exact match, and `archived` restricts to only
 * archived (`true`) or only active (`false`) rows — omitted returns both.
 */
export function listAccounts(db: FinanceDb, opts: ListAccountsOptions): AccountListResult {
  const conditions = [];
  if (opts.search) conditions.push(like(accounts.name, `%${opts.search}%`));
  if (opts.kind) conditions.push(eq(accounts.kind, opts.kind));
  if (opts.archived === true) conditions.push(isNotNull(accounts.archivedAt));
  if (opts.archived === false) conditions.push(isNull(accounts.archivedAt));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(accounts)
    .where(where)
    .orderBy(asc(accounts.displayOrder), asc(accounts.name))
    .limit(opts.limit)
    .offset(opts.offset)
    .all();

  const countRow = db.select({ total: count() }).from(accounts).where(where).all()[0];
  return { rows, total: countRow?.total ?? 0 };
}

/** Get a single account by id. Throws `AccountNotFoundError` if missing. */
export function getAccount(db: FinanceDb, id: string): AccountRow {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new AccountNotFoundError(id);
  return row;
}

function insertAccountRow(db: FinanceDb, id: string, input: CreateAccountInput): void {
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
}

/**
 * Create a new account. Throws `AccountNameConflictError` for a
 * case-insensitive duplicate name, `AccountCashCurrencyConflictError` for a
 * second `cash` account in a currency that already has one, or
 * `PersonAccountEntityConflictError` for a second `person` account keyed to
 * the same contact in the same currency — all three mapped from the SQLite
 * constraint violation rather than pre-checked, since an account is
 * short-lived, low-cardinality data where the race is not worth a
 * read-then-write. Throws `ReservedAccountKindError` for a kind outside
 * `DAY_ONE_ACCOUNT_KINDS` — those kinds exist in the enum but have no ledger
 * behaviour defined yet, so nothing can act on an account created with one.
 *
 * Throws `PersonAccountRequiresEntityError` for a `person` account with no
 * `entityId` (unless `options.allowPendingEntity`), and
 * `NonPersonAccountHasEntityError` for any other kind carrying one
 * (POPS-2771). With `allowPendingEntity` the insert and the
 * `entity_precreate_outbox` enqueue happen in one transaction, so a crash
 * between the two can never leave a pending `person` account with no outbox
 * row to resolve it.
 */
export function createAccount(
  db: FinanceDb,
  input: CreateAccountInput,
  options: CreateAccountOptions = {}
): AccountRow {
  if (!isDayOneAccountKind(input.kind)) throw new ReservedAccountKindError(input.kind);
  const entityId = input.entityId ?? null;
  const allowPendingEntity = options.allowPendingEntity ?? false;
  validatePersonEntityInvariant(input.kind, entityId, allowPendingEntity);

  const id = crypto.randomUUID();
  try {
    if (allowPendingEntity && entityId === null) {
      db.transaction((tx) => {
        insertAccountRow(tx, id, input);
        entityPrecreateOutboxService.enqueue(tx, {
          id: crypto.randomUUID(),
          name: input.name,
          type: 'person',
          accountId: id,
        });
      });
    } else {
      insertAccountRow(db, id, input);
    }
  } catch (err) {
    translateWriteConflict(err, { name: input.name, currency: input.currency, entityId });
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
 * A patch that would collide with an existing account's name, move a second
 * account into `(cash, currency)`, or key a second `person` account to a
 * contact + currency already claimed, maps to the same conflict errors
 * `createAccount` throws, using the post-patch values. Transitioning `kind`
 * into a reserved value throws `ReservedAccountKindError`, same as create —
 * but re-sending an account's own current (possibly already-reserved) kind
 * unchanged is not a transition and never throws, so an account created
 * before this restriction shipped can still be patched on unrelated fields.
 *
 * Patching `kind` or `entityId` out of POPS-2771's invariant throws
 * `PersonAccountRequiresEntityError` (turning `kind` into `person` with no
 * `entityId` already set or supplied — `updateAccount` never auto-resolves
 * one from a name, unlike `createAccount`) or `NonPersonAccountHasEntityError`
 * (setting `entityId` on, or leaving it on while turning `kind` away from,
 * `person`). The invariant is only re-checked when the patch actually
 * changes `kind` or `entityId` — a `person` account left pending by
 * `createAccount`'s `allowPendingEntity` escape hatch (`entityId` still
 * `null`) can be patched on unrelated fields without tripping
 * `PersonAccountRequiresEntityError` before the outbox resolves it.
 */
export function updateAccount(db: FinanceDb, id: string, input: UpdateAccountInput): AccountRow {
  const current = getAccount(db, id);
  if (input.kind !== undefined && input.kind !== current.kind && !isDayOneAccountKind(input.kind)) {
    throw new ReservedAccountKindError(input.kind);
  }
  const effectiveKind = input.kind ?? current.kind;
  const effectiveEntityId =
    input.entityId !== undefined ? (input.entityId ?? null) : current.entityId;
  validatePersonEntityInvariantOnUpdate(current, input, effectiveKind, effectiveEntityId);

  const updates = buildAccountUpdates(input);
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    const effectiveName = input.name ?? current.name;
    const effectiveCurrency = input.currency ?? current.currency;

    try {
      db.update(accounts).set(updates).where(eq(accounts.id, id)).run();
    } catch (err) {
      translateWriteConflict(err, {
        name: effectiveName,
        currency: effectiveCurrency,
        entityId: effectiveEntityId,
      });
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

/**
 * Batch-update `displayOrder` for a set of accounts atomically. Throws
 * `AccountNotFoundError` naming the first unknown id if any entry's id does
 * not exist, without writing any of the batch — every read and write runs
 * inside one `db.transaction`, so a thrown error rolls the whole thing back
 * rather than leaving a partially-reordered set of rows.
 */
export function reorderAccounts(
  db: FinanceDb,
  entries: readonly AccountReorderEntry[]
): AccountRow[] {
  return db.transaction((tx) => {
    const ids = entries.map((entry) => entry.id);
    const found = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.id, ids))
      .all();
    const foundIds = new Set(found.map((row) => row.id));
    for (const id of ids) {
      if (!foundIds.has(id)) throw new AccountNotFoundError(id);
    }

    const now = new Date().toISOString();
    for (const entry of entries) {
      tx.update(accounts)
        .set({ displayOrder: entry.displayOrder, updatedAt: now })
        .where(eq(accounts.id, entry.id))
        .run();
    }

    return ids.map((id) => {
      const row = tx.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!row) throw new AccountNotFoundError(id);
      return row;
    });
  });
}
