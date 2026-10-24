// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { connectionsGateway } from './api';

const originalFetch = globalThis.fetch;
afterEach(() => client.setConfig({ baseUrl: '/contacts-api', fetch: originalFetch }));

function intercept(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return respond(request);
  });
  client.setConfig({ baseUrl: 'http://contacts.test/contacts-api', fetch: fetcher });
  return requests;
}

describe('provider generated HTTP binding', () => {
  it('returns a validated 201 Location for explicit navigation and forbids fetch redirects', async () => {
    const requests = intercept(
      () =>
        new Response(null, {
          status: 201,
          headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth' },
        })
    );
    await expect(connectionsGateway.authorize(undefined, false)).resolves.toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.redirect).toBe('error');
    expect(await requests[0]?.json()).toEqual({ includeOtherContacts: false });
  });
  it('sends the existing identity and extra permission only when explicitly requested', async () => {
    const requests = intercept(
      () =>
        new Response(null, {
          status: 201,
          headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth' },
        })
    );
    await connectionsGateway.authorize('existing-account', true);
    expect(await requests[0]?.json()).toEqual({
      accountId: 'existing-account',
      includeOtherContacts: true,
    });
  });
  it.each([undefined, 'javascript:alert(1)', 'https://unrelated.example.test/'])(
    'rejects an absent or unsafe authorization location: %s',
    async (location) => {
      intercept(
        () => new Response(null, { status: 201, headers: location ? { Location: location } : {} })
      );
      await expect(connectionsGateway.authorize(undefined, false)).rejects.toMatchObject({
        messageKey: 'invalidResponse',
      });
    }
  );
  it('joins optional source labels while preserving separate latest and completed run IDs', async () => {
    intercept((request) =>
      Response.json(
        request.url.endsWith('/providers/accounts')
          ? [
              {
                accountId: 'account',
                provider: 'google',
                connected: true,
                reauthorizationRequired: false,
                includeOtherContacts: false,
                latestRunId: 'failed-run',
                previewRunId: 'ready-run',
              },
            ]
          : { data: [{ id: 'account', label: 'Fictional address book' }] }
      )
    );
    await expect(connectionsGateway.list()).resolves.toMatchObject([
      {
        accountId: 'account',
        label: 'Fictional address book',
        latestRunId: 'failed-run',
        previewRunId: 'ready-run',
      },
    ]);
  });
  it('accepts a bodyless disconnect without issuing any person deletion', async () => {
    const requests = intercept(() => new Response(null, { status: 204 }));
    await connectionsGateway.disconnect('account');
    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
      ['DELETE', '/contacts-api/providers/accounts/account'],
    ]);
  });
  it('does not expose raw provider failures or automatically follow them into another operation', async () => {
    const requests = intercept(() =>
      Response.json({ message: 'fictional-private-diagnostic' }, { status: 503 })
    );
    await expect(connectionsGateway.authorize(undefined, false)).rejects.toMatchObject({
      messageKey: 'service',
      diagnostic: 'contacts.http.503',
    });
    expect(requests).toHaveLength(1);
  });
  it('rejects a sync response without a real run ID', async () => {
    intercept(() => Response.json({ accountId: 'account', runId: null }, { status: 202 }));
    await expect(connectionsGateway.start('account')).rejects.toMatchObject({
      messageKey: 'invalidResponse',
    });
  });
  it('uses connection recovery copy for provider conflicts without treating them as review decisions', async () => {
    intercept(() => Response.json({ message: 'fictional-private-account' }, { status: 409 }));
    await expect(connectionsGateway.authorize('existing-account', false)).rejects.toMatchObject({
      messageKey: 'providerChanged',
      diagnostic: 'contacts.http.409',
    });
  });
});
