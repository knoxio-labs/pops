// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { readContactReference } from './readContactReference';

const originalFetch = globalThis.fetch;
afterEach(() => client.setConfig({ baseUrl: '/contacts-api', fetch: originalFetch }));
const reference = { canonicalId: 'canonical', uri: 'pops:contacts/contact/canonical' };
const entity = {
  id: 'canonical',
  name: 'Owner current name',
  type: 'retained-unknown-type',
  aliases: [],
  defaultTags: [],
  lastEditedTime: '2026-11-10T00:00:00Z',
  notes: 'Owner current notes',
};
function intercept(respond: (request: Request) => Response | Promise<Response>) {
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

it('proves a historical alias then reads the actual canonical entity and generic source route', async () => {
  const requests = intercept((request) =>
    new URL(request.url).pathname.endsWith('/reference')
      ? Response.json(reference)
      : Response.json({ data: entity })
  );
  expect(await readContactReference('pops:contacts/contact/old')).toEqual({
    status: 'available',
    name: entity.name,
    entity,
    reference,
    href: '/contacts/canonical',
  });
  expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
    ['GET', '/contacts-api/entities/old/reference'],
    ['GET', '/contacts-api/entities/canonical'],
  ]);
});

it.each([
  '',
  'https://example.test/contacts/a',
  'pops:trips/contact/a',
  'pops:contacts/person/a',
  'pops:contacts/contact/',
])('rejects an unowned or empty reference without network (%s)', async (uri) => {
  const requests = intercept(() => {
    throw new Error('Must not request');
  });
  expect(await readContactReference(uri)).toEqual({
    status: 'readError',
    diagnostic: 'contacts.reference.invalid',
  });
  expect(requests).toHaveLength(0);
});

it('reports missing only when the owning reference resolver returns 404', async () => {
  const requests = intercept(() => Response.json({ message: 'Not found' }, { status: 404 }));
  expect(await readContactReference('pops:contacts/contact/gone')).toEqual({
    status: 'missing',
    diagnostic: 'contacts.http.404',
  });
  expect(requests).toHaveLength(1);
});

it.each([403, 503])(
  'keeps failed identity reads unavailable instead of missing (%s)',
  async (status) => {
    intercept(() => Response.json({ message: 'Untrusted server detail' }, { status }));
    expect(await readContactReference('pops:contacts/contact/old')).toEqual({
      status: 'unavailable',
      diagnostic: `contacts.http.${status}`,
    });
  }
);

it.each([
  null,
  {},
  { canonicalId: '', uri: 'pops:contacts/contact/' },
  { canonicalId: 'a', uri: 'pops:contacts/contact/b' },
  { canonicalId: 'a', uri: 'pops:trips/contact/a' },
])('rejects malformed or mismatched canonical proof before following it (%j)', async (proof) => {
  const requests = intercept(() => Response.json(proof));
  expect(await readContactReference('pops:contacts/contact/old')).toMatchObject({
    status: 'readError',
  });
  expect(requests).toHaveLength(1);
});

it.each([
  { ...entity, id: 'foreign' },
  { ...entity, name: null },
  { ...entity, aliases: [1] },
  { ...entity, notes: 4 },
  { id: 'canonical', name: 'Incomplete' },
])(
  'rejects a malformed or foreign entity while retaining the proven reference (%j)',
  async (value) => {
    intercept((request) =>
      new URL(request.url).pathname.endsWith('/reference')
        ? Response.json(reference)
        : Response.json({ data: value })
    );
    expect(await readContactReference('pops:contacts/contact/old')).toEqual({
      status: 'readError',
      diagnostic: 'contacts.reference.entity_mismatch',
      reference,
    });
  }
);

it.each([404, 503])(
  'retains proven identity when entity display metadata fails (%s)',
  async (status) => {
    intercept((request) =>
      new URL(request.url).pathname.endsWith('/reference')
        ? Response.json(reference)
        : Response.json({ message: 'Metadata unavailable' }, { status })
    );
    expect(await readContactReference('pops:contacts/contact/old')).toEqual({
      status: 'unavailable',
      diagnostic: `contacts.http.${status}`,
      reference,
    });
  }
);

it('keeps network failures unavailable without claiming a retained contact is missing', async () => {
  intercept(() => {
    throw new TypeError('Failed to fetch');
  });
  expect(await readContactReference('pops:contacts/contact/old')).toEqual({
    status: 'unavailable',
    diagnostic: 'contacts.network',
  });
});

it('passes caller cancellation through the real client and treats timeout as unavailable', async () => {
  const controller = new AbortController();
  const requests = intercept(
    (request) =>
      new Promise<Response>((_resolve, reject) => {
        if (request.signal.aborted) reject(request.signal.reason);
        else
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
      })
  );
  const pending = readContactReference('pops:contacts/contact/old', { signal: controller.signal });
  controller.abort(new DOMException('Timed out', 'TimeoutError'));
  expect(await pending).toEqual({ status: 'unavailable', diagnostic: 'contacts.network' });
  expect(requests[0]?.signal.aborted).toBe(true);
});

it('preserves opaque IDs without decoding or deriving a route from display type', async () => {
  const canonicalId = 'canonical/opaque ?#%';
  const proof = { canonicalId, uri: `pops:contacts/contact/${canonicalId}` };
  const requests = intercept((request) =>
    new URL(request.url).pathname.endsWith('/reference')
      ? Response.json(proof)
      : Response.json({ data: { ...entity, id: canonicalId } })
  );
  const result = await readContactReference('pops:contacts/contact/old%2Fopaque');
  expect(result).toMatchObject({
    status: 'available',
    reference: proof,
    href: `/contacts/${encodeURIComponent(canonicalId)}`,
  });
  expect(new URL(requests[0]?.url ?? '').pathname).toBe(
    '/contacts-api/entities/old%252Fopaque/reference'
  );
  expect(new URL(requests[1]?.url ?? '').pathname).toBe(
    `/contacts-api/entities/${encodeURIComponent(canonicalId)}`
  );
});

it.each(['.', '..'])(
  'does not misclassify URL-normalized dot-segment IDs as missing (%s)',
  async (id) => {
    const requests = intercept(() => Response.json({}, { status: 404 }));
    expect(await readContactReference(`pops:contacts/contact/${id}`)).toMatchObject({
      status: 'readError',
    });
    expect(requests).toHaveLength(0);
  }
);

it('retains canonical proof when a caller timeout interrupts display metadata', async () => {
  const controller = new AbortController();
  intercept((request) => {
    if (new URL(request.url).pathname.endsWith('/reference')) return Response.json(reference);
    return new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      controller.abort(new DOMException('Timed out', 'TimeoutError'));
    });
  });
  expect(
    await readContactReference('pops:contacts/contact/old', { signal: controller.signal })
  ).toEqual({
    status: 'unavailable',
    diagnostic: 'contacts.network',
    reference,
  });
});

it('retains but does not navigate a proven identity that URL path normalization cannot address', async () => {
  const proof = { canonicalId: '..', uri: 'pops:contacts/contact/..' };
  const requests = intercept(() => Response.json(proof));
  expect(await readContactReference('pops:contacts/contact/old')).toEqual({
    status: 'readError',
    diagnostic: 'contacts.reference.unaddressable',
    reference: proof,
  });
  expect(requests).toHaveLength(1);
});
