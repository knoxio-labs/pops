import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

import { items, type ItemRow } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/**
 * Reads live report rows, retaining containers only when they have a value on
 * the selected report basis.
 */
export function readValueReportRows(db: CommandDb, basis: 'replacement' | 'purchase'): ItemRow[] {
  const valuedContainer =
    basis === 'replacement' ? isNotNull(items.replacementValue) : isNotNull(items.purchasePrice);
  return db
    .select()
    .from(items)
    .where(
      and(
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active'),
        or(eq(items.isContainer, 0), valuedContainer)
      )
    )
    .all();
}
