import { and, isNull, like, lt, or, sql } from 'drizzle-orm';

import { wishList } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/index.js';

export interface WishListHitData {
  item: string;
  targetAmount: number | null;
  saved: number | null;
  priority: string | null;
}

function scoreHit(
  item: string,
  query: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } | null {
  const lower = item.toLowerCase();
  const q = query.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

export const wishListSearchAdapter: SearchAdapter<WishListHitData> = {
  domain: 'wishlist',
  icon: 'Star',
  color: 'yellow',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<WishListHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const limit = options?.limit ?? 20;

    // Exclude purchased items: saved >= target_amount means the item is complete.
    // Keep items where target_amount is NULL (no target set) or saved < target_amount.
    const notPurchased = or(
      isNull(wishList.targetAmount),
      lt(wishList.saved, wishList.targetAmount)
    );

    const rows = db
      .select()
      .from(wishList)
      .where(and(like(sql`lower(${wishList.item})`, `%${text.toLowerCase()}%`), notPurchased))
      .limit(limit)
      .all();

    const hits: SearchHit<WishListHitData>[] = [];

    for (const row of rows) {
      const match = scoreHit(row.item, text);
      if (!match) continue;

      hits.push({
        uri: `/finance/wishlist/${row.id}`,
        score: match.score,
        matchField: 'item',
        matchType: match.matchType,
        data: {
          item: row.item,
          targetAmount: row.targetAmount ?? null,
          saved: row.saved ?? null,
          priority: row.priority ?? null,
        },
      });
    }

    return hits.toSorted((a, b) => b.score - a.score);
  },
};

registerSearchAdapter(wishListSearchAdapter);
