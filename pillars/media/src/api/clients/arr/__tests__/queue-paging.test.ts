/**
 * Radarr and Sonarr serve `/queue` as a page and default to 10 records. The
 * rotation engine reads absence from that list as "not downloading" and, once
 * the leaving window expires, deletes the file — so a queue read that stops at
 * page one is a destructive decision made on partial evidence (POPS-2703).
 */
import { describe, expect, it, vi } from 'vitest';

import { fetchWholeQueue } from '../queue-paging.js';

function pagedQueue(total: number) {
  return vi.fn(async (page: number, pageSize: number) => {
    const start = (page - 1) * pageSize;
    return {
      totalRecords: total,
      records: Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => ({
        id: start + i,
      })),
    };
  });
}

describe('fetchWholeQueue', () => {
  it('keeps paging until every record is in hand', async () => {
    const fetchPage = pagedQueue(450);

    const result = await fetchWholeQueue(fetchPage, 'radarr');

    expect(result.records).toHaveLength(450);
    expect(result.totalRecords).toBe(450);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 200);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 200);
  });

  it('asks for a page size rather than accepting the server default of ten', async () => {
    const fetchPage = pagedQueue(5);

    await fetchWholeQueue(fetchPage, 'radarr');

    expect(fetchPage).toHaveBeenCalledExactlyOnceWith(1, 200);
  });

  it('stops on an exact page boundary without an extra empty request', async () => {
    const fetchPage = pagedQueue(200);

    const result = await fetchWholeQueue(fetchPage, 'radarr');

    expect(result.records).toHaveLength(200);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('returns an empty queue without looping', async () => {
    const fetchPage = pagedQueue(0);

    const result = await fetchWholeQueue(fetchPage, 'radarr');

    expect(result.records).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops and says so when a peer never stops reporting more', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchPage = vi.fn(async (_page: number, pageSize: number) => ({
      totalRecords: Number.MAX_SAFE_INTEGER,
      records: Array.from({ length: pageSize }, (_, i) => ({ id: i })),
    }));

    const result = await fetchWholeQueue(fetchPage, 'radarr');

    expect(fetchPage).toHaveBeenCalledTimes(100);
    expect(result.records).toHaveLength(20_000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUNCATED'));
    warn.mockRestore();
  });
});
