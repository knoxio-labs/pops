import { describe, expect, it } from 'vitest';

import { seededTransactions } from '../ios-e2e/transactions-fixture.mjs';
import {
  buildRegistrySnapshot,
  compareRows,
  financeRoutes,
  pathMatcher,
  readFinanceContract,
  selectPage,
} from '../ios-e2e/upstream-stub.mjs';

const minimalContract = {
  paths: {
    '/transactions': { get: { operationId: 'transactions.list' } },
    '/transactions/{id}': { get: { operationId: 'transactions.get' } },
  },
};

describe('financeRoutes', () => {
  it('reads both operations out of the document', () => {
    expect(financeRoutes(minimalContract)).toEqual({
      list: { method: 'GET', path: '/transactions' },
      get: { method: 'GET', path: '/transactions/{id}' },
    });
  });

  it('resolves against finance’s committed snapshot, which is what the SDK reads', () => {
    // Not a restatement of the line above: this is the drift check. The BFM
    // asks for these operationIds by name, and a rename on the finance side
    // would otherwise surface as a flow that fails on a simulator with
    // "transactions are temporarily unreachable".
    expect(financeRoutes(readFinanceContract())).toEqual({
      list: { method: 'GET', path: '/transactions' },
      get: { method: 'GET', path: '/transactions/{id}' },
    });
  });

  it('names the operation it could not find rather than serving two dead routes', () => {
    const renamed = { paths: { '/transactions': { get: { operationId: 'transactions.index' } } } };
    expect(() => financeRoutes(renamed)).toThrow(/transactions\.list and no transactions\.get/u);
  });

  it('reports a document with no paths instead of returning an empty map', () => {
    expect(() => financeRoutes({})).toThrow(/no `paths` object/u);
    expect(() => financeRoutes({ paths: null })).toThrow(/no `paths` object/u);
  });

  it('ignores path items and operations that carry no operationId', () => {
    const noisy = {
      paths: {
        '/health': { get: {} },
        '/broken': null,
        ...minimalContract.paths,
      },
    };
    expect(financeRoutes(noisy).list.path).toBe('/transactions');
  });
});

describe('pathMatcher', () => {
  const matches = pathMatcher('/transactions/{id}');

  it('extracts the parameter', () => {
    expect(matches('/transactions/e2e-groceries')).toEqual({ id: 'e2e-groceries' });
  });

  it('decodes what the SDK encoded', () => {
    expect(matches('/transactions/a%2Fb')).toEqual({ id: 'a/b' });
  });

  it('does not match a longer or shorter path', () => {
    expect(matches('/transactions')).toBeNull();
    expect(matches('/transactions/a/b')).toBeNull();
    expect(matches('/other/a')).toBeNull();
  });
});

