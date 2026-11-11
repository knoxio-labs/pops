import { afterEach, expect, it, vi } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { deferred } from './test-utils';
import { CaptureWorkspaceReadScope } from './workspace-read';

import type { CaptureIdentity } from './types';

const original = defaultClient.getConfig();
afterEach(() => defaultClient.setConfig(original));

it.each(['places', 'visits'] as const)(
  'fences default %s dispatch while allowing a same-origin replacement',
  async (kind) => {
    const requests: string[] = [];
    const transport: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init).url);
      return Response.json({ places: [], visits: [] });
    };
    defaultClient.setConfig({ baseUrl: 'http://owner-a.test', fetch: transport });
    const scope = new CaptureWorkspaceReadScope({ tripId: 1 });
    const load = (identity: CaptureIdentity) =>
      kind === 'places' ? scope.loadPlaces(identity) : scope.loadVisits(identity);
    defaultClient.setConfig({ baseUrl: 'http://owner-b.test' });
    await expect(load({ tripId: 1 })).rejects.toThrow('Restore the original Trips owner');
    expect(requests).toEqual([]);
    const replacement = createClient({ baseUrl: 'http://owner-a.test', fetch: transport });
    expect((await load({ tripId: 1, client: replacement })).owner.origin).toBe(
      'http://owner-a.test'
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('http://owner-a.test/');
    expect(kind === 'places' ? scope.placesKey : scope.visitsKey).toEqual([...scope.key, kind]);
  }
);

it.each(['places', 'visits'] as const)(
  'rejects deferred default %s completion after mutable origin drift',
  async (kind) => {
    const response = deferred<Response>();
    const requests: string[] = [];
    defaultClient.setConfig({
      baseUrl: 'http://owner-a.test',
      fetch: (input, init) => {
        requests.push(new Request(input, init).url);
        return response.promise;
      },
    });
    const scope = new CaptureWorkspaceReadScope({ tripId: 1 });
    const pending =
      kind === 'places' ? scope.loadPlaces({ tripId: 1 }) : scope.loadVisits({ tripId: 1 });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    defaultClient.setConfig({ baseUrl: 'http://owner-b.test' });
    response.resolve(Response.json({ places: [], visits: [] }));
    await expect(pending).rejects.toThrow('Restore the original Trips owner');
    expect(requests[0]).toContain('http://owner-a.test/');
  }
);

it('rejects foreign catalogue cache proof and foreign-trip Visit payloads before selection', () => {
  const identity = { tripId: 1, client: createClient({ baseUrl: 'http://owner-a.test' }) };
  const scope = new CaptureWorkspaceReadScope(identity);
  const foreign = { data: [], owner: { origin: 'http://owner-b.test', tripId: 1 } };
  expect(() => scope.selectPlaces(identity, foreign)).toThrow(
    'The cached source belongs to another Trips owner.'
  );
  expect(() => scope.selectVisits(identity, foreign)).toThrow(
    'The cached source belongs to another Trips owner.'
  );
  expect(() =>
    scope.selectVisits(identity, {
      owner: { origin: 'http://owner-a.test', tripId: 1 },
      data: [
        {
          id: 11,
          tripId: 2,
          placeId: 9,
          revision: 0,
          timing: {},
          notes: '',
          sourceLinks: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
  ).toThrow('The cached source belongs to another Trips owner.');
});
