import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callOk, callUnavailable, parseResult } from './test-helpers.js';

const { mediaHandle } = vi.hoisted(() => ({
  mediaHandle: { watchlist: { add: vi.fn() } },
}));

vi.mock('../pillar-client.js', () => ({
  getPillar: () => mediaHandle,
  __resetPillarClientForTests: () => {},
}));

const { mediaTools } = await import('./media.js');
const { allTools } = await import('./index.js');

const add = mediaHandle.watchlist.add;
const addTool = mediaTools.find((tool) => tool.name === 'media.watchlist.add')!;

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue(
    callOk({
      data: { id: 1, mediaType: 'movie', mediaId: 3, title: 'Arrival' },
      created: true,
      message: 'Added to watchlist.',
    })
  );
});

describe('media.watchlist.add', () => {
  it('forwards only the required fields when optionals are absent', async () => {
    await addTool.handler({ mediaType: 'movie', mediaId: 3 });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 3 });
  });

  it('forwards optional priority and notes when provided', async () => {
    await addTool.handler({ mediaType: 'movie', mediaId: 3, priority: 0, notes: 'For later' });

    expect(add).toHaveBeenCalledWith({
      mediaType: 'movie',
      mediaId: 3,
      priority: 0,
      notes: 'For later',
    });
  });

  it('forwards priority without adding an absent notes field', async () => {
    await addTool.handler({ mediaType: 'movie', mediaId: 3, priority: 2 });

    expect(add).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 3, priority: 2 });
  });

  it('forwards notes without adding an absent priority field', async () => {
    await addTool.handler({ mediaType: 'movie', mediaId: 3, notes: 'For later' });

    expect(add).toHaveBeenCalledWith({ mediaType: 'movie', mediaId: 3, notes: 'For later' });
  });

  it('adds the canonical movie mediaUri to the returned watchlist entry', async () => {
    const result = parseResult(await addTool.handler({ mediaType: 'movie', mediaId: 3 })) as {
      data: Record<string, unknown>;
      created: boolean;
    };

    expect(result.data).toMatchObject({
      mediaType: 'movie',
      mediaId: 3,
      mediaUri: 'pops:media/movie/3',
    });
    expect(result.created).toBe(true);
  });

  it('adds the canonical TV-show mediaUri to the returned watchlist entry', async () => {
    add.mockResolvedValueOnce(
      callOk({
        data: { id: 2, mediaType: 'tv_show', mediaId: 7, title: 'Severance' },
        created: true,
        message: 'Added to watchlist.',
      })
    );

    const result = parseResult(await addTool.handler({ mediaType: 'tv_show', mediaId: 7 })) as {
      data: Record<string, unknown>;
    };

    expect(result.data).toMatchObject({
      mediaType: 'tv_show',
      mediaId: 7,
      mediaUri: 'pops:media/tv-show/7',
    });
  });

  it.each([
    ['unsupported mediaType', { mediaType: 'podcast', mediaId: 3 }],
    ['zero mediaId', { mediaType: 'movie', mediaId: 0 }],
    ['fractional mediaId', { mediaType: 'movie', mediaId: 3.5 }],
    ['negative priority', { mediaType: 'movie', mediaId: 3, priority: -1 }],
    ['fractional priority', { mediaType: 'movie', mediaId: 3, priority: 1.5 }],
    ['non-string notes', { mediaType: 'movie', mediaId: 3, notes: 4 }],
    ['null priority', { mediaType: 'movie', mediaId: 3, priority: null }],
    ['null notes', { mediaType: 'movie', mediaId: 3, notes: null }],
  ])('rejects %s before calling the media pillar', async (_label, args) => {
    const result = await addTool.handler(args);

    expect(result.isError).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it('surfaces an unavailable media result as an MCP error', async () => {
    add.mockResolvedValueOnce(callUnavailable('media'));

    const result = await addTool.handler({ mediaType: 'movie', mediaId: 3 });

    expect(result.isError).toBe(true);
  });

  it('names the required service-account scope on an authorization refusal', async () => {
    add.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'media',
      message: 'This service account is not authorised for this operation.',
    });

    const result = await addTool.handler({ mediaType: 'movie', mediaId: 3 });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining("requires service-account scope 'media.watchlist.add'"),
    });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining("presents to 'media'"),
    });
  });

  it('is registered in allTools as a scoped write', () => {
    const registered = allTools.find((tool) => tool.name === 'media.watchlist.add');

    expect(registered?.readOnly).toBe(false);
    expect(registered?.scope).toBe('media.watchlist.add');
  });
});