describe('compareRows', () => {
  it('orders by date descending, then id descending', () => {
    const rows = [
      { id: 'a', date: '2026-03-01' },
      { id: 'c', date: '2026-03-03' },
      { id: 'b', date: '2026-03-03' },
    ];
    expect(rows.toSorted(compareRows).map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('selectPage', () => {
  const rows = [
    { id: 'a', date: '2026-03-01' },
    { id: 'b', date: '2026-03-02' },
    { id: 'c', date: '2026-03-03' },
  ];

  it('returns everything, newest first, when nothing is asked for', () => {
    const page = selectPage(rows, {});
    expect(page.data.map((row) => row.id)).toEqual(['c', 'b', 'a']);
    expect(page.pagination).toEqual({ total: 3, limit: 3, offset: 0, hasMore: false });
  });

  it('reports more when the limit cuts the page short', () => {
    const page = selectPage(rows, { limit: 2 });
    expect(page.data.map((row) => row.id)).toEqual(['c', 'b']);
    expect(page.pagination.hasMore).toBe(true);
  });

  it('starts strictly after the anchor the BFM echoes back', () => {
    const page = selectPage(rows, { beforeDate: '2026-03-03', beforeId: 'c' });
    expect(page.data.map((row) => row.id)).toEqual(['b', 'a']);
    expect(page.pagination.offset).toBe(1);
    expect(page.pagination.hasMore).toBe(false);
  });

  it('breaks a date tie by id, so a same-day page cannot repeat a row', () => {
    const sameDay = [
      { id: 'a', date: '2026-03-01' },
      { id: 'b', date: '2026-03-01' },
      { id: 'c', date: '2026-03-01' },
    ];
    const page = selectPage(sameDay, { beforeDate: '2026-03-01', beforeId: 'c' });
    expect(page.data.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('ignores a half-specified anchor rather than guessing the other half', () => {
    expect(selectPage(rows, { beforeDate: '2026-03-03' }).data).toHaveLength(3);
    expect(selectPage(rows, { beforeId: 'c' }).data).toHaveLength(3);
  });
});

describe('buildRegistrySnapshot', () => {
  const snapshot = buildRegistrySnapshot({
    financeBaseUrl: 'http://127.0.0.1:4010',
    now: '2026-03-03T00:00:00.000Z',
  });
  // Throws rather than returning `undefined`, so a snapshot that lost its only
  // entry fails as itself instead of as five unrelated assertions on nothing.
  const entry = (): (typeof snapshot.pillars)[number] => {
    const [first] = snapshot.pillars;
    if (first === undefined) throw new Error('the snapshot advertises no pillars at all');
    return first;
  };

  it('advertises finance at the URL it was handed', () => {
    expect(snapshot.pillars).toHaveLength(1);
    expect(entry().pillarId).toBe('finance');
    expect(entry().baseUrl).toBe('http://127.0.0.1:4010');
  });

  it('states registered and healthy explicitly', () => {
    // Both are load-bearing and neither is a default the SDK supplies. The
    // cross-pillar client parser rejects an entry with no `status` outright,
    // and `guardAvailability` answers `unavailable` for anything that is not
    // registered — in both cases before a single request goes out, so the
    // symptom is a 503 with nothing on the wire to look at.
    expect(entry().registered).toBe(true);
    expect(entry().status).toBe('healthy');
  });

  it('carries a heartbeat, which the discovery parser requires one of', () => {
    expect(entry().lastHeartbeatAt).toBe('2026-03-03T00:00:00.000Z');
  });

  it('carries every key the manifest schema demands', () => {
    // The schema is `.strict()` and one bad entry rejects the whole snapshot,
    // which reaches the app as "nothing is available" rather than as a parse
    // error. Listed here rather than validated against the real zod schema
    // because `@pops/pillar-sdk` is not resolvable from the repo root, where
    // this suite runs.
    expect(Object.keys(entry().manifest).toSorted()).toEqual([
      'ai',
      'consumedSettings',
      'contract',
      'healthcheck',
      'pillar',
      'routes',
      'search',
      'uri',
      'version',
    ]);
  });
});

describe('the seeded rows', () => {
  it('carry every field the BFM requires of a finance detail response', () => {
    // `pillars/bfm/src/api/finance/wire.ts` requires all of these and answers
    // 502 when one is missing — a failure that reads, on the phone, as "this
    // version of Pops cannot read what the server sent".
    const required = [
      'id',
      'description',
      'account',
      'amount',
      'date',
      'type',
      'tags',
      'entityId',
      'entityName',
      'location',
      'country',
      'relatedTransactionId',
      'notes',
      'lastEditedTime',
    ];
    for (const row of seededTransactions) {
      expect(Object.keys(row).toSorted()).toEqual(required.toSorted());
    }
  });

  it('date is a plain day, which is the one format the BFM rejects timestamps for', () => {
    for (const row of seededTransactions) {
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('includes the row the flow taps, with the account line the flow asserts on', () => {
    // The flow names both. If either moves, this fails in a second instead of
    // twenty minutes into a macOS job.
    const tapped = seededTransactions.find((row) => row.id === 'e2e-groceries');
    expect(tapped?.account).toBe('Everyday');
  });
});
