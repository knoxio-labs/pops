import { and, eq, isNull, sql } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { normalizeLegacyLabels } from '../../catalogue/legacy-labels.js';
import { items } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

/** Count legacy-label arrivals for all published types with one grouped item scan. */
export function readWebTypeArrivalCounts(db: CommandDb): Record<string, number> {
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null) return {};

  const legacyLabel = sql<string | null>`lower(trim(${items.legacyType}))`;
  const rows = db
    .select({ label: legacyLabel, count: sql<number>`COUNT(*)` })
    .from(items)
    .where(and(isNull(items.deletedAt), isNull(items.typeId), eq(items.lifecycle, 'active')))
    .groupBy(legacyLabel)
    .all();
  const countsByLabel = new Map(rows.map((row) => [row.label, row.count]));
  return Object.fromEntries(
    catalogue.types.map((type) => [
      type.key,
      normalizeLegacyLabels(type.legacyLabels).reduce(
        (count, label) => count + (countsByLabel.get(label) ?? 0),
        0
      ),
    ])
  );
}
