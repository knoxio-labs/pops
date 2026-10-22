import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { storeInventoryMedia } from './inventory-media.js';

import type { MediaStoreDeps } from './inventory-media.js';

const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const SHA = createHash('sha256').update(BYTES).digest('hex');

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
    )
  );
}

function deps(overrides: Partial<MediaStoreDeps> = {}): MediaStoreDeps {
  return {
    discovery: { lookup: () => Promise.resolve({ baseUrl: 'http://inventory-api:3002/' }) },
    apiKey: () => 'sa_mcp',
    fetchImpl: respond(201, { sha256: SHA, alreadyStored: false }),
    ...overrides,
  };
}

describe('storeInventoryMedia', () => {
  it('PUTs the bytes to /media/<sha256> with the service-account key and sniffed type', async () => {
    const fetchImpl = respond(201, { sha256: SHA, alreadyStored: false });
    const result = await storeInventoryMedia(BYTES, 'image/jpeg', deps({ fetchImpl }));

    expect(result).toEqual({ kind: 'stored', sha256: SHA, alreadyStored: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe(`http://inventory-api:3002/media/${SHA}`);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({ 'x-api-key': 'sa_mcp', 'content-type': 'image/jpeg' });
    expect(init?.body).toEqual(new Uint8Array(BYTES));
  });

  it('reports an already-stored blob as stored', async () => {
    const result = await storeInventoryMedia(
      BYTES,
      'image/jpeg',
      deps({ fetchImpl: respond(200, { sha256: SHA, alreadyStored: true }) })
    );
    expect(result).toEqual({ kind: 'stored', sha256: SHA, alreadyStored: true });
  });

  it.each([400, 413, 415])(
    'passes a %i refusal through as rejected with its message',
    async (status) => {
      const result = await storeInventoryMedia(
        BYTES,
        'image/jpeg',
        deps({ fetchImpl: respond(status, { code: 'inventory.media.x', message: 'nope' }) })
      );
      expect(result).toEqual({ kind: 'rejected', status, message: 'nope' });
    }
  );

  it.each([401, 403])('names the missing scope when inventory answers %i', async (status) => {
    const result = await storeInventoryMedia(
      BYTES,
      'image/jpeg',
      deps({ fetchImpl: respond(status, { message: 'forbidden' }) })
    );
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.message).toContain('inventory.media.upload');
  });

  it('treats a 5xx or an unreadable success body as unavailable', async () => {
    expect(
      await storeInventoryMedia(BYTES, 'image/jpeg', deps({ fetchImpl: respond(500, 'boom') }))
    ).toEqual({ kind: 'unavailable', message: 'inventory answered 500' });
    expect(
      (await storeInventoryMedia(BYTES, 'image/jpeg', deps({ fetchImpl: respond(201, '{}') }))).kind
    ).toBe('unavailable');
  });

  it('does not call inventory when it cannot be discovered or no key exists', async () => {
    const fetchImpl = respond(201, {});
    expect(
      await storeInventoryMedia(
        BYTES,
        'image/jpeg',
        deps({ fetchImpl, discovery: { lookup: () => Promise.resolve(undefined) } })
      )
    ).toEqual({ kind: 'unavailable', message: 'inventory is not discoverable' });
    expect(
      await storeInventoryMedia(BYTES, 'image/jpeg', deps({ fetchImpl, apiKey: () => undefined }))
    ).toEqual({ kind: 'unavailable', message: 'no service-account key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a network failure as unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await storeInventoryMedia(BYTES, 'image/heic', deps({ fetchImpl }))).toEqual({
      kind: 'unavailable',
      message: 'inventory did not answer',
    });
  });
});
