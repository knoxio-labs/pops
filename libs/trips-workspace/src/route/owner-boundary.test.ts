import { describe, expect, it } from 'vitest';

import { sourceOwner } from '../arrangements/source-owner';
import { client as defaultClient } from '../trips-api/client.gen';
import { RouteContextError } from './api';
import { RouteSession } from './session';
import {
  deferredRouteResponse,
  routeJson,
  routeRead,
  routeResult,
  routeTransport,
} from './test-utils';

import type { TripRouteRead } from './types';

describe('route owner proof boundaries', () => {
  it('replays the original UUID and old revision after a lost network response and a matching committed GET', async () => {
    const transport = routeTransport();
    const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
    transport.replies.push(
      () => routeJson(routeRead()),
      () => {
        throw new TypeError('Connection lost after request');
      }
    );
    await session.load();
    await session.run({ kind: 'path.apply', pathId: 4 });
    const operation = session.snapshot().failure?.operation;
    if (!operation) throw new Error('Missing original request');
    transport.replies.push(() => routeJson(routeRead({ revision: 1 })));
    await session.reload();
    expect(session.snapshot().receipts).toHaveLength(0);
    expect(session.snapshot().failure?.operation).toBe(operation);
    transport.replies.push(() =>
      routeJson({
        ...routeResult(operation, routeRead(), routeRead({ revision: 1 })),
        replayed: true,
      })
    );
    await session.retry();
    expect(await transport.requests[1]?.json()).toEqual(await transport.requests[3]?.json());
    expect(session.snapshot().receipts[0]?.operationId).toBe(operation.operationId);
    expect(session.snapshot().canUndo).toBe(true);
  });
  it('fences actual mutable default transport before GET, POST, retry and Undo without dropping unknown identity', async () => {
    const original = defaultClient.getConfig();
    const transport = routeTransport();
    defaultClient.setConfig(transport.client.getConfig());
    try {
      const session = new RouteSession(sourceOwner({ tripId: 7 }));
      defaultClient.setConfig({ baseUrl: 'http://changed.test' });
      await expect(session.load()).rejects.toBeInstanceOf(RouteContextError);
      await expect(session.run({ kind: 'gap.create', before: null })).rejects.toBeInstanceOf(
        RouteContextError
      );
      expect(transport.requests).toHaveLength(0);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      transport.replies.push(
        () => routeJson(routeRead()),
        () => routeJson({}, 503)
      );
      await session.load();
      await session.run({ kind: 'gap.create', before: null });
      const operation = session.snapshot().failure?.operation;
      if (!operation) throw new Error('Missing retained request');
      defaultClient.setConfig({ baseUrl: 'http://changed.test' });
      await expect(session.retry()).rejects.toBeInstanceOf(RouteContextError);
      expect(session.snapshot().failure?.operation).toBe(operation);
      expect(transport.requests).toHaveLength(2);
      defaultClient.setConfig({ baseUrl: 'http://routes.test' });
      transport.replies.push(() =>
        routeJson({
          ...routeResult(operation, routeRead(), routeRead({ revision: 1 })),
          replayed: true,
        })
      );
      await session.retry();
      expect(session.snapshot().canUndo).toBe(true);
      defaultClient.setConfig({ baseUrl: 'http://changed.test' });
      await expect(session.undo()).rejects.toBeInstanceOf(RouteContextError);
      expect(transport.requests).toHaveLength(3);
      expect(session.snapshot().receipts).toHaveLength(1);
    } finally {
      defaultClient.setConfig(original);
    }
  });

  it.each([null, {}, { receipt: {}, current: {} }])(
    'does not acknowledge malformed HTTP200 response %j',
    async (malformed) => {
      const transport = routeTransport();
      const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
      transport.replies.push(
        () => routeJson(routeRead()),
        () => routeJson(malformed)
      );
      await session.load();
      await session.run({ kind: 'path.apply', pathId: 4 });
      expect(session.snapshot().failure?.kind).toBe('uncertain');
      expect(session.snapshot().receipts).toHaveLength(0);
      transport.replies.push(() => routeJson(routeRead()));
      await session.reload();
      expect(session.snapshot().failure?.kind).toBe('uncertain');
    }
  );

  it('retains own LIFO lineage when a GET observes a pending own successor before its response arrives', async () => {
    const transport = routeTransport();
    const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
    const one = routeRead({ revision: 1 });
    const two = routeRead({ revision: 2 });
    const reply = (before: TripRouteRead, after: TripRouteRead): Response => {
      const operation = session.snapshot().pending;
      if (!operation) throw new Error('Missing owned operation');
      return routeJson(routeResult(operation, before, after));
    };
    transport.replies.push(
      () => routeJson(routeRead()),
      () => reply(routeRead(), one)
    );
    await session.load();
    await session.run({ kind: 'gap.create', before: null });
    const first = session.snapshot().receipts[0];
    const deferred = deferredRouteResponse();
    transport.replies.push(() => deferred.promise);
    const pending = session.run({ kind: 'path.apply', pathId: 4 });
    const response = reply(one, two);
    transport.replies.push(() => routeJson(two));
    await session.load();
    deferred.resolve(response);
    await pending;
    transport.replies.push(() => reply(two, routeRead({ revision: 3 })));
    await session.undo();
    expect(session.snapshot().canUndo).toBe(true);
    transport.replies.push(() => reply(routeRead({ revision: 3 }), routeRead({ revision: 4 })));
    await session.undo();
    expect(await transport.requests.at(-1)?.json()).toMatchObject({
      expectedRevision: 3,
      command: { targetOperationId: first?.operationId },
    });
  });
});
