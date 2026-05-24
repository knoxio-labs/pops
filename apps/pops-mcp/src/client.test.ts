import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@trpc/client', () => ({
  createTRPCClient: vi.fn(() => ({ _tag: 'trpc-client' })),
  httpBatchLink: vi.fn((opts: { url: string; headers: () => Record<string, string> }) => opts),
}));

import { createTRPCClient, httpBatchLink } from '@trpc/client';

describe('getClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset env
    delete process.env['POPS_API_URL'];
    delete process.env['POPS_API_KEY'];
  });

  afterEach(() => {
    delete process.env['POPS_API_URL'];
    delete process.env['POPS_API_KEY'];
  });

  it('throws when POPS_API_KEY is not set', async () => {
    const { getClient } = await import('./client.js');
    expect(() => getClient()).toThrow('POPS_API_KEY is required');
  });

  it('creates a client with the configured API URL and key', async () => {
    process.env['POPS_API_URL'] = 'http://pops.local:3000';
    process.env['POPS_API_KEY'] = 'sa_test_key';

    const { getClient } = await import('./client.js');
    getClient();

    expect(httpBatchLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://pops.local:3000/trpc' })
    );
  });

  it('defaults API URL to http://localhost:3000 when not set', async () => {
    process.env['POPS_API_KEY'] = 'sa_test_key';

    const { getClient } = await import('./client.js');
    getClient();

    expect(httpBatchLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:3000/trpc' })
    );
  });

  it('returns the same instance on repeated calls (memoization)', async () => {
    process.env['POPS_API_KEY'] = 'sa_test_key';

    const { getClient } = await import('./client.js');
    const a = getClient();
    const b = getClient();

    expect(a).toBe(b);
    expect(createTRPCClient).toHaveBeenCalledTimes(1);
  });

  it('injects x-api-key header from env', async () => {
    process.env['POPS_API_KEY'] = 'sa_secret';

    const { getClient } = await import('./client.js');
    getClient();

    const linkCall = (httpBatchLink as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      headers: () => Record<string, string>;
    };
    expect(linkCall.headers()).toEqual({ 'x-api-key': 'sa_secret' });
  });
});
