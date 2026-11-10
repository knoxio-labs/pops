// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { duplicateMergeGateway } from './api';

const originalFetch = globalThis.fetch;
afterEach(() => client.setConfig({ baseUrl: '/contacts-api', fetch: originalFetch }));

function intercept(respond: (request: Request) => Response) {
  const requests: Request[] = [];
  client.setConfig({
    baseUrl: 'http://contacts.test/contacts-api',
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      return respond(request);
    }),
  });
  return requests;
}

const person = {
  id: 'person-1',
  name: 'Alex Smith',
  type: 'person',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};

it('loads source records and their contact points from person-only routes', async () => {
  const requests = intercept((request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith('/contact-points')) return Response.json({ data: [] });
    if (pathname.endsWith('/sources')) return Response.json({ data: [] });
    if (pathname.endsWith('/sources/accounts')) return Response.json({ data: [] });
    return Response.json({ data: person });
  });
  expect(await duplicateMergeGateway.load(person.id)).toEqual({
    entity: person,
    points: [],
    sources: [],
    accounts: [],
  });
  expect(requests).toHaveLength(4);
});

it('does not constrain generic merges to person source contracts', async () => {
  const company = { ...person, id: 'company-1', type: 'company' };
  const requests = intercept((request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith('/contact-points')) return Response.json({ data: [] });
    return Response.json({ data: company });
  });
  const snapshot = await duplicateMergeGateway.load(company.id);
  expect(snapshot).toEqual({ entity: company, points: [], sources: [], accounts: [] });
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/contacts-api/entities/company-1',
    '/contacts-api/entities/company-1/contact-points',
  ]);
});

it('submits only explicit roots, user evidence, fresh directory revision and idempotency key', async () => {
  const requests = intercept((request) => {
    if (new URL(request.url).pathname.endsWith('/entities/resolve')) {
      return Response.json({
        data: [
          { id: 'keep', canonicalId: 'keep' },
          { id: 'merge', canonicalId: 'merge' },
        ],
        revision: 7,
      });
    }
    return Response.json({
      data: { canonicalId: 'keep', memberIds: ['keep', 'merge'], operationId: 'op-1', revision: 8 },
    });
  });
  await duplicateMergeGateway.merge(
    'keep',
    'merge',
    'Same person confirmed after source review',
    'request-1'
  );
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/contacts-api/entities/resolve',
    '/contacts-api/merges',
  ]);
  expect(await requests[1]?.json()).toEqual({
    canonicalId: 'keep',
    memberIds: ['merge'],
    expectedRevision: 7,
    idempotencyKey: 'request-1',
    evidence: 'Same person confirmed after source review',
  });
});

it('refuses a stale selection after identity resolution and does not send a merge', async () => {
  const requests = intercept(() =>
    Response.json({
      data: [
        { id: 'keep', canonicalId: 'keep' },
        { id: 'merge', canonicalId: 'keep' },
      ],
      revision: 8,
    })
  );
  await expect(
    duplicateMergeGateway.merge('keep', 'merge', 'Confirmed', 'request-2')
  ).rejects.toThrow();
  expect(requests).toHaveLength(1);
});
