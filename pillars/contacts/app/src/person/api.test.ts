// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { personGateway } from './api';
import { personDraft } from './draft';
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

it('loads an atomic fact snapshot and source account provenance using generated routes', async () => {
  const data = personSnapshot();
  const requests = intercept((request) => {
    if (request.url.endsWith('/facts')) return Response.json({ data });
    if (request.url.endsWith('/sources')) return Response.json({ data: data.sources });
    return Response.json({ data: data.accounts });
  });
  expect(await personGateway.load('person')).toEqual(data);
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/contacts-api/entities/person/facts',
    '/contacts-api/entities/person/sources',
    '/contacts-api/sources/accounts',
  ]);
});

it('rejects non-person entities before loading unrelated provenance', async () => {
  const requests = intercept(() =>
    Response.json({
      data: { ...personSnapshot(), entity: { ...personSnapshot().entity, type: 'company' } },
    })
  );
  await expect(personGateway.load('merchant')).rejects.toMatchObject({
    messageKey: 'notPerson',
    diagnostic: 'contacts.person.type',
  });
  expect(requests).toHaveLength(1);
});

it('writes only explicit field differences atomically against the original draft version', async () => {
  const data = personSnapshot();
  const requests = intercept(() =>
    Response.json({ data, operation: { id: 'operation', undoneOperationId: null } })
  );
  const draft = { ...personDraft(data), name: 'Marina', notes: '' };
  await personGateway.save('person', draft, data);
  expect(requests[0]?.method).toBe('POST');
  expect(new URL(requests[0]?.url ?? '').pathname).toBe(
    '/contacts-api/entities/person/facts/changes'
  );
  expect(await requests[0]?.json()).toEqual({
    expectedVersion: 1,
    idempotencyKey: expect.any(String),
    changes: [{ action: 'setEntity', name: 'Marina', notes: null }],
  });
});

it('undoes only the selected committed operation with an explicit version and request identity', async () => {
  const requests = intercept(() =>
    Response.json({
      data: personSnapshot(),
      operation: { id: 'undo', undoneOperationId: 'operation' },
    })
  );
  await personGateway.undo('person', 'operation', 7);
  expect(new URL(requests[0]?.url ?? '').pathname).toBe(
    '/contacts-api/entities/person/facts/changes/operation/undo'
  );
  expect(await requests[0]?.json()).toEqual({
    expectedVersion: 7,
    idempotencyKey: expect.any(String),
  });
});

it.each([401, 403, 404, 409, 500])('retains safe HTTP diagnostics for %s', async (status) => {
  intercept(() => Response.json({ private: 'private server contents' }, { status }));
  await expect(personGateway.load('person')).rejects.toMatchObject({
    diagnostic: `contacts.http.${status}`,
  });
  await expect(personGateway.load('person')).rejects.not.toThrow('private server contents');
});
