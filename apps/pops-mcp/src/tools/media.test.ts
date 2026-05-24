import { describe, expect, it, vi } from 'vitest';

import { mockClient } from './test-helpers.js';

vi.mock('../client.js', () => ({ getClient: () => mockClient }));

const { mediaTools } = await import('./media.js');

describe('media.library.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.library.list')!;

  it('defaults type to "all" when not provided', async () => {
    await tool.handler({});
    expect(mockClient.media.library.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all' })
    );
  });

  it('passes movie filter through', async () => {
    await tool.handler({ type: 'movie', search: 'godfather' });
    expect(mockClient.media.library.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'movie', search: 'godfather' })
    );
  });

  it('ignores invalid type values and falls back to "all"', async () => {
    await tool.handler({ type: 'podcast' });
    expect(mockClient.media.library.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all' })
    );
  });
});

describe('media.watchlist.list', () => {
  const tool = mediaTools.find((t) => t.name === 'media.watchlist.list')!;

  it('passes mediaType filter', async () => {
    await tool.handler({ mediaType: 'movie' });
    expect(mockClient.media.watchlist.list.query).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'movie' })
    );
  });

  it('ignores invalid mediaType values', async () => {
    await tool.handler({ mediaType: 'podcast' });
    const call = mockClient.media.watchlist.list.query.mock.lastCall?.[0];
    expect((call as Record<string, unknown>)['mediaType']).toBeUndefined();
  });
});
