import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createTagsClient, type TagsRouter } from '../client.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

const TAG = {
  id: '00000000-0000-4000-8000-000000000001',
  facet: 'trip',
  name: 'Japan trip',
  archived: false,
  mergedIntoId: null,
};

function handleReturning(result: CallResult<unknown>): {
  handle: PillarHandle<TagsRouter>;
  list: ReturnType<typeof vi.fn>;
} {
  const list = vi.fn(async () => result);
  const handle = fakePillarHandle<TagsRouter>('tags', { tags: { list } });
  return { handle, list };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTagsClient', () => {
  it('requests archived rows too so they replace active entries in the local cache', async () => {
    const { handle, list } = handleReturning({ kind: 'ok', value: { tags: [TAG] } });

    await expect(createTagsClient(() => handle).fetchAll()).resolves.toEqual({
      kind: 'ok',
      tags: [TAG],
    });
    expect(list).toHaveBeenCalledWith({ includeArchived: 'true' });
  });

  it('reports an authorization refusal separately from an unavailable tags pillar', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handle } = handleReturning({ kind: 'unauthorized', pillar: 'tags' });

    await expect(createTagsClient(() => handle).fetchAll()).resolves.toEqual({
      kind: 'unauthorized',
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("tags rejected this pillar's service-account credential")
    );
  });

  it('reports transport failures as unavailable', async () => {
    const { handle } = handleReturning({ kind: 'unavailable', pillar: 'tags' });

    await expect(createTagsClient(() => handle).fetchAll()).resolves.toEqual({
      kind: 'unavailable',
      reason: 'unavailable',
    });
  });

  it('does not make an anonymous call when the service-account credential is absent', async () => {
    const handleFactory = vi.fn(() => null);

    await expect(createTagsClient(handleFactory).fetchAll()).resolves.toEqual({
      kind: 'no-credential',
    });
    expect(handleFactory).toHaveBeenCalledOnce();
  });

  it('reports a thrown request as unavailable', async () => {
    const list = vi.fn(async () => {
      throw new Error('offline');
    });
    const handle = fakePillarHandle<TagsRouter>('tags', { tags: { list } });

    await expect(createTagsClient(() => handle).fetchAll()).resolves.toEqual({
      kind: 'unavailable',
      reason: 'request-failed',
    });
  });

  it('refuses a malformed response rather than returning a partial vocabulary', async () => {
    const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = handleReturning({ kind: 'ok', value: { tags: [{ ...TAG, archived: 0 }] } });

    await expect(createTagsClient(() => handle).fetchAll()).resolves.toEqual({
      kind: 'unavailable',
      reason: 'contract-mismatch',
    });
    expect(warningLog).toHaveBeenCalledWith(
      expect.stringContaining('tags.tags.list returned an unreadable response')
    );
  });
});
