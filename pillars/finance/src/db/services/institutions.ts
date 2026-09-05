/**
 * Institution CRUD against finance's SQLite via drizzle (POPS-2803).
 *
 * Follows the standard service pattern: db-arg services, typed domain
 * errors, no HTTP concerns. Mirrors `services/currencies.ts` — a small
 * standalone lookup table with list/create/delete, picked-with-create from a
 * form, rather than typed free text.
 */
import { asc, eq, sql } from 'drizzle-orm';

import {
  InstitutionConflictError,
  InstitutionInUseError,
  InstitutionMergeSameInstitutionError,
  InstitutionNotFoundError,
} from '../errors.js';
import { institutions } from '../schema.js';
import { isInstitutionNameConflict } from './institution-conflict.js';
import { deleteLogoBlob } from './logo-blobs.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape. */
export type InstitutionRow = typeof institutions.$inferSelect;

/** Fields accepted on create. */
export interface CreateInstitutionInput {
  name: string;
  colour: string;
  logoAssetId?: string | null;
}

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateInstitutionInput {
  name?: string;
  colour?: string;
}

/** List every institution, ordered by name. */
export function listInstitutions(db: FinanceDb): InstitutionRow[] {
  return db.select().from(institutions).orderBy(asc(institutions.name)).all();
}

/** Get a single institution by id. Throws `InstitutionNotFoundError` if missing. */
export function getInstitution(db: FinanceDb, id: string): InstitutionRow {
  const row = db.select().from(institutions).where(eq(institutions.id, id)).get();
  if (!row) throw new InstitutionNotFoundError(id);
  return row;
}

/**
 * Create a new institution. Throws `InstitutionConflictError` if `name`
 * already exists case-insensitively — the `idx_institutions_name_nocase`
 * unique index is the single source of truth for this, mapped from the
 * SQLite constraint violation rather than pre-checked, since an institution
 * name is short-lived, low-cardinality data where the race is not worth a
 * read-then-write.
 */
export function createInstitution(db: FinanceDb, input: CreateInstitutionInput): InstitutionRow {
  const id = crypto.randomUUID();
  try {
    db.insert(institutions)
      .values({
        id,
        name: input.name,
        colour: input.colour,
        logoAssetId: input.logoAssetId ?? null,
      })
      .run();
  } catch (err) {
    if (isInstitutionNameConflict(err)) throw new InstitutionConflictError(input.name);
    throw err;
  }
  return getInstitution(db, id);
}

/**
 * Patch an institution's `name` and/or `colour`. Throws
 * `InstitutionNotFoundError` if missing, or `InstitutionConflictError` if the
 * patched `name` collides case-insensitively with a different institution —
 * mapped from the same unique-index violation `createInstitution` maps, so a
 * no-op rename (patching a name to its own current value) never throws even
 * though it "conflicts" with itself, since the UPDATE simply doesn't change
 * the indexed value in that case.
 */
export function updateInstitution(
  db: FinanceDb,
  id: string,
  input: UpdateInstitutionInput
): InstitutionRow {
  getInstitution(db, id);
  const updates: Partial<typeof institutions.$inferInsert> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.colour !== undefined) updates.colour = input.colour;

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date().toISOString();
    try {
      db.update(institutions).set(updates).where(eq(institutions.id, id)).run();
    } catch (err) {
      if (isInstitutionNameConflict(err)) throw new InstitutionConflictError(input.name ?? '');
      throw err;
    }
  }

  return getInstitution(db, id);
}

/**
 * Point (or clear) an institution's `logoAssetId`. Split out from
 * {@link updateInstitution} because it is written by the upload/removal
 * orchestration in `src/api/modules/logo-upload.ts`, not by the settings
 * PATCH form — `UpdateInstitutionInput` deliberately has no `logoAssetId`
 * field so a plain rename/recolour PATCH can never accidentally touch it.
 */
export function setInstitutionLogoAssetId(
  db: FinanceDb,
  id: string,
  logoAssetId: string | null
): InstitutionRow {
  getInstitution(db, id);
  db.update(institutions)
    .set({ logoAssetId, updatedAt: new Date().toISOString() })
    .where(eq(institutions.id, id))
    .run();
  return getInstitution(db, id);
}

