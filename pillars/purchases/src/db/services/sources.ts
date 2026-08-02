/**
 * `purchase_sources` CRUD.
 *
 * Sources are configuration, and configuration is data — registering a new
 * merchant is an INSERT here, not a code change (ADR-035).
 */
import { asc, eq } from 'drizzle-orm';

import { DEFAULT_SETTLEMENT_WINDOW_DAYS } from '../../contract/constants.js';
import { purchaseSources } from '../schema.js';
import { expectRow, type PurchasesDb } from './internal.js';

import type { AutoLinkPolicy } from '../../contract/constants.js';
import type { PurchaseSourceRow } from '../schema.js';

export interface UpsertSourceInput {
  readonly id: string;
  readonly label: string;
  readonly descriptorPattern?: string | null;
  readonly settlementWindowDays?: number;
  readonly autoLinkPolicy?: AutoLinkPolicy;
  readonly ingestAdapter?: string | null;
}

export function listSources(db: PurchasesDb): readonly PurchaseSourceRow[] {
  return db.select().from(purchaseSources).orderBy(asc(purchaseSources.id)).all();
}

export function getSource(db: PurchasesDb, id: string): PurchaseSourceRow | undefined {
  return db.select().from(purchaseSources).where(eq(purchaseSources.id, id)).all()[0];
}

/**
 * Insert or update a source by its slug. Upsert rather than create so that
 * re-running a deployment's source seed is idempotent — the same property
 * ingest relies on for purchases.
 *
 * **Full replace, one rule for every field.** An omitted field takes its
 * declared default (`settlementWindowDays`, `autoLinkPolicy`) or null
 * (everything else) — it never silently retains whatever the previous
 * write left behind. An earlier version kept the two tuning fields on
 * update while clearing the nullable ones, which meant the result of a
 * seed depended on what happened to be in the table beforehand.
 *
 * The consequence worth knowing: a caller holding a partial update must
 * read the row, merge, and write the whole thing back. That is the price
 * of a seed whose outcome is a function of its input alone.
 */
export function upsertSource(db: PurchasesDb, input: UpsertSourceInput): PurchaseSourceRow {
  const values = {
    id: input.id,
    label: input.label,
    descriptorPattern: input.descriptorPattern ?? null,
    settlementWindowDays: input.settlementWindowDays ?? DEFAULT_SETTLEMENT_WINDOW_DAYS,
    autoLinkPolicy: input.autoLinkPolicy ?? 'review',
    ingestAdapter: input.ingestAdapter ?? null,
  };
  const rows = db
    .insert(purchaseSources)
    .values(values)
    .onConflictDoUpdate({ target: purchaseSources.id, set: values })
    .returning()
    .all();
  return expectRow(rows, 'upsertSource');
}

export function deleteSource(db: PurchasesDb, id: string): boolean {
  return db.delete(purchaseSources).where(eq(purchaseSources.id, id)).run().changes > 0;
}
