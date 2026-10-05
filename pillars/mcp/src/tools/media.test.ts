import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callContractMismatch,
  callOk,
  callUnavailable,
  mockPillarMedia,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({
  getPillar: pillarMockGetter,
  __resetPillarClientForTests: () => {},
}));

const { mediaTools } = await import('./media.js');

const library = mockPillarMedia.media.library;
const watchlist = mockPillarMedia.media.watchlist;

beforeEach(() => {
  vi.clearAllMocks();
  library.list.mockResolvedValue(
    callOk({
      data: [],
      pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0, hasMore: false },
    })
  );
  watchlist.list.mockResolvedValue(callOk({ data: [], pagination: { total: 0 } }));
});

describe('media.library.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.library.list')!;

  it('defaults type to "all" when not provided', async () => {
    await tool.handler({});
    expect(library.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'all' }));
  });

  it('passes movie filter through', async () => {
    await tool.handler({ type: 'movie', search: 'godfather' });
    expect(library.list).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'movie', search: 'godfather' })
    );
  });

  it('adds canonical URIs to movie and TV rows and preserves pagination', async () => {
    const pagination = { page: 1, pageSize: 24, total: 2, totalPages: 1, hasMore: false };
    library.list.mockResolvedValueOnce(
      callOk({
        data: [
          { id: 3, type: 'movie', title: 'Arrival' },
          { id: 7, type: 'tv', title: 'Severance' },
        ],
        pagination,
      })
    );

    const result = parseResult(await tool.handler({})) as {
      data: Array<Record<string, unknown>>;
      pagination: typeof pagination;
    };

    expect(result.data).toEqual([
      { id: 3, type: 'movie', title: 'Arrival', uri: 'pops:media/movie/3' },
      { id: 7, type: 'tv', title: 'Severance', uri: 'pops:media/tv-show/7' },
    ]);
    expect(result.pagination).toEqual(pagination);
  });

  it('ignores invalid type values and falls back to "all"', async () => {
    await tool.handler({ type: 'podcast' });
    expect(library.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'all' }));
  });

  it('returns isError on unavailable', async () => {
    library.list.mockResolvedValueOnce(callUnavailable('media'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });

  it('returns isError on contract-mismatch', async () => {
    library.list.mockResolvedValueOnce(callContractMismatch('media', '1.0.0', '2.0.0'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});

describe('media.watchlist.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.watchlist.list')!;

  it('passes mediaType filter', async () => {
    await tool.handler({ mediaType: 'movie' });
    expect(watchlist.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'movie' }));
  });

  it('adds media URIs without making watchlist entries addressable entities', async () => {
    const entries = [
      { id: 1, mediaType: 'movie', mediaId: 3, title: 'Arrival' },
      { id: 2, mediaType: 'tv_show', mediaId: 7, title: 'Severance' },
      { id: 3, mediaType: 'podcast', mediaId: 8, title: 'Unmapped media' },
    ];
    const pagination = { total: 2, limit: 50, offset: 0, hasMore: false };
    watchlist.list.mockResolvedValueOnce(callOk({ data: entries, pagination }));

    const result = parseResult(await tool.handler({})) as {
      data: Array<Record<string, unknown>>;
      pagination: typeof pagination;
    };

    expect(result.data).toEqual([
      { ...entries[0], mediaUri: 'pops:media/movie/3' },
      { ...entries[1], mediaUri: 'pops:media/tv-show/7' },
      entries[2],
    ]);
    expect(result.data[0]).not.toHaveProperty('uri');
    expect(result.data[1]).not.toHaveProperty('uri');
    expect(result.data[2]).not.toHaveProperty('mediaUri');
    expect(result.pagination).toEqual(pagination);
  });

  it('ignores invalid mediaType values', async () => {
    await tool.handler({ mediaType: 'podcast' });
    const call = watchlist.list.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['mediaType']).toBeUndefined();
  });

  it('returns isError on unavailable', async () => {
    watchlist.list.mockResolvedValueOnce(callUnavailable('media'));
    const result = await tool.handler({});
    expect(result.isError).toBe(true);
  });
});
