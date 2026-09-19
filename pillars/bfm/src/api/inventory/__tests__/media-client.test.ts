/**
 * `createMobileInventoryMediaClient` in isolation: discovery and `fetch`
 * both faked, so this suite proves the HTTP mapping without a network — the
 * `api/__tests__/mobile-inventory.test.ts` suite proves the same client
 * wired into the real app.
 */
import { describe, expect, it } from 'vitest';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createMobileInventoryMediaClient } from '../media-client.js';

const SHA256 = 'b'.repeat(64);
const BASE_URL = 'https://inventory.internal.test';
const KEY = 'pops_sa_test_key';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Uint8Array | undefined;
}

function fakeFetch(
  handler: (req: CapturedRequest) => { status: number; body: string; contentType?: string }
): { fetchImpl: typeof fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers !== undefined) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key.toLowerCase()] = value;
      }
    }
    const captured: CapturedRequest = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : new Uint8Array(init.body as ArrayBuffer),
    };
    calls.push(captured);
    const answer = handler(captured);
    return new Response(answer.body, {
      status: answer.status,
      headers: answer.contentType === undefined ? {} : { 'content-type': answer.contentType },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function clientWith(
  handler: Parameters<typeof fakeFetch>[0],
  options: { discoverable?: boolean; hasKey?: boolean } = {}
) {
  const { fetchImpl, calls } = fakeFetch(handler);
  const discoverable = options.discoverable ?? true;
  const hasKey = options.hasKey ?? true;
  const client = createMobileInventoryMediaClient({
    fetchImpl,
    apiKey: () => (hasKey ? KEY : undefined),
    discovery: {
      lookup: () => Promise.resolve(discoverable ? { baseUrl: BASE_URL } : undefined),
    },
  });
  return { client, calls };
}

describe('upload', () => {
  it('sends the service-account key, the bytes and the claimed content type', async () => {
    const { client, calls } = clientWith(() => ({
      status: 201,
      body: JSON.stringify({ sha256: SHA256, alreadyStored: false }),
    }));

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome).toEqual({ kind: 'ok', value: { sha256: SHA256, alreadyStored: false } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toBe(`${BASE_URL}/media/${SHA256}`);
    expect(calls[0]?.headers[SERVICE_ACCOUNT_HEADER]).toBe(KEY);
    expect(calls[0]?.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.from(calls[0]?.body ?? new Uint8Array()).toString()).toBe('bytes');
  });

  it('passes an alreadyStored answer through unchanged', async () => {
    const { client } = clientWith(() => ({
      status: 200,
      body: JSON.stringify({ sha256: SHA256, alreadyStored: true }),
    }));

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome).toEqual({ kind: 'ok', value: { sha256: SHA256, alreadyStored: true } });
  });

  it('maps a 415 to unsupported-media, not a generic failure', async () => {
    const { client } = clientWith(() => ({
      status: 415,
      body: JSON.stringify({ error: 'unsupported_media_type' }),
    }));

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome).toEqual({
      kind: 'unsupported-media',
      pillar: 'inventory',
      status: 415,
      detail: 'unsupported_media_type',
    });
  });

  it('maps a 400 (hash mismatch) to invalid-request, not upstream-unavailable', async () => {
    const { client } = clientWith(() => ({
      status: 400,
      body: JSON.stringify({ error: 'hash_mismatch' }),
    }));

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome).toEqual({
      kind: 'invalid-request',
      pillar: 'inventory',
      status: 400,
      detail: 'hash_mismatch',
    });
  });

  it('answers unavailable when inventory cannot be discovered', async () => {
    const { client } = clientWith(() => ({ status: 200, body: '{}' }), { discoverable: false });

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome).toEqual({
      kind: 'unavailable',
      pillar: 'inventory',
      status: 503,
      detail: undefined,
    });
  });

  it('answers unavailable rather than throwing when no service-account key is available', async () => {
    const { client, calls } = clientWith(() => ({ status: 200, body: '{}' }), { hasKey: false });

    const outcome = await client.upload({
      sha256: SHA256,
      mediaType: 'image/jpeg',
      bytes: Buffer.from('bytes'),
    });

    expect(outcome.kind).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });
});

describe('read', () => {
  it('fetches the bytes and reports the content type inventory answered', async () => {
    const { client, calls } = clientWith(() => ({
      status: 200,
      body: 'the bytes',
      contentType: 'image/jpeg',
    }));

    const outcome = await client.read({ sha256: SHA256, variant: 'thumb' });

    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.value.mediaType).toBe('image/jpeg');
      expect(outcome.value.bytes.toString()).toBe('the bytes');
    }
    expect(calls[0]?.url).toBe(`${BASE_URL}/media/${SHA256}?variant=thumb`);
    expect(calls[0]?.method).toBe('GET');
  });

  it('maps a 404 to not-found', async () => {
    const { client } = clientWith(() => ({
      status: 404,
      body: JSON.stringify({ error: 'media_not_found' }),
    }));

    const outcome = await client.read({ sha256: SHA256, variant: 'full' });

    expect(outcome).toEqual({
      kind: 'not-found',
      pillar: 'inventory',
      status: 404,
      detail: 'media_not_found',
    });
  });
});
