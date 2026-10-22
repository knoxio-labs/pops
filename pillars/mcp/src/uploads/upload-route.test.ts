import { createHash } from 'node:crypto';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { INVENTORY_MEDIA_MAX_BYTES } from './inventory-media.js';
import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { Server } from 'node:http';

import type { UploadTokenStore } from './upload-tokens.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const SHA = createHash('sha256').update(JPEG).digest('hex');

let server: Server;
let baseUrl: string;
let tokens: UploadTokenStore;
let inventoryFetch: ReturnType<typeof vi.fn<typeof fetch>>;

function answer(status: number, body: unknown): void {
  inventoryFetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function mint(): string {
  const grant = tokens.mint();
  if (grant === undefined) throw new Error('store refused to mint');
  return grant.token;
}

async function put(
  token: string,
  body: Buffer
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/uploads/${token}`, {
    method: 'PUT',
    body: new Uint8Array(body),
  });
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) throw new Error('non-object body');
  return { status: response.status, json: Object.fromEntries(Object.entries(json)) };
}

beforeEach(async () => {
  tokens = createUploadTokenStore();
  inventoryFetch = vi.fn<typeof fetch>();
  answer(201, { sha256: SHA, alreadyStored: false });
  const errors = createPillarErrorHandlers({ pillar: 'mcp', logger: { error: vi.fn() } });
  const app = express();
  app.use(errors.requestId);
  app.use(express.json({ limit: '1mb' }));
  app.use(errors.bodyParser);
  app.use(
    '/uploads',
    createUploadRouter({
      tokens,
      media: {
        discovery: { lookup: () => Promise.resolve({ baseUrl: 'http://inventory-api:3002' }) },
        apiKey: () => 'sa_mcp',
        fetchImpl: inventoryFetch,
      },
    })
  );
  app.use(errors.notFound);
  app.use(errors.final);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no TCP address');
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('PUT /uploads/:token', () => {
  it('stores a JPEG in inventory and answers its sha256', async () => {
    const result = await put(mint(), JPEG);
    expect(result.status).toBe(201);
    expect(result.json).toMatchObject({
      sha256: SHA,
      alreadyStored: false,
      byteSize: JPEG.length,
      contentType: 'image/jpeg',
    });
    expect(inventoryFetch).toHaveBeenCalledTimes(1);
    expect(inventoryFetch.mock.calls[0]?.[0]).toBe(`http://inventory-api:3002/media/${SHA}`);
  });

  it('refuses a second use of the same URL without calling inventory again', async () => {
    const token = mint();
    expect((await put(token, JPEG)).status).toBe(201);
    const replay = await put(token, JPEG);
    expect(replay.status).toBe(404);
    expect(replay.json['code']).toBe('mcp.upload.not_found');
    expect(inventoryFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown token', async () => {
    const result = await put('made-up', JPEG);
    expect(result.status).toBe(404);
    expect(result.json['code']).toBe('mcp.upload.not_found');
    expect(inventoryFetch).not.toHaveBeenCalled();
  });

  it('refuses a non-JPEG/HEIC file and spends the token', async () => {
    const token = mint();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const result = await put(token, png);
    expect(result.status).toBe(415);
    expect(result.json['code']).toBe('mcp.upload.unsupported_media_type');
    expect(inventoryFetch).not.toHaveBeenCalled();
    expect(tokens.consume(token)).toBe(false);
  });

  it('refuses an empty body', async () => {
    const result = await put(mint(), Buffer.alloc(0));
    expect(result.status).toBe(400);
    expect(result.json['code']).toBe('mcp.upload.empty_body');
  });

  it('refuses a body over the inventory media cap before calling inventory', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(INVENTORY_MEDIA_MAX_BYTES)]);
    const response = await fetch(`${baseUrl}/uploads/${mint()}`, {
      method: 'PUT',
      body: new Uint8Array(big),
    });
    expect(response.status).toBe(413);
    expect(inventoryFetch).not.toHaveBeenCalled();
  });

  it('surfaces an inventory decode refusal as a 400 with its reason', async () => {
    answer(415, { code: 'inventory.media.unsupported_media_type', message: 'cannot decode' });
    const result = await put(mint(), JPEG);
    expect(result.status).toBe(400);
    expect(result.json).toMatchObject({
      code: 'mcp.upload.rejected',
      details: { status: 415, reason: 'cannot decode' },
    });
  });

  it('answers 502 when inventory fails', async () => {
    answer(500, { message: 'disk full' });
    const result = await put(mint(), JPEG);
    expect(result.status).toBe(502);
    expect(result.json).toMatchObject({
      code: 'mcp.upload.upstream_unavailable',
      retryable: true,
      details: { reason: 'disk full' },
    });
  });
});
