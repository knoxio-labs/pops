import { describe, expect, it } from 'vitest';

import { sourceOwner } from '../arrangements/source-owner';
import { RouteSession } from './session';
import { routeJson, routeRead, routeResult, routeTransport } from './test-utils';

import type { RouteOperationResult } from './types';

function replaceCurrent(result: RouteOperationResult, patch: Record<string, unknown>): unknown {
  const current = { ...result.current, ...patch };
  return { ...result, current, receipt: { ...result.receipt, after: current } };
}
const invalidOperations: { name: string; change: (result: RouteOperationResult) => unknown }[] = [
  { name: 'unknown root property', change: (result) => ({ ...result, extra: true }) },
  {
    name: 'unknown nested source property',
    change: (result) => replaceCurrent(result, { order: [{ kind: 'visit', id: 31, extra: true }] }),
  },
  {
    name: 'unknown nested path property',
    change: (result) =>
      replaceCurrent(result, {
        paths: [{ id: 4, title: 'Path', gapId: 5, state: 'alternative', members: [], extra: true }],
      }),
  },
  { name: 'missing undone', change: (result) => ({ ...result, undone: undefined }) },
  { name: 'missing replayed', change: (result) => ({ ...result, replayed: undefined }) },
  { name: 'string undone', change: (result) => ({ ...result, undone: 'false' }) },
  { name: 'number replayed', change: (result) => ({ ...result, replayed: 0 }) },
  {
    name: 'invalid source discriminator',
    change: (result) => replaceCurrent(result, { order: [{ kind: 'bogus', id: 31 }] }),
  },
  {
    name: 'zero source ID',
    change: (result) => replaceCurrent(result, { order: [{ kind: 'visit', id: 0 }] }),
  },
  {
    name: 'negative source ID',
    change: (result) => replaceCurrent(result, { order: [{ kind: 'journey', id: -1 }] }),
  },
  {
    name: 'fractional source ID',
    change: (result) => replaceCurrent(result, { order: [{ kind: 'gap', id: 1.5 }] }),
  },
  {
    name: 'unsafe source ID',
    change: (result) =>
      replaceCurrent(result, { order: [{ kind: 'visit', id: Number.MAX_SAFE_INTEGER + 1 }] }),
  },
  { name: 'fractional revision', change: (result) => replaceCurrent(result, { revision: 0.5 }) },
  {
    name: 'invalid path state',
    change: (result) =>
      replaceCurrent(result, {
        paths: [{ id: 4, title: 'Path', gapId: 5, state: 'chosen', members: [] }],
      }),
  },
  {
    name: 'invalid path member',
    change: (result) =>
      replaceCurrent(result, {
        paths: [
          {
            id: 4,
            title: 'Path',
            gapId: 5,
            state: 'alternative',
            members: [{ kind: 'gap', id: 5 }],
          },
        ],
      }),
  },
  {
    name: 'missing nested path field',
    change: (result) =>
      replaceCurrent(result, { paths: [{ id: 4, gapId: 5, state: 'alternative', members: [] }] }),
  },
];

describe('complete generated route wire validation', () => {
  it.each(invalidOperations)(
    'keeps $name POST response uncertain and retries the exact original operation',
    async ({ change }) => {
      const transport = routeTransport();
      const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
      transport.replies.push(() => routeJson(routeRead()));
      await session.load();
      transport.replies.push(() => {
        const operation = session.snapshot().pending;
        if (!operation) throw new Error('Missing original request');
        return routeJson(change(routeResult(operation, routeRead(), routeRead({ revision: 1 }))));
      });
      await session.run({ kind: 'path.apply', pathId: 4 });
      const operation = session.snapshot().failure?.operation;
      expect(session.snapshot()).toMatchObject({
        failure: { kind: 'uncertain' },
        canUndo: false,
        receipts: [],
      });
      expect(session.snapshot().view?.route.revision).toBe(0);
      if (!operation) throw new Error('Missing retained unknown request');
      transport.replies.push(() =>
        routeJson({
          ...routeResult(operation, routeRead(), routeRead({ revision: 1 })),
          replayed: true,
        })
      );
      await session.retry();
      expect(await transport.requests[1]?.json()).toEqual(await transport.requests[2]?.json());
      expect(session.snapshot().receipts).toHaveLength(1);
    }
  );

  it.each([
    { extra: true },
    { order: [{ kind: 'visit', id: 31, extra: true }] },
    { paths: [{ id: 4, title: 'Path', gapId: 5, state: 'alternative', members: [], extra: true }] },
    { order: [{ kind: 'bogus', id: 31 }] },
    { order: [{ kind: 'visit', id: 0 }] },
    { order: [{ kind: 'journey', id: -1 }] },
    { order: [{ kind: 'gap', id: 1.5 }] },
    { order: [{ kind: 'visit', id: Number.MAX_SAFE_INTEGER + 1 }] },
    { revision: -1 },
    { revision: 0.5 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { missingSources: undefined },
    { missingSources: [{ kind: 'gap', id: 5 }] },
    { paths: [{ id: 4, title: 'Path', gapId: 5, state: 'invalid', members: [] }] },
    { paths: [{ id: 4, title: 'Path', gapId: 0, state: 'alternative', members: [] }] },
    {
      paths: [
        {
          id: 4,
          title: 'Path',
          gapId: 5,
          state: 'alternative',
          members: [{ kind: 'visit', id: 0 }],
        },
      ],
    },
  ])('rejects malformed GET %j and preserves the last good view', async (patch) => {
    const transport = routeTransport();
    const session = new RouteSession(sourceOwner({ tripId: 7, client: transport.client }));
    transport.replies.push(() => routeJson(routeRead()));
    await session.load();
    const original = session.snapshot().view;
    transport.replies.push(() => routeJson({ ...routeRead({ revision: 1 }), ...patch }));
    await expect(session.load()).rejects.toBeDefined();
    expect(session.snapshot().view).toBe(original);
  });
});
