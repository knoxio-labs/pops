import { describe, expect, it } from 'vitest';

import { sourceOwner } from '../arrangements/source-owner';
import { applyRouteOperation, loadTripRoute, RouteContextError } from './api';
import { routeJson, routeRead, routeTransport } from './test-utils';

describe('generated route transport', () => {
  it('uses exact generated GET and POST paths, signal and pinned command body', async () => {
    const transport = routeTransport();
    const owner = sourceOwner({ tripId: 7, client: transport.client });
    const abort = new AbortController();
    transport.replies.push(() => routeJson(routeRead()));
    expect(await loadTripRoute(owner, abort.signal)).toEqual(routeRead());
    const request = transport.requests[0];
    expect(request?.url).toBe('http://routes.test/trips/7/route');
    expect(request?.method).toBe('GET');
    abort.abort();
    expect(request?.signal.aborted).toBe(true);
    const operation = {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      command: { kind: 'path.apply' as const, pathId: 4 },
    };
    transport.replies.push(() =>
      routeJson({ code: 'trips.route.conflict', message: 'Stale', retryable: false }, 409)
    );
    await expect(applyRouteOperation(owner, operation)).rejects.toMatchObject({ status: 409 });
    expect(transport.requests[1]?.method).toBe('POST');
    expect(transport.requests[1]?.url).toBe('http://routes.test/trips/7/route/operations');
    expect(await transport.requests[1]?.json()).toEqual(operation);
  });
  it('refuses both requests after owner mutation and rejects a foreign-trip read', async () => {
    const transport = routeTransport();
    const owner = sourceOwner({ tripId: 7, client: transport.client });
    transport.client.setConfig({ baseUrl: 'http://foreign.test' });
    await expect(loadTripRoute(owner)).rejects.toBeInstanceOf(RouteContextError);
    await expect(
      applyRouteOperation(owner, {
        operationId: crypto.randomUUID(),
        expectedRevision: 0,
        command: { kind: 'gap.create', before: null },
      })
    ).rejects.toBeInstanceOf(RouteContextError);
    expect(transport.requests).toHaveLength(0);
    transport.client.setConfig({ baseUrl: owner.origin });
    transport.replies.push(() => routeJson(routeRead({ tripId: 8 })));
    await expect(loadTripRoute(owner)).rejects.toThrow('Foreign route response');
  });
});
