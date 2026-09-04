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
  InstitutionNotFoundError,
} from '../errors.js';
import { institutions } from '../schema.js';
import { isInstitutionNameConflict } from './institution-conflict.js';

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
 * Whether any other table currently references `id` through an
 * `institution_id` column. Scans `sqlite_master` for user tables carrying a
 * column literally named `institution_id` and checks each for a matching
 * row, rather than naming a specific table — no table has one yet
 * (`accounts.institution_id` lands in POPS-2767), so this returns `false`
 * today and starts refusing in-use deletes automatically the moment that
 * column exists, with no change needed here.
 */
export function isInstitutionInUse(db: FinanceDb, id: string): boolean {
  const tables = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'institutions'`
  );

  for (const { name } of tables) {
    const quotedTable = sql.raw(`"${name.replace(/"/g, '""')}"`);
    const columns = db.all<{ name: string }>(sql`PRAGMA table_info(${quotedTable})`);
    if (!columns.some((column) => column.name === 'institution_id')) continue;

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
 * row — currently unreachable (see {@link isInstitutionInUse}), kept so the
 * refusal path exists ahead of POPS-2767.
 */
export function deleteInstitution(db: FinanceDb, id: string): void {
  getInstitution(db, id);
  if (isInstitutionInUse(db, id)) throw new InstitutionInUseError(id);
  const result = db.delete(institutions).where(eq(institutions.id, id)).run();
  if (result.changes === 0) throw new InstitutionNotFoundError(id);
}
