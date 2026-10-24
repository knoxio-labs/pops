import { describe, expect, it, vi } from 'vitest';

import { createContactsClient } from '../client.js';
import { ok, stubHandle, unexpected } from './stub-handle.js';

describe('contact canonical resolution boundary', () => {
  it('retains historical keys and explicit missing identities from the producer', async () => {
    const resolve = vi.fn(async ({ ids }: { ids: string[] }) =>
      ok({
        data: ids.map((id) => ({ id, canonicalId: id === 'missing' ? null : 'current' })),
        revision: 4,
      })
    );
    const client = createContactsClient(() =>
      stubHandle({ list: () => unexpected('list'), resolve })
    );
    expect(await client.resolveEntityIds(['old-a', 'old-b', 'missing'])).toEqual(
      new Map([
        ['old-a', 'current'],
        ['old-b', 'current'],
        ['missing', null],
      ])
    );
    expect(resolve).toHaveBeenCalledWith({ ids: ['old-a', 'old-b', 'missing'] });
  });

  it('returns unavailable when the directory refuses or returns incomplete coverage', async () => {
    const denied = createContactsClient(() =>
      stubHandle({
        list: () => unexpected('list'),
        resolve: async () => ({ kind: 'unauthorized', pillar: 'contacts', message: 'Refused' }),
      })
    );
    const incomplete = createContactsClient(() =>
      stubHandle({
        list: () => unexpected('list'),
        resolve: async () => ok({ data: [], revision: 0 }),
      })
    );
    for (const client of [denied, incomplete]) {
      await expect(client.resolveEntityIds(['old-a'])).rejects.toMatchObject({ statusCode: 503 });
    }
  });

  it('permits empty local snapshots without requiring a discovered contacts service', async () => {
    const client = createContactsClient(() => null);
    expect(await client.resolveEntityIds([])).toEqual(new Map());
    await expect(client.resolveEntityIds(['old-a'])).rejects.toMatchObject({ statusCode: 503 });
  });
});
