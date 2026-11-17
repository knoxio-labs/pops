import { describe, expect, it } from 'vitest';

import { MobileTripRouteSchema } from '../../../contract/mobile-trip-route-schemas.js';
import { tripsFixture } from './fixtures.js';
import { tripsClientOver } from './gateway.js';
import { tripRouteFixture } from './route-fixture.js';

import type { MobileTripRoute } from '../../../contract/mobile-trip-route-schemas.js';

describe('canonical mobile route reads', () => {
  it('retains mixed order, distinct Visit identities, alternatives, applied history and missing sources', async () => {
    const expected = tripRouteFixture();
    const { client, calls } = tripsClientOver(tripsFixture(), {
      route: { kind: 'ok', value: expected },
    });
    expect(await client.getRoute(7)).toEqual({ kind: 'ok', value: expected });
    expect(calls).toEqual([{ operation: 'route.get', input: { tripId: 7 } }]);
    expect(expected).toEqual(tripRouteFixture());
  });

  it('preserves a genuinely empty canonical route and the exact safe-integer revision boundary', async () => {
    const value = {
      tripId: Number.MAX_SAFE_INTEGER,
      revision: Number.MAX_SAFE_INTEGER,
      order: [],
      paths: [],
      missingSources: [],
    };
    expect(
      await tripsClientOver(tripsFixture(), { route: { kind: 'ok', value } }).client.getRoute(
        value.tripId
      )
    ).toEqual({ kind: 'ok', value });
  });

  const mutations: { name: string; change: (route: MobileTripRoute) => void }[] = [
    {
      name: 'wrong Trip',
      change: (route) => {
        route.tripId = 8;
      },
    },
    {
      name: 'repeated root token',
      change: (route) => {
        route.order.push({ kind: 'visit', id: 22 });
      },
    },
    {
      name: 'repeated active source',
      change: (route) => {
        route.paths[0]?.members.push({ kind: 'visit', id: 22 });
      },
    },
    {
      name: 'duplicate path identity',
      change: (route) => {
        const path = route.paths.at(0);
        if (!path) throw new Error('Missing fixture path');
        route.paths.push({ ...path, members: [] });
      },
    },
    {
      name: 'missing gap',
      change: (route) => {
        route.order = route.order.filter((item) => item.kind !== 'gap');
      },
    },
    {
      name: 'orphan missing source',
      change: (route) => {
        route.missingSources.push({ kind: 'journey', id: 999 });
      },
    },
    {
      name: 'duplicate missing source',
      change: (route) => {
        route.missingSources.push({ kind: 'visit', id: 24 });
      },
    },
  ];
  it.each(mutations)(
    'rejects $name without replacing it with an empty route',
    async ({ change }) => {
      const value = tripRouteFixture();
      change(value);
      expect(
        await tripsClientOver(tripsFixture(), { route: { kind: 'ok', value } }).client.getRoute(7)
      ).toMatchObject({ kind: 'contract-mismatch', status: 502 });
    }
  );

  it.each([
    {},
    { ...tripRouteFixture(), missingSources: undefined },
    { ...tripRouteFixture(), revision: -1 },
    { ...tripRouteFixture(), revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...tripRouteFixture(), order: [{ kind: 'visit', id: 0 }] },
    { ...tripRouteFixture(), order: [{ kind: 'visit', id: 1.5 }] },
    { ...tripRouteFixture(), order: [{ kind: 'stay', id: 1 }] },
    { ...tripRouteFixture(), missingSources: [{ kind: 'gap', id: 71 }] },
  ])('rejects a malformed producer shape', async (value) => {
    expect(MobileTripRouteSchema.safeParse(value).success).toBe(false);
    expect(
      await tripsClientOver(tripsFixture(), { route: { kind: 'ok', value } }).client.getRoute(7)
    ).toMatchObject({ kind: 'contract-mismatch', status: 502 });
  });

  it('passes missing and unavailable outcomes through without reading substitute source arrays', async () => {
    for (const kind of ['not-found', 'unavailable'] as const) {
      const { client, calls } = tripsClientOver(tripsFixture(), {
        route: { kind, pillar: 'trips' },
      });
      expect(await client.getRoute(7)).toMatchObject({ kind, pillar: 'trips' });
      expect(calls).toHaveLength(1);
    }
  });
});
