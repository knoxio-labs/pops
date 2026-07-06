import { describe, expect, it, vi } from 'vitest';

import { fetchAllPages, type PaginatedResult } from './fetch-all-pages';

function page(
  data: number[],
  total: number,
  offset: number,
  hasMore: boolean
): PaginatedResult<number> {
  return { data, pagination: { total, limit: data.length, offset, hasMore } };
}

describe('fetchAllPages', () => {
  it('returns all rows from a single page untouched', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2, 3], 3, 0, false));

    const result = await fetchAllPages(fetchPage, 500);

    expect(result.data).toEqual([1, 2, 3]);
    expect(result.pagination).toEqual({ total: 3, limit: 3, offset: 0, hasMore: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({ limit: 500, offset: 0 });
  });

  it('follows hasMore across multiple pages and flattens the results in order', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 5, 0, true))
      .mockResolvedValueOnce(page([3, 4], 5, 2, true))
      .mockResolvedValueOnce(page([5], 5, 4, false));

    const result = await fetchAllPages(fetchPage, 2);

    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.pagination).toEqual({ total: 5, limit: 5, offset: 0, hasMore: false });
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { limit: 2, offset: 0 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { limit: 2, offset: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(3, { limit: 2, offset: 4 });
  });

  it('handles an empty collection without looping forever', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([], 0, 0, false));

    const result = await fetchAllPages(fetchPage);

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops once a page returns no rows even if the server still claims hasMore', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1], 10, 0, true))
      .mockResolvedValueOnce(page([], 10, 1, true));

    const result = await fetchAllPages(fetchPage, 1);

    expect(result.data).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('never fetches more than the MAX_PAGES safety backstop against a runaway hasMore', async () => {
    const fetchPage = vi
      .fn()
      .mockImplementation(async (p: { limit: number; offset: number }) =>
        page([1], 1_000_000, p.offset, true)
      );

    const result = await fetchAllPages(fetchPage, 1);

    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(200);
    expect(result.data.length).toBe(fetchPage.mock.calls.length);
    expect(result.pagination.hasMore).toBe(true);
  });
});
