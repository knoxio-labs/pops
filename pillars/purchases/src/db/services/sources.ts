/**
 * `purchase_sources` CRUD.
 *
 * Sources are configuration, and configuration is data — registering a new
 * merchant is an INSERT here, not a code change (ADR-035).
 */
import { asc, eq } from 'drizzle-orm';

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
 */
export function upsertSource(db: PurchasesDb, input: UpsertSourceInput): PurchaseSourceRow {
  const values = {
    id: input.id,
    label: input.label,
    descriptorPattern: input.descriptorPattern ?? null,
    ...(input.settlementWindowDays === undefined
      ? {}
      : { settlementWindowDays: input.settlementWindowDays }),
    ...(input.autoLinkPolicy === undefined ? {} : { autoLinkPolicy: input.autoLinkPolicy }),
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
