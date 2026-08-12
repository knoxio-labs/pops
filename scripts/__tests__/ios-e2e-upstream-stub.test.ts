import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seededTransactions } from '../ios-e2e/transactions-fixture.mjs';
import {
  buildRegistrySnapshot,
  compareRows,
  financeRoutes,
  FINANCE_OUTAGE_BODY,
  parseListQuery,
  pathMatcher,
  readFinanceContract,
  selectPage,
  startUpstreamStub,
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

  it('applies finance’s default limit, not "everything", when none is given', () => {
    const page = selectPage(rows, {});
    expect(page.data.map((row) => row.id)).toEqual(['c', 'b', 'a']);
    expect(page.pagination).toEqual({ total: 3, limit: 50, offset: 0, hasMore: false });
  });

  it('reports more when the limit cuts the page short', () => {
    const page = selectPage(rows, { limit: 2 });
    expect(page.data.map((row) => row.id)).toEqual(['c', 'b']);
    expect(page.pagination.hasMore).toBe(true);
  });

  it('starts strictly after the anchor the BFM echoes back', () => {
    const page = selectPage(rows, { beforeDate: '2026-03-03', beforeId: 'c' });
    expect(page.data.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('counts what the anchor left, the way finance counts under a filter', () => {
    // finance's `total` comes from the same query the rows do, so the keyset
    // anchor shrinks it. `offset` stays the request's own — nothing to do with
    // how many rows the anchor skipped.
    const page = selectPage(rows, { beforeDate: '2026-03-03', beforeId: 'c', limit: 1 });
    expect(page.pagination).toEqual({ total: 2, limit: 1, offset: 0, hasMore: true });
  });

  it('honours an offset, which finance accepts alongside the keyset', () => {
    const page = selectPage(rows, { limit: 1, offset: 1 });
    expect(page.data.map((row) => row.id)).toEqual(['b']);
    expect(page.pagination).toEqual({ total: 3, limit: 1, offset: 1, hasMore: true });
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
});

describe('parseListQuery', () => {
  const query = (search: string) => parseListQuery(new URLSearchParams(search));

  it('applies finance’s defaults when the caller asks for nothing', () => {
    expect(query('')).toEqual({ query: { limit: 50, offset: 0 } });
  });

  it('reads the anchor the BFM sends back', () => {
    expect(query('limit=26&beforeDate=2026-03-03&beforeId=c')).toEqual({
      query: { limit: 26, offset: 0, beforeDate: '2026-03-03', beforeId: 'c' },
    });
  });

  it('refuses half an anchor, naming the half that is missing', () => {
    // finance refuses it too, and for the reason its handler gives: page one
    // of an unfiltered list is a plausible 200 that a paging caller reads as
    // "start again". A stub that shrugged would hide a real BFM bug.
    expect(query('beforeDate=2026-03-03')).toEqual({
      error: 'beforeDate and beforeId must be supplied together; beforeId is missing',
    });
    expect(query('beforeId=c')).toEqual({
      error: 'beforeDate and beforeId must be supplied together; beforeDate is missing',
    });
  });

  it('refuses an anchor half that is present but malformed', () => {
    // finance's contract types both: `beforeDate` carries the YYYY-MM-DD
    // pattern and `beforeId` a minLength of 1, so neither shape reaches its
    // handler. Left through here, a `beforeDate` that is not a date anchors a
    // string comparison against something that is not one and returns the
    // wrong page rather than an error.
    expect(query('beforeDate=2026-03&beforeId=c')).toEqual({
      error: 'beforeDate must be a YYYY-MM-DD date',
    });
    expect(query('beforeDate=yesterday&beforeId=c')).toEqual({
      error: 'beforeDate must be a YYYY-MM-DD date',
    });
    expect(query('beforeDate=2026-03-03&beforeId=')).toEqual({
      error: 'beforeId must not be empty',
    });
  });

  it('shapes each half before it weighs the pair', () => {
    // A malformed half is reported as malformed, not as its partner being
    // missing — the same order finance applies, and the difference between
    // "fix this value" and "send the other one".
    expect(query('beforeDate=nonsense')).toEqual({
      error: 'beforeDate must be a YYYY-MM-DD date',
    });
  });

  it('refuses a limit that is not a whole number in range', () => {
    // Left to `Number()` this arrives at `slice` as `NaN` and answers 200 with
    // an empty page — which the app draws as "no transactions yet".
    expect(query('limit=abc')).toEqual({ error: 'limit must be a whole number' });
    expect(query('limit=-1')).toEqual({ error: 'limit must be a whole number' });
    expect(query('limit=0')).toEqual({ error: 'limit must be between 1 and 500' });
    expect(query('limit=501')).toEqual({ error: 'limit must be between 1 and 500' });
  });

  it('allows an offset of zero but not a negative one', () => {
    expect(query('offset=0')).toEqual({ query: { limit: 50, offset: 0 } });
    expect(query('offset=-1')).toEqual({ error: 'offset must be a whole number' });
  });

  it('does not hold offset to limit’s ceiling', () => {
    // finance caps `limit` at 500 and `offset` at Number.MAX_SAFE_INTEGER.
    // Sharing one bound would reject an ordinary deep page that the real
    // pillar answers.
    expect(query('offset=1000')).toEqual({ query: { limit: 50, offset: 1000 } });
    expect(query(`offset=${Number.MAX_SAFE_INTEGER}`)).toEqual({
      query: { limit: 50, offset: Number.MAX_SAFE_INTEGER },
    });
    expect(query('offset=9007199254740992')).toEqual({
      error: `offset must be between 0 and ${Number.MAX_SAFE_INTEGER}`,
    });
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

describe('the finance outage switch', () => {
  let stub: Awaited<ReturnType<typeof startUpstreamStub>>;

  beforeEach(async () => {
    stub = await startUpstreamStub({ rows: seededTransactions });
  });

  afterEach(async () => {
    await stub.close();
  });

  const get = (path: string) => fetch(`${stub.url}${path}`);

  it('serves the rows until the switch is thrown', async () => {
    expect((await get('/transactions')).status).toBe(200);
    expect((await get('/transactions/e2e-groceries')).status).toBe(200);
    expect(stub.isFinanceOutage()).toBe(false);
  });

  it('refuses both data routes while it is on', async () => {
    stub.setFinanceOutage(true);

    for (const path of ['/transactions', '/transactions/e2e-groceries']) {
      const answered = await get(path);
      expect(answered.status).toBe(503);
      expect(await answered.json()).toEqual(FINANCE_OUTAGE_BODY);
    }
  });

  it('keeps serving the registry and the contract, which is the whole point', async () => {
    // The BFM's bootstrap probes `/openapi` and reads the registry. If either
    // stopped answering, the app would never open the transactions screen at
    // all — `AppShellModel.surface` filters an unreachable feature out — and
    // the flow would be asserting against the root's "not available right now"
    // instead of the list's "temporarily unreachable".
    stub.setFinanceOutage(true);

    const registry = await get('/registry/pillars');
    expect(registry.status).toBe(200);
    expect((await registry.json()).pillars[0].status).toBe('healthy');

    const contract = await get('/openapi');
    expect(contract.status).toBe(200);
    expect(contract.headers.get('content-type')).toContain('json');
  });

  it('answers again when the switch goes back', async () => {
    stub.setFinanceOutage(true);
    stub.setFinanceOutage(false);

    const answered = await get('/transactions');
    expect(answered.status).toBe(200);
    expect((await answered.json()).data).toHaveLength(seededTransactions.length);
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
