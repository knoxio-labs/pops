import { createHash } from 'node:crypto';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { INVENTORY_MEDIA_MAX_BYTES } from './inventory-media.js';
import { createUploadRouter } from './upload-route.js';
import { createUploadTokenStore } from './upload-tokens.js';

import type { Server } from 'node:http';

import type { DocumentUploadTarget, UploadTokenStore } from './upload-tokens.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const SHA = createHash('sha256').update(JPEG).digest('hex');

let server: Server;
let baseUrl: string;
let tokens: UploadTokenStore;
let inventoryFetch: ReturnType<typeof vi.fn<typeof fetch>>;
let documentFetch: ReturnType<typeof vi.fn<typeof fetch>>;
let now: number;

function answer(status: number, body: unknown): void {
  inventoryFetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function mint(): string {
  const grant = tokens.mint({ kind: 'photo' });
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
  now = 1_000_000;
  tokens = createUploadTokenStore(() => now);
  inventoryFetch = vi.fn<typeof fetch>();
  documentFetch = vi.fn<typeof fetch>();
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
      documents: {
        discovery: { lookup: () => Promise.resolve({ baseUrl: 'http://inventory-api:3002' }) },
        apiKey: () => 'sa_mcp',
        fetchImpl: documentFetch,
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
    expect(tokens.consume(token)).toBeUndefined();
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

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)]);
const INGESTION = {
  id: 7,
  itemId: 'item_1',
  taskId: 'task-1',
  documentType: 'receipt',
  title: 'Till receipt',
  fileName: 'receipt.pdf',
  state: 'pending',
  reason: null,
  createdAt: '2026-10-23T00:00:00.000Z',
};

const DOCUMENT: DocumentUploadTarget = {
  kind: 'document',
  itemId: 'item 1',
  documentType: 'receipt',
  fileName: 'receipt.pdf',
  title: 'Till receipt',
  maxBytes: 1024,
  allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
};

function mintDocument(overrides: Partial<DocumentUploadTarget> = {}): string {
  const grant = tokens.mint({ ...DOCUMENT, ...overrides });
  if (grant === undefined) throw new Error('store refused to mint');
  return grant.token;
}

/** Inventory's upload route: reads the whole streamed body, then answers. */
function inventoryAnswers(status: number, body: unknown): { received: () => Buffer } {
  let received = Buffer.alloc(0);
  documentFetch.mockImplementation(async (_url, init) => {
    received = Buffer.from(await new Response(init?.body).arrayBuffer());
    return new Response(JSON.stringify(body), { status });
  });
  return { received: () => received };
}

async function putDocument(
  token: string,
  body: Buffer | ReadableStream<Uint8Array>,
  headers: Record<string, string> = { 'content-type': 'application/pdf' }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'PUT',
    headers,
    body: body instanceof ReadableStream ? body : new Uint8Array(body),
    duplex: 'half',
  };
  const response = await fetch(`${baseUrl}/uploads/${token}`, init);
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null) throw new Error('non-object body');
  return { status: response.status, json: Object.fromEntries(Object.entries(json)) };
}

