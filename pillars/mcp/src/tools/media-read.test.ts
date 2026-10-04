import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, parseResult } from './test-helpers.js';

const mediaHandle = vi.hoisted(() => ({
  movies: { get: vi.fn() },
  tvShows: { get: vi.fn() },
  watchHistory: { listRecent: vi.fn() },
}));

vi.mock('../pillar-client.js', () => ({
  getPillar: (pillarId: string) => {
    if (pillarId !== 'media') throw new Error(`Unexpected pillar: ${pillarId}`);
    return mediaHandle;
  },
}));

const { mediaReadTools } = await import('./media-read.js');
const { allTools } = await import('./index.js');

const movieGet = mediaReadTools.find((tool) => tool.name === 'media.movies.get')!;
const tvShowGet = mediaReadTools.find((tool) => tool.name === 'media.tvShows.get')!;
const watchHistoryRecent = mediaReadTools.find(
  (tool) => tool.name === 'media.watchHistory.recent'
)!;

const invalidIds: Array<{ label: string; args: Record<string, unknown> }> = [
  { label: 'missing', args: {} },
  { label: 'zero', args: { id: 0 } },
  { label: 'negative', args: { id: -1 } },
  { label: 'fractional', args: { id: 1.5 } },
  { label: 'string', args: { id: '3' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mediaHandle.movies.get.mockResolvedValue(
    callOk({ data: { id: 3, title: 'Arrival', releaseDate: '2016-11-11' } })
  );
  mediaHandle.tvShows.get.mockResolvedValue(
    callOk({ data: { id: 7, name: 'Severance', firstAirDate: '2022-04-15' } })
  );
  mediaHandle.watchHistory.listRecent.mockResolvedValue(
    callOk({ data: [], pagination: { total: 0 } })
  );
});

describe('media.movies.get', () => {
  it('gets a movie by its library ID and adds its ADR-012 URI', async () => {
    const result = parseResult(await movieGet.handler({ id: 3 }));

    expect(mediaHandle.movies.get).toHaveBeenCalledWith({ id: 3 });
    expect(result).toEqual({
      data: { id: 3, title: 'Arrival', releaseDate: '2016-11-11', uri: 'pops:media/movie/3' },
    });
  });
});

describe('media.tvShows.get', () => {
  it('gets a TV show by its library ID and adds its ADR-012 URI', async () => {
    const result = parseResult(await tvShowGet.handler({ id: 7 }));

    expect(mediaHandle.tvShows.get).toHaveBeenCalledWith({ id: 7 });
    expect(result).toEqual({
      data: { id: 7, name: 'Severance', firstAirDate: '2022-04-15', uri: 'pops:media/tv-show/7' },
    });
  });
});

describe.each([
  { name: 'media.movies.get', tool: movieGet, get: mediaHandle.movies.get },
  { name: 'media.tvShows.get', tool: tvShowGet, get: mediaHandle.tvShows.get },
])('$name', ({ tool, get }) => {
  it.each(invalidIds)('rejects a $label id without calling the pillar', async ({ args }) => {
    const result = await tool.handler(args);

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('media.watchHistory.recent', () => {
  it('forwards every supported filter with its exact value', async () => {
    const startDate = '2026-09-01T00:00:00.000Z';
    const endDate = '2026-09-30T23:59:59.000Z';

    await watchHistoryRecent.handler({
      mediaType: 'episode',
      startDate,
      endDate,
      limit: 12,
      offset: 24,
    });

    expect(mediaHandle.watchHistory.listRecent).toHaveBeenCalledWith({
      mediaType: 'episode',
      startDate,
      endDate,
      limit: 12,
      offset: 24,
    });
  });

  it('drops unknown media types and values of the wrong type', async () => {
    await watchHistoryRecent.handler({
      mediaType: 'series',
      startDate: 42,
      endDate: null,
      limit: '12',
      offset: false,
      unknown: 'ignored',
    });

    expect(mediaHandle.watchHistory.listRecent).toHaveBeenCalledWith({});
  });

  it('adds movie and owning-show URIs without treating an episode as a page', async () => {
    const entries = [
      { id: 1, mediaType: 'movie', mediaId: 3, tvShowId: null, title: 'Arrival' },
      { id: 2, mediaType: 'episode', mediaId: 99, tvShowId: 7, title: 'The We We Are' },
      { id: 3, mediaType: 'episode', mediaId: 100, tvShowId: null, title: 'Unknown show' },
      { id: 4, mediaType: 'season', mediaId: 4, tvShowId: 7, title: 'Unmapped media' },
    ];
    const pagination = { total: 4, limit: 50, offset: 0, hasMore: false };
    mediaHandle.watchHistory.listRecent.mockResolvedValueOnce(
      callOk({ data: entries, pagination })
    );

    const result = parseResult(await watchHistoryRecent.handler({})) as {
      data: Array<Record<string, unknown>>;
      pagination: typeof pagination;
    };

    expect(result.data).toEqual([
      { ...entries[0], mediaUri: 'pops:media/movie/3' },
      { ...entries[1], mediaUri: 'pops:media/tv-show/7' },
      entries[2],
      entries[3],
    ]);
    expect(result.data[1]).not.toHaveProperty('uri');
    expect(result.data[2]).not.toHaveProperty('mediaUri');
    expect(result.data[3]).not.toHaveProperty('mediaUri');
    expect(result.pagination).toEqual(pagination);
  });

  it('surfaces an unavailable media result as an MCP error', async () => {
    mediaHandle.watchHistory.listRecent.mockResolvedValueOnce(callUnavailable('media'));

    expect((await watchHistoryRecent.handler({})).isError).toBe(true);
  });
});

describe('media read tool registration', () => {
  it('registers each new tool in allTools as explicitly read-only', () => {
    for (const name of ['media.movies.get', 'media.tvShows.get', 'media.watchHistory.recent']) {
      expect(allTools.find((tool) => tool.name === name)?.readOnly).toBe(true);
    }
  });
});
