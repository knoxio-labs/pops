import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { items, type ItemRow } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/**
 * Reads live report rows, retaining containers only when they have a value on
 * the selected report basis. When requested, rows are ordered by name using
 * the same SQLite collation as the web report entries route.
 */
export function readValueReportRows(
  db: CommandDb,
  basis: 'replacement' | 'purchase',
  options: { readonly orderByName?: boolean } = {}
): ItemRow[] {
  const valuedContainer =
    basis === 'replacement' ? isNotNull(items.replacementValue) : isNotNull(items.purchasePrice);
  const query = db
    .select()
    .from(items)
    .where(
      and(
        isNull(items.deletedAt),
        eq(items.lifecycle, 'active'),
        or(eq(items.isContainer, 0), valuedContainer)
      )
    );
  return options.orderByName
    ? query.orderBy(asc(sql`${items.name} COLLATE NOCASE`), asc(items.id)).all()
    : query.all();
}
