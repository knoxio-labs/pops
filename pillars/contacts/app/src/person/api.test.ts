// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { personGateway } from './api';
import { personSnapshot } from './test-fixtures';

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

it('loads every original fact and source account through the generated routes', async () => {
  const data = personSnapshot();
  const payloads: Record<string, unknown> = {
    '/entities/person': data.entity,
    '/entities/person/addresses': data.addresses,
    '/entities/person/contact-points': data.points,
    '/entities/person/sources': data.sources,
    '/sources/accounts': data.accounts,
  };
  const requests = intercept((request) =>
    Response.json({ data: payloads[new URL(request.url).pathname.replace('/contacts-api', '')] })
  );
  expect(await personGateway.load('person')).toEqual(data);
  expect(requests).toHaveLength(5);
});

it('rejects non-person entities before loading or mutating person facts', async () => {
  const requests = intercept(() =>
    Response.json({ data: { ...personSnapshot().entity, type: 'company' } })
  );
  await expect(personGateway.load('merchant')).rejects.toMatchObject({
    messageKey: 'notPerson',
    diagnostic: 'contacts.person.type',
  });
  expect(requests).toHaveLength(1);
});

it('patches only display name and notes, including explicit notes clearing', async () => {
  const requests = intercept(() => Response.json({ data: personSnapshot().entity }));
  await personGateway.save('person', { name: 'Marina', notes: '' });
  expect(requests[0]?.method).toBe('PATCH');
  expect(new URL(requests[0]?.url ?? '').pathname).toBe('/contacts-api/entities/person');
  expect(await requests[0]?.json()).toEqual({ name: 'Marina', notes: null });
});

it('adds local observations and raw addresses without deriving normalized keys or city fields', async () => {
  const data = personSnapshot();
  const requests = intercept((request) =>
    Response.json(
      { data: request.url.endsWith('/addresses') ? data.addresses[0] : data.points[0] },
      { status: 201 }
    )
  );
  const point = {
    kind: 'phone' as const,
    value: '(51) 5550 0182',
    countryCode: 'BR',
    label: 'Mobile',
  };
  await personGateway.addPoint('person', point);
  await personGateway.addAddress('person', ' 18 Fictional Street\nOlinda ');
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/contacts-api/entities/person/contact-points',
    '/contacts-api/entities/person/addresses',
  ]);
  expect(await requests[0]?.json()).toEqual(point);
  expect(await requests[1]?.json()).toEqual({ value: ' 18 Fictional Street\nOlinda ' });
});

it.each([401, 403, 404, 500])(
  'retains safe HTTP diagnostics for %s without exposing the raw response',
  async (status) => {
    intercept(() => Response.json({ private: 'private server contents' }, { status }));
    await expect(personGateway.load('person')).rejects.toMatchObject({
      diagnostic: `contacts.http.${status}`,
    });
    await expect(personGateway.load('person')).rejects.not.toThrow('private server contents');
  }
);
