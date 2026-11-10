import { describe, expect, it } from 'vitest';

import { sourceOwner } from '../arrangements/source-owner';
import { RouteContextError } from './api';
import { RouteSession } from './session';
import {
  deferredRouteResponse,
  routeJson,
  routeRead,
  routeResult,
  routeTransport,
} from './test-utils';

import type { RouteOperationResult, TripRoute } from './types';

async function setup() {
  const transport = routeTransport();
  const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
  transport.replies.push(() => routeJson(routeRead()));
  await session.load();
  return { transport, session };
}
function accepted(
  session: RouteSession,
  before: TripRoute,
  after: TripRoute,
  change: (result: RouteOperationResult) => RouteOperationResult = (result) => result
): Response {
  const operation = session.snapshot().pending;
  if (!operation) throw new Error('No owned operation');
  return routeJson(change(routeResult(operation, before, after)));
}

describe('retained exact route operations', () => {
  it('pins a detached UUID/revision/body across unknown outcome and identical or newer GETs', async () => {
    const { session, transport } = await setup();
    const command = { kind: 'route.reorder' as const, order: [{ kind: 'visit' as const, id: 31 }] };
    transport.replies.push(() =>
      routeJson({ code: 'offline', message: 'Lost response', retryable: true }, 503)
    );
    await session.run(command);
    const failure = session.snapshot().failure;
    if (!failure) throw new Error('Missing unknown outcome');
    expect(failure.kind).toBe('uncertain');
    const original = structuredClone(failure.operation);
    command.order[0]!.id = 900;
    expect(() => {
      failure.operation.expectedRevision = 99;
    }).toThrow(TypeError);
    if (failure.operation.command.kind === 'route.reorder') {
      const first = failure.operation.command.order[0];
      if (!first) throw new Error('Missing owned item');
      expect(() => {
        first.id = 900;
      }).toThrow(TypeError);
    }
    transport.replies.push(() => routeJson(routeRead()));
    await session.reload();
    transport.replies.push(() => routeJson(routeRead({ revision: 9 })));
    await session.reload();
    await session.run({ kind: 'gap.create', before: null });
    expect(transport.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    expect(session.snapshot().failure).toBe(failure);
    transport.replies.push(() =>
      accepted(session, routeRead(), routeRead({ revision: 1 }), (result) => ({
        ...result,
        replayed: true,
        current: routeRead({ revision: 9 }),
      }))
    );
    await session.retry();
    const writes = transport.requests.filter((request) => request.method === 'POST');
    expect(await writes[0]?.json()).toEqual(original);
    expect(await writes[1]?.json()).toEqual(original);
    expect(session.snapshot()).toMatchObject({
      pending: undefined,
      failure: undefined,
      canUndo: false,
    });
    expect(session.snapshot().receipts).toHaveLength(1);
  });

  it('reconciles a definitive rejection only on explicit successful reload', async () => {
    const { session, transport } = await setup();
    transport.replies.push(() =>
      routeJson(
        { code: 'trips.route.route_revision_conflict', message: 'Stale', retryable: false },
        409
      )
    );
    await session.run({ kind: 'path.apply', pathId: 4 });
    expect(session.snapshot().failure?.kind).toBe('rejected');
    transport.replies.push(() => routeJson(routeRead({ revision: 3 })));
    await session.load();
    expect(session.snapshot().failure?.kind).toBe('rejected');
    transport.replies.push(() => routeJson({}, 503));
    await expect(session.reload()).rejects.toBeDefined();
    expect(session.snapshot().failure?.kind).toBe('rejected');
    transport.replies.push(() => routeJson(routeRead({ revision: 3 })));
    await session.reload();
    expect(session.snapshot().failure).toBeUndefined();
  });

  it('uses only own receipts for successive LIFO Undo and drops availability after POST', async () => {
    const { session, transport } = await setup();
    const one = routeRead({
      revision: 1,
      order: [
        { kind: 'visit', id: 31 },
        { kind: 'gap', id: 4 },
      ],
    });
    const two = routeRead({
      ...one,
      revision: 2,
      order: [...one.order, { kind: 'journey', id: 20 }],
    });
    transport.replies.push(() => accepted(session, routeRead(), one));
    await session.run({ kind: 'gap.create', before: null });
    const first = session.snapshot().receipts[0];
    expect(session.snapshot().view?.missingSources).toBeUndefined();
    transport.replies.push(() => accepted(session, one, two));
    await session.run({
      kind: 'source.move',
      source: { kind: 'journey', id: 20 },
      destination: { kind: 'route', before: null },
    });
    const second = session.snapshot().receipts[1];
    transport.replies.push(() => accepted(session, two, { ...one, revision: 3 }));
    await session.undo();
    expect(await transport.requests[3]?.json()).toMatchObject({
      command: {
        kind: 'undo',
        targetOperationId: second?.operationId,
      },
    });
    expect(session.snapshot().canUndo).toBe(true);
    transport.replies.push(() =>
      accepted(session, { ...one, revision: 3 }, routeRead({ revision: 4 }))
    );
    await session.undo();
    expect(await transport.requests[4]?.json()).toMatchObject({
      expectedRevision: 3,
      command: { kind: 'undo', targetOperationId: first?.operationId },
    });
    expect(session.snapshot().canUndo).toBe(false);
  });

  it.each([false, true])(
    'does not offer inverse for replay with newer current or already undone=%s',
    async (undone) => {
      const { session, transport } = await setup();
      transport.replies.push(() =>
        accepted(session, routeRead(), routeRead({ revision: 1 }), (result) => ({
          ...result,
          replayed: true,
          undone,
          current: routeRead({ revision: undone ? 1 : 5 }),
        }))
      );
      await session.run({ kind: 'path.apply', pathId: 4 });
      await session.undo();
      expect(transport.requests).toHaveLength(2);
      expect(session.snapshot().canUndo).toBe(false);
      expect(session.snapshot().receipts).toHaveLength(1);
    }
  );

  it('invalidates Undo on foreign identical-content revision changes without borrowing its revision', async () => {
    const { session, transport } = await setup();
    transport.replies.push(() => accepted(session, routeRead(), routeRead({ revision: 1 })));
    await session.run({ kind: 'path.apply', pathId: 4 });
    expect(session.snapshot().canUndo).toBe(true);
    transport.replies.push(() => routeJson(routeRead({ revision: 2 })));
    await session.load();
    await session.undo();
    expect(session.snapshot().canUndo).toBe(false);
    expect(transport.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it.each([
    (result: RouteOperationResult) => ({
      ...result,
      receipt: { ...result.receipt, operationId: crypto.randomUUID() },
    }),
    (result: RouteOperationResult) => ({ ...result, current: { ...result.current, tripId: 8 } }),
    (result: RouteOperationResult) => ({
      ...result,
      receipt: { ...result.receipt, before: { ...result.receipt.before, revision: 9 } },
    }),
    (result: RouteOperationResult) => ({
      ...result,
      receipt: { ...result.receipt, undoneOperationId: crypto.randomUUID() },
    }),
  ])(
    'retains unknown request when response does not match own trip/revision/operation/Undo identity',
    async (change) => {
      const { session, transport } = await setup();
      transport.replies.push(() =>
        accepted(session, routeRead(), routeRead({ revision: 1 }), change)
      );
      await session.run({ kind: 'path.apply', pathId: 4 });
      expect(session.snapshot().receipts).toHaveLength(0);
      expect(session.snapshot().failure?.kind).toBe('uncertain');
      expect(session.snapshot().view?.route.revision).toBe(0);
    }
  );

  it('retains proof when origin changes after POST and fences new requests until that exact owner returns', async () => {
    const { session, transport } = await setup();
    const pending = deferredRouteResponse();
    transport.replies.push(() => pending.promise);
    const write = session.run({ kind: 'gap.create', before: null });
    transport.client.setConfig({ baseUrl: 'http://other.test' });
    pending.resolve(accepted(session, routeRead(), routeRead({ revision: 1 })));
    await write;
    expect(session.snapshot().receipts).toHaveLength(1);
    await expect(session.undo()).rejects.toBeInstanceOf(RouteContextError);
    await expect(session.load()).rejects.toBeInstanceOf(RouteContextError);
    expect(transport.requests).toHaveLength(2);
    transport.client.setConfig({ baseUrl: 'http://routes.test' });
    transport.replies.push(() =>
      accepted(session, routeRead({ revision: 1 }), routeRead({ revision: 2 }))
    );
    await session.undo();
    expect(session.snapshot().canUndo).toBe(false);
  });
});

describe('monotonic route reads and responses', () => {
  it('rejects late older read generations and lower route revisions', async () => {
    const { session, transport } = await setup();
    const old = deferredRouteResponse();
    transport.replies.push(
      () => old.promise,
      () => routeJson(routeRead({ revision: 3 }))
    );
    const earlier = session.load();
    await session.load();
    old.resolve(routeJson(routeRead({ revision: 2, missingSources: [{ kind: 'visit', id: 31 }] })));
    await earlier;
    expect(session.snapshot().view).toMatchObject({ route: { revision: 3 }, missingSources: [] });
    transport.replies.push(() => routeJson(routeRead({ revision: 1 })));
    await session.load();
    expect(session.snapshot().view?.route.revision).toBe(3);
  });

  it('does not let a late receipt.current overwrite a newer GET or its actual availability proof', async () => {
    const { session, transport } = await setup();
    const reply = deferredRouteResponse();
    transport.replies.push(() => reply.promise);
    const write = session.run({ kind: 'gap.create', before: null });
    const response = accepted(session, routeRead(), routeRead({ revision: 1 }));
    transport.replies.push(() =>
      routeJson(routeRead({ revision: 1, missingSources: [{ kind: 'visit', id: 31 }] }))
    );
    await session.load();
    reply.resolve(response);
    await write;
    expect(session.snapshot().view?.missingSources).toEqual([{ kind: 'visit', id: 31 }]);
    expect(session.snapshot().receipts).toHaveLength(1);
  });
});
