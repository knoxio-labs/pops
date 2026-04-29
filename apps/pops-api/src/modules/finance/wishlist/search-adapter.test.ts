import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from 'better-sqlite3';

// Prevent side-effect registration from throwing on import
vi.mock('../../core/search/registry.js', () => ({
  registerSearchAdapter: vi.fn(),
  getAdapters: vi.fn(),
  resetRegistry: vi.fn(),
}));

import { seedWishListItem, setupTestContext } from '../../../shared/test-utils.js';
import { registerSearchAdapter } from '../../core/search/registry.js';
import { type WishListHitData, wishListSearchAdapter } from './search-adapter.js';

import type { SearchHit } from '../../core/search/index.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

function search(query: string, limit?: number): SearchHit<WishListHitData>[] {
  return wishListSearchAdapter.search(
    { text: query },
    { app: 'finance', page: 'wishlist' },
    limit ? { limit } : undefined
  ) as SearchHit<WishListHitData>[];
}

describe('wishlist search adapter', () => {
  it('registers with correct metadata', () => {
    expect(wishListSearchAdapter.domain).toBe('wishlist');
    expect(wishListSearchAdapter.icon).toBe('Star');
    expect(wishListSearchAdapter.color).toBe('yellow');
    expect(registerSearchAdapter).toHaveBeenCalledWith(wishListSearchAdapter);
  });

  it('returns empty results for empty query', () => {
    seedWishListItem(db, { item: 'Gaming PC' });
    expect(search('')).toEqual([]);
    expect(search('  ')).toEqual([]);
  });

  it('returns exact match with score 1.0', () => {
    const id = seedWishListItem(db, {
      item: 'Gaming PC',
      target_amount: 2000,
      saved: 500,
      priority: 'High',
    });

    const hits = search('Gaming PC');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
    expect(hits[0]!.matchField).toBe('item');
    expect(hits[0]!.uri).toBe(`/finance/wishlist/${id}`);
    expect(hits[0]!.data).toEqual({
      item: 'Gaming PC',
      targetAmount: 2000,
      saved: 500,
      priority: 'High',
    });
  });

  it('exact match is case-insensitive', () => {
    seedWishListItem(db, { item: 'Gaming PC' });

    const hits = search('gaming pc');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.matchType).toBe('exact');
  });

  it('returns prefix match with score 0.8', () => {
    seedWishListItem(db, { item: 'Standing Desk', target_amount: 800, saved: 100 });

    const hits = search('Stand');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.8);
    expect(hits[0]!.matchType).toBe('prefix');
    expect(hits[0]!.data.item).toBe('Standing Desk');
  });

  it('returns contains match with score 0.5', () => {
    seedWishListItem(db, { item: 'Standing Desk' });

    const hits = search('ding');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0.5);
    expect(hits[0]!.matchType).toBe('contains');
  });

  it('sorts results by score descending', () => {
    seedWishListItem(db, { item: 'Camera' });
    seedWishListItem(db, { item: 'Camera Lens' });
    seedWishListItem(db, { item: 'Action Camera' });

    const hits = search('Camera');
    expect(hits.length).toBeGreaterThanOrEqual(3);

    // "Camera" = exact (1.0), "Camera Lens" = prefix (0.8), "Action Camera" = contains (0.5)
    expect(hits[0]!.score).toBe(1.0);
    expect(hits[0]!.data.item).toBe('Camera');
    expect(hits[1]!.score).toBe(0.8);
    expect(hits[1]!.data.item).toBe('Camera Lens');
    expect(hits[2]!.score).toBe(0.5);
    expect(hits[2]!.data.item).toBe('Action Camera');
  });

  it('excludes items where saved >= target_amount (purchased)', () => {
    seedWishListItem(db, { item: 'Gaming PC', target_amount: 2000, saved: 2000 });
    seedWishListItem(db, { item: 'Gaming Mouse', target_amount: 100, saved: 150 });

    const hits = search('Gaming');
    expect(hits).toHaveLength(0);
  });

  it('includes items where saved < target_amount (still saving)', () => {
    seedWishListItem(db, { item: 'Gaming PC', target_amount: 2000, saved: 500 });

    const hits = search('Gaming PC');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.item).toBe('Gaming PC');
  });

  it('includes items where target_amount is null (no target set)', () => {
    seedWishListItem(db, { item: 'Japan Trip', target_amount: null, saved: null });

    const hits = search('Japan');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.item).toBe('Japan Trip');
  });

  it('includes items with target_amount but no saved amount', () => {
    seedWishListItem(db, { item: 'Ergonomic Chair', target_amount: 600, saved: null });

    const hits = search('Ergonomic');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.item).toBe('Ergonomic Chair');
  });

  it('mixes purchased (excluded) and active (included) items correctly', () => {
    seedWishListItem(db, { item: 'Desk', target_amount: 500, saved: 500 }); // purchased
    seedWishListItem(db, { item: 'Desk Lamp', target_amount: 80, saved: 20 }); // active
    seedWishListItem(db, { item: 'Desk Mat', target_amount: null }); // no target

    const hits = search('Desk');
    const items = hits.map((h) => h.data.item);

    expect(items).not.toContain('Desk');
    expect(items).toContain('Desk Lamp');
    expect(items).toContain('Desk Mat');
  });

  it('handles null priority and amounts in hit data', () => {
    seedWishListItem(db, {
      item: 'Miscellaneous Item',
      target_amount: null,
      saved: null,
      priority: null,
    });

    const hits = search('Miscellaneous');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.data.targetAmount).toBeNull();
    expect(hits[0]!.data.saved).toBeNull();
    expect(hits[0]!.data.priority).toBeNull();
  });

  it('returns no results when nothing matches', () => {
    seedWishListItem(db, { item: 'Gaming PC' });
    expect(search('zzz-no-match')).toEqual([]);
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      seedWishListItem(db, { item: `Gadget ${i}` });
    }

    const hits = search('Gadget', 3);
    expect(hits).toHaveLength(3);
  });
});