describe('PUT /uploads/:token for a document URL', () => {
  it('streams the file to inventory with its type, kind, name and title, and answers the ingestion', async () => {
    const inventory = inventoryAnswers(202, { data: INGESTION });
    const result = await putDocument(mintDocument(), PDF);

    expect(result.status).toBe(202);
    expect(result.json['ingestion']).toEqual(INGESTION);
    expect(documentFetch).toHaveBeenCalledTimes(1);
    const [url, init] = documentFetch.mock.calls[0] ?? [];
    expect(url).toBe(
      'http://inventory-api:3002/items/item%201/documents/upload?documentType=receipt&fileName=receipt.pdf&title=Till+receipt'
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'x-api-key': 'sa_mcp',
      'content-type': 'application/pdf',
      'content-length': String(PDF.length),
    });
    expect(inventory.received()).toEqual(PDF);
    expect(inventoryFetch).not.toHaveBeenCalled();
  });

  it('refuses a second use of the same URL without calling inventory again', async () => {
    inventoryAnswers(202, { data: INGESTION });
    const token = mintDocument();
    expect((await putDocument(token, PDF)).status).toBe(202);
    const replay = await putDocument(token, PDF);
    expect(replay.status).toBe(404);
    expect(replay.json['code']).toBe('mcp.upload.not_found');
    expect(documentFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses an expired URL', async () => {
    const token = mintDocument();
    now += 10 * 60_000;
    const result = await putDocument(token, PDF);
    expect(result.status).toBe(404);
    expect(result.json['code']).toBe('mcp.upload.not_found');
    expect(documentFetch).not.toHaveBeenCalled();
  });

  it('refuses a PDF sent to a photo URL, naming the document tool', async () => {
    const result = await put(mint(), PDF);
    expect(result.status).toBe(415);
    expect(String(result.json['message'])).toContain('inventory.documents.createUpload');
    expect(inventoryFetch).not.toHaveBeenCalled();
  });

  it('refuses a file documents does not accept, naming the photo tool', async () => {
    const result = await putDocument(mintDocument(), PDF, { 'content-type': 'application/zip' });
    expect(result.status).toBe(415);
    expect(result.json['code']).toBe('mcp.upload.unsupported_document_type');
    expect(String(result.json['message'])).toContain('inventory.photos.createUpload');
    expect(documentFetch).not.toHaveBeenCalled();
  });

  it('refuses a document with no Content-Type', async () => {
    const result = await putDocument(mintDocument(), PDF, {});
    expect(result.status).toBe(415);
    expect(result.json['code']).toBe('mcp.upload.missing_content_type');
    expect(documentFetch).not.toHaveBeenCalled();
  });

  it('accepts an image when documents allows image types', async () => {
    inventoryAnswers(202, { data: INGESTION });
    const result = await putDocument(mintDocument(), JPEG, { 'content-type': 'image/jpeg' });
    expect(result.status).toBe(202);
  });

  it('refuses a declared length over the minted cap before calling inventory', async () => {
    const result = await putDocument(mintDocument({ maxBytes: PDF.length - 1 }), PDF);
    expect(result.status).toBe(413);
    expect(result.json).toMatchObject({
      code: 'mcp.upload.too_large',
      details: { maxUploadBytes: PDF.length - 1 },
    });
    expect(documentFetch).not.toHaveBeenCalled();
  });

  it('cuts off a chunked body once it passes the cap', async () => {
    inventoryAnswers(202, { data: INGESTION });
    const chunks = [PDF, PDF];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(new Uint8Array(next));
      },
    });
    const result = await putDocument(mintDocument({ maxBytes: PDF.length + 1 }), stream);
    expect(result.status).toBe(413);
    expect(result.json['code']).toBe('mcp.upload.too_large');
  });

  it("relays inventory's refusal with its own status and code", async () => {
    inventoryAnswers(413, {
      code: 'documents.upload.too_large',
      message: 'The file is larger than the upload limit.',
      requestId: 'req-1',
      retryable: false,
      details: { maxUploadBytes: 10 },
    });
    const result = await putDocument(mintDocument(), PDF);
    expect(result.status).toBe(413);
    expect(result.json).toMatchObject({
      code: 'documents.upload.too_large',
      details: { maxUploadBytes: 10 },
    });
  });

  it('relays an unknown item as a 404', async () => {
    inventoryAnswers(404, {
      code: 'inventory.documents.item_not_found',
      message: "Inventory item 'item 1' not found",
      requestId: 'req-1',
      retryable: false,
    });
    const result = await putDocument(mintDocument(), PDF);
    expect(result.status).toBe(404);
    expect(result.json['code']).toBe('inventory.documents.item_not_found');
  });

  it('answers 502 when inventory fails unexpectedly', async () => {
    inventoryAnswers(500, { message: 'boom' });
    const result = await putDocument(mintDocument(), PDF);
    expect(result.status).toBe(502);
    expect(result.json['code']).toBe('mcp.upload.upstream_unavailable');
  });

  it("answers 502 when inventory refuses the gateway's credential", async () => {
    inventoryAnswers(403, {
      code: 'inventory.auth.forbidden',
      message: 'no',
      requestId: 'r',
      retryable: false,
    });
    const result = await putDocument(mintDocument(), PDF);
    expect(result.status).toBe(502);
    expect(result.json).toMatchObject({
      details: { reason: expect.stringContaining('inventory.documents.upload') },
    });
  });
});
