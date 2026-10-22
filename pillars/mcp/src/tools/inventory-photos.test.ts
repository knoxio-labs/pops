import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  callOk,
  callUnavailable,
  mockPillarInventory,
  parseResult,
  pillarMockGetter,
} from './test-helpers.js';

vi.mock('../pillar-client.js', () => ({ getPillar: pillarMockGetter }));

const { photoTools } = await import('./inventory-photos.js');
const { uploadTokens } = await import('../uploads/upload-tokens.js');

function tool(name: string): (typeof photoTools)[number] {
  const found = photoTools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`${name} is not registered`);
  return found;
}

const createUpload = tool('inventory.photos.createUpload');
const attachPhoto = tool('inventory.items.attachPhoto');
const removePhoto = tool('inventory.items.removePhoto');

const inventory = mockPillarInventory.inventory;
const SHA = 'a'.repeat(64);
const MUTATION_ID = '30000000-0000-4000-8000-000000000001';
const applied = {
  mutationId: MUTATION_ID,
  status: 'applied',
  revision: 4,
  seq: 9,
  converged: true,
};

function itemWithPhotos(count: number): ReturnType<typeof callOk> {
  return callOk({
    item: {
      id: 'lamp',
      revision: 3,
      photos: Array.from({ length: count }, (_, i) => ({
        sha256: String(i).repeat(64),
        caption: null,
      })),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  inventory.sync.mutations.mockResolvedValue(callOk({ outcomes: [applied], highWaterSeq: 9 }));
  inventory.web.get.mockResolvedValue(itemWithPhotos(2));
});

describe('inventory.photos.createUpload', () => {
  it('returns a single-use URL on the gateway origin and a curl command for it', async () => {
    const result = await createUpload.handler({}, { publicBaseUrl: 'http://pops.local:3011' });
    expect(result.isError).toBeFalsy();
    const body = z
      .object({ uploadUrl: z.string(), command: z.string(), maxBytes: z.number() })
      .parse(parseResult(result));
    const match = /^http:\/\/pops\.local:3011\/uploads\/([A-Za-z0-9_-]{43})$/u.exec(body.uploadUrl);
    expect(match).not.toBeNull();
    expect(body.command).toBe(`curl --fail-with-body -sS -T <path-to-image> '${body.uploadUrl}'`);
    expect(body.maxBytes).toBe(8 * 1024 * 1024);
    const token = match?.[1] ?? '';
    expect(uploadTokens.consume(token)).toBe(true);
    expect(uploadTokens.consume(token)).toBe(false);
  });

  it('refuses without a known public address and mints nothing', async () => {
    const mint = vi.spyOn(uploadTokens, 'mint');
    const result = await createUpload.handler({});
    expect(result.isError).toBe(true);
    expect(mint).not.toHaveBeenCalled();
    mint.mockRestore();
  });

  it('reports when too many URLs are outstanding', async () => {
    const mint = vi.spyOn(uploadTokens, 'mint').mockReturnValueOnce(undefined);
    const result = await createUpload.handler({}, { publicBaseUrl: 'http://pops.local:3011' });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('Too many') });
    mint.mockRestore();
  });

  it('declares the media upload scope', () => {
    expect(createUpload.scope).toBe('inventory.media.upload');
  });
});

describe('inventory.items.attachPhoto', () => {
  it('appends after the current photos when no position is given', async () => {
    const result = await attachPhoto.handler({ id: 'lamp', sha256: SHA, mutationId: MUTATION_ID });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual({ itemId: 'lamp', outcome: applied });
    expect(inventory.web.get).toHaveBeenCalledWith({ id: 'lamp' });
    expect(inventory.sync.mutations.mock.calls[0]?.[0]).toEqual({
      mutations: [
        {
          mutationId: MUTATION_ID,
          entityId: 'lamp',
          op: 'item.attachPhoto',
          args: { sha256: SHA, position: 2 },
          baseRevision: null,
          dependsOn: [],
          clientTime: expect.any(String),
        },
      ],
    });
  });

  it('uses an explicit position, including 0, without reading the item', async () => {
    await attachPhoto.handler({ id: 'lamp', sha256: SHA, position: 0 });
    expect(inventory.web.get).not.toHaveBeenCalled();
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      args: { sha256: SHA, position: 0 },
      mutationId: expect.any(String),
    });
  });

  it.each([
    { id: '' },
    { id: undefined },
    { sha256: undefined },
    { sha256: 'A'.repeat(64) },
    { sha256: 'a'.repeat(63) },
    { position: -1 },
    { position: 1.5 },
    { position: '1' },
    { mutationId: 'nope' },
  ])('rejects %j before calling inventory', async (patch) => {
    const result = await attachPhoto.handler({ id: 'lamp', sha256: SHA, ...patch });
    expect(result.isError).toBe(true);
    expect(inventory.web.get).not.toHaveBeenCalled();
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('does not attach when the item cannot be read for an append', async () => {
    inventory.web.get.mockResolvedValueOnce(callUnavailable('inventory'));
    const result = await attachPhoto.handler({ id: 'lamp', sha256: SHA });
    expect(result.isError).toBe(true);
    expect(inventory.sync.mutations).not.toHaveBeenCalled();
  });

  it('returns media_missing as a tool error', async () => {
    const rejected = {
      mutationId: MUTATION_ID,
      status: 'rejected',
      reason: 'media_missing',
      message: `media ${SHA} is not stored`,
    };
    inventory.sync.mutations.mockResolvedValueOnce(
      callOk({ outcomes: [rejected], highWaterSeq: 9 })
    );
    const result = await attachPhoto.handler({ id: 'lamp', sha256: SHA, position: 0 });
    expect(result.isError).toBe(true);
    expect(parseResult(result)).toEqual({ itemId: 'lamp', outcome: rejected });
  });
});

describe('inventory.items.removePhoto', () => {
  it('sends item.removePhoto with the hash and no base revision', async () => {
    const result = await removePhoto.handler({ id: 'lamp', sha256: SHA, mutationId: MUTATION_ID });
    expect(result.isError).toBeFalsy();
    expect(inventory.sync.mutations.mock.calls[0]?.[0].mutations[0]).toMatchObject({
      mutationId: MUTATION_ID,
      entityId: 'lamp',
      op: 'item.removePhoto',
      args: { sha256: SHA },
      baseRevision: null,
    });
  });

  it.each([{ id: '' }, { sha256: 'xyz' }, { mutationId: 'nope' }])(
    'rejects %j before calling inventory',
    async (patch) => {
      const result = await removePhoto.handler({ id: 'lamp', sha256: SHA, ...patch });
      expect(result.isError).toBe(true);
      expect(inventory.sync.mutations).not.toHaveBeenCalled();
    }
  );
});
