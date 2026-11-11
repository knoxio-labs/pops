import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';

import { createClient } from '../trips-api/client';
import { client as defaultClient } from '../trips-api/client.gen';
import { captureSource, deferred, sourceCapture } from './test-utils';
import { CaptureWorkspaceReadScope } from './workspace-read';

const original = defaultClient.getConfig();
afterEach(() => defaultClient.setConfig(original));

it('fences default-client reads before dispatch and accepts replacement transports at the same origin', async () => {
  const requests: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init).url);
    return Response.json(captureSource());
  };
  defaultClient.setConfig({ baseUrl: 'http://owner-a.test', fetch: transport });
  const scope = new CaptureWorkspaceReadScope({ tripId: 1 });
  const cache = new QueryClient();
  expect((await scope.load(cache, { tripId: 1 })).owner.origin).toBe('http://owner-a.test');
  defaultClient.setConfig({ baseUrl: 'http://owner-b.test' });
  await expect(scope.load(cache, { tripId: 1 })).rejects.toThrow(
    'Restore the original Trips owner'
  );
  expect(requests).toHaveLength(1);
  const replacement = createClient({ baseUrl: 'http://owner-a.test', fetch: transport });
  const read = await scope.load(cache, { tripId: 1, client: replacement });
  expect(scope.select({ tripId: 1, client: replacement }, read)).toBe(read);
  expect(requests).toHaveLength(2);
  expect(scope.key).toEqual(['trips', 'http://owner-a.test', 1, 'capture_workspace']);
});

it('rejects deferred default-owner delivery after drift without admitting a foreign cache proof', async () => {
  const response = deferred<Response>();
  defaultClient.setConfig({ baseUrl: 'http://owner-a.test', fetch: () => response.promise });
  const scope = new CaptureWorkspaceReadScope({ tripId: 1 });
  const read = scope.load(new QueryClient(), { tripId: 1 });
  defaultClient.setConfig({ baseUrl: 'http://owner-b.test' });
  response.resolve(Response.json(captureSource()));
  await expect(read).rejects.toThrow('Restore the original Trips owner');
  defaultClient.setConfig({ baseUrl: 'http://owner-a.test' });
  expect(() =>
    scope.select(
      { tripId: 1 },
      {
        source: captureSource(),
        generation: 0,
        owner: { origin: 'http://owner-b.test', tripId: 1 },
      }
    )
  ).toThrow('The cached source belongs to another Trips owner.');
  expect(() =>
    scope.select(
      { tripId: 1 },
      {
        source: captureSource(),
        generation: 0,
        owner: { origin: 'http://owner-a.test', tripId: 2 },
      }
    )
  ).toThrow('The cached source belongs to another Trips owner.');
  expect(() =>
    scope.select(
      { tripId: 1 },
      {
        source: captureSource([sourceCapture({ tripId: 2 })]),
        generation: 0,
        owner: { origin: 'http://owner-a.test', tripId: 1 },
      }
    )
  ).toThrow('The cached source belongs to another Trips owner.');
});
