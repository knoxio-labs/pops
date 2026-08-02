/**
 * Row → wire projections.
 *
 * The only real work here is `tags`: SQLite has no array type, so the
 * column holds a JSON string while the contract declares `string[]`. The
 * conversion is confined to this file so no handler has to remember it.
 */
import type { Purchase, PurchaseItem, PurchaseSource } from '../../contract/types/index.js';
import type { PurchaseItemRow, PurchaseRow, PurchaseSourceRow } from '../../db/index.js';

/**
 * Parse a `tags` column. A malformed or non-array value degrades to `[]`
 * rather than throwing: a corrupt tag list should not make a purchase
 * unreadable, and the money fields — the ones that matter — are unaffected.
 */
function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    return [];
  }
}

export function toPurchase(row: PurchaseRow): Purchase {
  return row;
}

export function toPurchaseItem(row: PurchaseItemRow): PurchaseItem {
  const { tags, ...rest } = row;
  return { ...rest, tags: parseTags(tags) };
}

export function toPurchaseSource(row: PurchaseSourceRow): PurchaseSource {
  return row;
}