/**
 * Every user table carrying a column literally named `institution_id`,
 * quoted for interpolation into raw SQL. Shared by {@link isInstitutionInUse}
 * (read) and {@link mergeInstitutions} (write) so both stay accurate as more
 * tables gain the column — `accounts.institution_id` (POPS-2767) is the
 * first, nothing hardcodes its name.
 */
function tablesWithInstitutionIdColumn(db: FinanceDb): ReturnType<typeof sql.raw>[] {
  const tables = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'institutions'`
  );

  const matches: ReturnType<typeof sql.raw>[] = [];
  for (const { name } of tables) {
    const quotedTable = sql.raw(`"${name.replace(/"/g, '""')}"`);
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${quotedTable})`);
    if (columns.some((column) => column.name === 'institution_id')) matches.push(quotedTable);
  }
  return matches;
}

/**
 * Whether any other table currently references `id` through an
 * `institution_id` column — see {@link tablesWithInstitutionIdColumn}.
 */
export function isInstitutionInUse(db: FinanceDb, id: string): boolean {
  for (const quotedTable of tablesWithInstitutionIdColumn(db)) {
    const match = db.get<{ found: number }>(
      sql`SELECT 1 AS found FROM ${quotedTable} WHERE "institution_id" = ${id} LIMIT 1`
    );
    if (match) return true;
  }
  return false;
}

/**
 * Delete an institution. Throws `InstitutionNotFoundError` if missing, or
 * `InstitutionInUseError` if {@link isInstitutionInUse} finds a referencing
 * row — e.g. an `accounts.institution_id` foreign key (POPS-2767).
 *
 * `logo_blobs` has no `institution_id` column, so it is invisible to
 * {@link isInstitutionInUse} and {@link tablesWithInstitutionIdColumn} — the
 * institution's `logoAssetId` is deleted explicitly, in the same transaction,
 * so a deleted institution never leaves its logo bytes behind (POPS-2867).
 */
export function deleteInstitution(db: FinanceDb, id: string): void {
  const institution = getInstitution(db, id);
  if (isInstitutionInUse(db, id)) throw new InstitutionInUseError(id);

  db.transaction((tx) => {
    const result = tx.delete(institutions).where(eq(institutions.id, id)).run();
    if (result.changes === 0) throw new InstitutionNotFoundError(id);
    if (institution.logoAssetId) deleteLogoBlob(tx, institution.logoAssetId);
  });
}

/**
 * Merge `sourceId` into `targetId`: repoint every `institution_id` column
 * found by {@link tablesWithInstitutionIdColumn} from `sourceId` to
 * `targetId`, then delete the `sourceId` row. Both steps run inside one
 * `db.transaction` — a thrown error rolls the whole thing back rather than
 * leaving some table repointed with the source institution still present.
 *
 * The survivor keeps its own `logoAssetId` and `colour` unqualified —
 * `targetId`'s values win outright, `sourceId`'s are discarded with the row.
 * Blending or prompting for a per-field choice would only be worth it if
 * institutions carried more identity than a name/colour/logo triple; for
 * this shape, "the institution you kept is the one you see" is simpler to
 * reason about than a partial merge of two logos or two colours. The
 * source's `logo_blobs` row (if any) is deleted alongside it — that table has
 * no `institution_id` column, so it is invisible to
 * {@link tablesWithInstitutionIdColumn} and needs its own explicit cleanup in
 * the same transaction, or its bytes would be orphaned forever (POPS-2867).
 *
 * Throws `InstitutionNotFoundError` if either id is unknown, or
 * `InstitutionMergeSameInstitutionError` if `sourceId === targetId` — merging
 * an institution into itself would repoint nothing and then delete the row
 * callers still expect to exist.
 */
export function mergeInstitutions(
  db: FinanceDb,
  sourceId: string,
  targetId: string
): InstitutionRow {
  const source = getInstitution(db, sourceId);
  getInstitution(db, targetId);

  if (sourceId === targetId) throw new InstitutionMergeSameInstitutionError(sourceId);

  db.transaction((tx) => {
    for (const quotedTable of tablesWithInstitutionIdColumn(tx)) {
      tx.run(
        sql`UPDATE ${quotedTable} SET "institution_id" = ${targetId} WHERE "institution_id" = ${sourceId}`
      );
    }
    tx.delete(institutions).where(eq(institutions.id, sourceId)).run();
    if (source.logoAssetId) deleteLogoBlob(tx, source.logoAssetId);
  });

  return getInstitution(db, targetId);
}
