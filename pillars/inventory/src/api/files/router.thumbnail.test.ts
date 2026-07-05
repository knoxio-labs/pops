/**
 * Tests for the inventory pillar's Paperless-ngx thumbnail proxy route.
 * Since ADR-039 workstream 13, this route no longer embeds a
 * `PaperlessClient` — it resolves the `documents` bridge pillar's
 * `baseUrl` via pillar discovery and proxies bytes from its
 * `GET /documents/:id/thumbnail` raw route. Both the discovery lookup and
 * the proxied fetch are injected here so no registry or real Paperless
 * instance is needed.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createInventoryFilesRouter } from './router.js';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';

function documentsSnapshot(baseUrl = 'http://documents-api:3012'): PillarSnapshot {
  return {
    pillarId: 'documents',
    baseUrl,
    manifest: {
      pillar: 'documents',
      version: '0.1.0',
      contract: { package: '@pops/documents', version: '0.1.0', tag: 'contract-documents@v0.1.0' },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
    },
    registered: true,
    lastSeenAt: new Date(),
    status: 'healthy',
  };
}

function app(
  lookupDocumentsPillar: () => Promise<PillarSnapshot | undefined>,
  fetchImpl: typeof fetch
): Express {
  const a = express();
  a.use(createInventoryFilesRouter({ lookupDocumentsPillar, fetchImpl }));
  return a;
}

describe('GET /inventory/documents/:id/thumbnail', () => {
  it('returns 400 for a non-numeric id', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/abc/thumbnail'
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid document id');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 503 when the documents pillar is not registered', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(app(() => Promise.resolve(undefined), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('not available');
  });

  it('returns 503 when pillar discovery throws (registry unreachable)', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const lookup = () => Promise.reject(new Error('registry unreachable'));
    const res = await request(app(lookup, fetchImpl)).get('/inventory/documents/42/thumbnail');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('not available');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 502 when the documents pillar is unreachable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Failed to reach');
  });

  it('returns 504 when the proxied fetch times out', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );
    expect(res.status).toBe(504);
    expect(res.body.error).toContain('timed out');
  });

  it('proxies the thumbnail image on success', async () => {
    const bytes = Buffer.from('fake-image-data');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { 'content-type': 'image/webp' } })
      );

    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://documents-api:3012/documents/42/thumbnail',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('defaults content-type to image/png when the header is missing', async () => {
    const bytes = Buffer.from('fake-png-data');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes, { status: 200 }));

    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('returns 404 when the document is not in Paperless', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/999/thumbnail'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Document not found');
  });

  it('returns 503 when the documents pillar reports Paperless is not configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('not configured');
  });

  it('returns 502 on other upstream errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    const res = await request(app(() => Promise.resolve(documentsSnapshot()), fetchImpl)).get(
      '/inventory/documents/42/thumbnail'
    );
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Failed to fetch thumbnail from the documents pillar');
  });
});
