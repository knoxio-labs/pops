import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { makeJobsContract } from '../contract.js';

const ERR = { 404: z.object({ message: z.string() }) } as const;

describe('makeJobsContract', () => {
  it('declares every literal /jobs path ahead of the :id param route', () => {
    const contract = makeJobsContract(ERR);
    const keys = Object.keys(contract);

    const paramRoutes = ['get', 'retry', 'cancel'];
    const literalRoutes = ['queues', 'stats', 'drain', 'listDeadLetter', 'replayDeadLetter'];
    const firstParamRoute = Math.min(...paramRoutes.map((key) => keys.indexOf(key)));

    for (const literal of literalRoutes) {
      expect(keys.indexOf(literal)).toBeLessThan(firstParamRoute);
    }
  });

  it('exposes the full management verb set on stable paths', () => {
    const contract = makeJobsContract(ERR);

    expect(
      Object.fromEntries(
        Object.entries(contract).map(([key, route]) => [key, `${route.method} ${route.path}`])
      )
    ).toEqual({
      queues: 'GET /jobs/queues',
      stats: 'GET /jobs/stats',
      drain: 'POST /jobs/drain',
      listDeadLetter: 'GET /jobs/dead-letter',
      replayDeadLetter: 'POST /jobs/dead-letter/:id/replay',
      list: 'GET /jobs',
      get: 'GET /jobs/:id',
      retry: 'POST /jobs/:id/retry',
      cancel: 'POST /jobs/:id/cancel',
    });
  });

  it('carries the mounting pillar’s error responses onto every route', () => {
    const contract = makeJobsContract(ERR);

    for (const route of Object.values(contract)) {
      expect(Object.keys(route.responses)).toContain('404');
    }
  });

  it('coerces the numeric list query, which arrives as a string on the wire', () => {
    const contract = makeJobsContract(ERR);

    expect(contract.list.query.parse({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('rejects a list window outside the page cap', () => {
    const contract = makeJobsContract(ERR);

    expect(contract.list.query.safeParse({ limit: '500' }).success).toBe(false);
    expect(contract.list.query.safeParse({ offset: '-1' }).success).toBe(false);
  });
});
