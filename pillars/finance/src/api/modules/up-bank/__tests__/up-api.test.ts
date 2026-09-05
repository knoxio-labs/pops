import { describe, expect, it, vi } from 'vitest';

import { createUpBankClient, UpBankApiError, UpBankAuthError } from '../up-api.js';
import { upAccount, upTransaction } from './fixtures.js';

interface Recorded {
  url: URL;
  headers: Record<string, string>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch that answers by path, recording what it was asked. */
function fakeFetch(routes: Record<string, (url: URL) => Response>) {
  const calls: Recorded[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    const route = routes[url.pathname];
    if (route === undefined) return jsonResponse({ errors: [] }, 404);
    return route(url);
  };
  return { fetchImpl, calls };
}

const BASE = 'https://up.test/api/v1';

describe('createUpBankClient', () => {
  it('sends the bearer token and the page size, and follows links.next to the end', async () => {
    const page2 = `${BASE}/accounts/up-acc-1/transactions?page%5Bafter%5D=cursor-2`;
    const { fetchImpl, calls } = fakeFetch({
      '/api/v1/accounts/up-acc-1/transactions': (url) =>
        url.searchParams.get('page[after]') === 'cursor-2'
          ? jsonResponse({ data: [upTransaction({ id: 'b' })], links: { next: null } })
          : jsonResponse({ data: [upTransaction({ id: 'a' })], links: { next: page2 } }),
    });
    const client = createUpBankClient({ token: 'tok', fetchImpl, baseUrl: BASE, pageSize: 1 });

    const rows = await client.listTransactions('up-acc-1', {
      since: '2026-08-31T00:00:00Z',
      until: '2026-09-03T00:00:00Z',
    });

    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers['Authorization']).toBe('Bearer tok');
    expect(calls[0]?.url.searchParams.get('page[size]')).toBe('1');
    expect(calls[0]?.url.searchParams.get('filter[since]')).toBe('2026-08-31T00:00:00Z');
    expect(calls[0]?.url.searchParams.get('filter[until]')).toBe('2026-09-03T00:00:00Z');
    expect(calls[1]?.url.toString()).toBe(page2);
  });

  it('reads one account and lists them', async () => {
    const { fetchImpl } = fakeFetch({
      '/api/v1/accounts': () => jsonResponse({ data: [upAccount()], links: { next: null } }),
      '/api/v1/accounts/up-acc-1': () => jsonResponse({ data: upAccount() }),
    });
    const client = createUpBankClient({ token: 'tok', fetchImpl, baseUrl: BASE });

    expect((await client.getAccount('up-acc-1')).attributes.balance.valueInBaseUnits).toBe(48_800);
    expect((await client.listAccounts()).map((a) => a.attributes.displayName)).toEqual([
      'Up Everyday',
    ]);
  });

  it('answers ping with the customer id', async () => {
    const { fetchImpl } = fakeFetch({
      '/api/v1/util/ping': () => jsonResponse({ meta: { id: 'cust-1', statusEmoji: '⚡' } }),
    });
    const client = createUpBankClient({ token: 'tok', fetchImpl, baseUrl: BASE });
    expect(await client.ping()).toEqual({ customerId: 'cust-1' });
  });

  it('raises the auth error on 401 and the generic one on any other failure', async () => {
    const { fetchImpl } = fakeFetch({
      '/api/v1/util/ping': () => jsonResponse({ errors: [] }, 401),
      '/api/v1/accounts/up-acc-1': () => jsonResponse({ errors: [] }, 503),
    });
    const client = createUpBankClient({ token: 'bad', fetchImpl, baseUrl: BASE });

    await expect(client.ping()).rejects.toBeInstanceOf(UpBankAuthError);
    await expect(client.getAccount('up-acc-1')).rejects.toMatchObject({
      name: 'UpBankApiError',
      status: 503,
    });
    await expect(client.getAccount('up-acc-1')).rejects.toBeInstanceOf(UpBankApiError);
  });

  it('refuses a resource that is not in the recorded shape rather than mapping garbage', async () => {
    const { fetchImpl } = fakeFetch({
      '/api/v1/accounts/up-acc-1': () =>
        jsonResponse({ data: { id: 'up-acc-1', attributes: { displayName: 'x' } } }),
    });
    const client = createUpBankClient({ token: 'tok', fetchImpl, baseUrl: BASE });
    await expect(client.getAccount('up-acc-1')).rejects.toThrow();
  });

  it('uses the global fetch when none is injected', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ meta: { id: 'cust-9', statusEmoji: '⚡' } }));
    try {
      const client = createUpBankClient({ token: 'tok' });
      expect(await client.ping()).toEqual({ customerId: 'cust-9' });
      expect(String(spy.mock.calls[0]?.[0])).toBe('https://api.up.com.au/api/v1/util/ping');
    } finally {
      spy.mockRestore();
    }
  });
});
