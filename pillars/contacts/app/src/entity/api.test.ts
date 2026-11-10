// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { contactGateway } from './api';

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

const entity = {
  id: 'business',
  name: 'Harbour Books',
  type: 'company',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
};

it('resolves the canonical entity and owner-published URI reference', async () => {
  const requests = intercept((request) =>
    new URL(request.url).pathname.endsWith('/reference')
      ? Response.json({ canonicalId: entity.id, uri: 'pops:contacts/contact/business' })
      : Response.json({ data: entity })
  );
  expect(await contactGateway.resolve(entity.id)).toEqual({
    entity,
    reference: { canonicalId: entity.id, uri: 'pops:contacts/contact/business' },
  });
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/contacts-api/entities/business/reference',
    '/contacts-api/entities/business',
  ]);
});

it('searches the published entity list and returns entities for explicit selection', async () => {
  const requests = intercept(() =>
    Response.json({
      data: [entity],
      pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
    })
  );
  expect(await contactGateway.search('Harbour')).toEqual([entity]);
  expect(new URL(requests[0]?.url ?? '').searchParams.get('search')).toBe('Harbour');
});

it.each(['company', 'organisation'])(
  'loads %s contact methods and addresses from the published API',
  async (type) => {
    const typedEntity = { ...entity, type };
    const requests = intercept((request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith('/contact-points')) return Response.json({ data: [] });
      if (pathname.endsWith('/addresses')) return Response.json({ data: [] });
      return Response.json({ data: typedEntity });
    });
    expect(await contactGateway.load('business')).toEqual({
      entity: typedEntity,
      points: [],
      addresses: [],
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/contacts-api/entities/business',
      '/contacts-api/entities/business/contact-points',
      '/contacts-api/entities/business/addresses',
    ]);
  }
);

it('rejects person entity details before requesting business facts', async () => {
  const requests = intercept(() => Response.json({ data: { ...entity, type: 'person' } }));
  await expect(contactGateway.load('person')).rejects.toMatchObject({
    messageKey: 'entityType',
    diagnostic: 'contacts.entity.type',
  });
  expect(requests).toHaveLength(1);
});

it('loads entity types and the source default through the published catalogue route', async () => {
  const catalogue = { types: ['government', 'bank'], defaultType: 'bank' };
  const requests = intercept(() => Response.json(catalogue));
  expect(await contactGateway.catalogue()).toEqual(catalogue);
  expect(requests[0]?.method).toBe('GET');
  expect(new URL(requests[0]?.url ?? '').pathname).toBe('/contacts-api/entity-types');
});
