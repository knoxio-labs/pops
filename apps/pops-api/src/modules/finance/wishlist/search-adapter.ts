import { like } from 'drizzle-orm';

import { wishList } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/index.js';

export interface WishlistHitData {
  item: string;
  priority: string | null;
  targetAmount: number | null;
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

export const wishlistSearchAdapter: SearchAdapter<WishlistHitData> = {
  domain: 'wishlist',
  icon: 'Star',
  color: 'yellow',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<WishlistHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const limit = options?.limit ?? 20;

    const rows = db
      .select()
      .from(wishList)
      .where(like(wishList.item, `%${text}%`))
      .limit(limit)
      .all();

    const hits: SearchHit<WishlistHitData>[] = [];

    for (const row of rows) {
      const match = scoreHit(row.item, text);
      if (!match) continue;

      hits.push({
        uri: `/finance/wishlist`,
        score: match.score,
        matchField: 'item',
        matchType: match.matchType,
        data: {
          item: row.item,
          priority: row.priority,
          targetAmount: row.targetAmount,
        },
      });
    }

    return hits.toSorted((a, b) => b.score - a.score);
  },
};

registerSearchAdapter(wishlistSearchAdapter);
