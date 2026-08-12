/**
 * What the BFM discovers and calls when the iOS flow asks it for transactions.
 *
 * The BFM owns no transaction rows. `GET /mobile/finance/transactions` reads
 * the registry for a `finance` entry, probes that entry's `/openapi`, and then
 * calls finance's own `transactions.list` / `transactions.get` operations
 * through `@pops/pillar-sdk`. All three legs have to answer or the app shows an
 * error state instead of a list, so this serves all three from one origin.
 *
 * ## What is real here and what is not
 *
 * The OpenAPI document is the finance pillar's committed snapshot, served
 * verbatim, and the routes below are read out of it rather than written down —
 * so the paths, methods and query-parameter names the SDK resolves are
 * finance's real ones and cannot drift from them. What is invented is the data:
 * three rows from `transactions-fixture.mjs`. The BFM parses them with the same
 * zod schemas it parses production finance with, so a row that does not match
 * finance's contract fails the flow as a 502 rather than passing quietly.
 *
 * Booting the real finance pillar instead was considered and rejected: it would
 * add a second pillar, a second SQLite database and a seeding step to a macOS
 * job, to exercise a BFM-to-finance boundary that `pillars/bfm/src/api/__tests__/mobile-transactions.test.ts`
 * already covers in-process. The seam this flow exists to cover is the phone's.
 *
 * ## The outage switch
 *
 * {@link startUpstreamStub} hands back `setFinanceOutage`, which makes the two
 * data routes answer 503 while `/registry/pillars` and `/openapi` keep
 * answering. That combination is the only one that puts the transactions
 * screen's "temporarily unreachable" sentence on a phone, and it took a
 * reading of the app to find out:
 *
 * - the BFM's bootstrap probes `/openapi`, so a stub that stopped answering it
 *   entirely reports finance as `unavailable`, and the app then draws the
 *   ROOT's "Transactions is not available right now." instead of ever opening
 *   the transactions screen (`AppShellModel.surface` filters on
 *   `FeatureReachability.isUsable`);
 * - closing the whole socket does the same thing one step earlier — no
 *   registry, no pillars, no features at all.
 *
 * So "finance is down" for this harness means "finance is up and refusing",
 * which is also the commoner real outage: a pillar serving its static contract
 * while whatever is behind it is not. The SDK maps any unmapped status onto
 * `unavailable` (`libs/sdk/src/client/rest-call.ts`), so the BFM answers
 * `upstream_unavailable` and the app says the sentence.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const FINANCE_CONTRACT_PATH = fileURLToPath(
  new URL('../../pillars/finance/openapi/finance.openapi.json', import.meta.url)
);

/** The operations the BFM's finance client calls, by `ctx.path.join('.')`. */
export const LIST_OPERATION_ID = 'transactions.list';
export const GET_OPERATION_ID = 'transactions.get';

/** The pillar id the BFM looks up. */
export const FINANCE_PILLAR_ID = 'finance';

/**
 * finance's committed OpenAPI snapshot.
 *
 * @returns {Record<string, unknown>} the parsed document
 */
export function readFinanceContract() {
  return JSON.parse(readFileSync(FINANCE_CONTRACT_PATH, 'utf8'));
}

/**
 * Where the SDK will send each operation, read out of the document that told it
 * so.
 *
 * Absence is a failure rather than a default. A renamed operationId would
 * otherwise leave this stub serving two routes nothing calls, and the flow
 * would fail several minutes later on a simulator with "transactions are
 * temporarily unreachable" — true, and useless.
 *
 * @param {Record<string, unknown>} document finance's OpenAPI snapshot
 * @returns {{ list: { method: string, path: string }, get: { method: string, path: string } }}
 */
export function financeRoutes(document) {
  const wanted = new Map([
    [LIST_OPERATION_ID, 'list'],
    [GET_OPERATION_ID, 'get'],
  ]);
  const found = {};

  const paths = document?.paths;
  if (paths === null || typeof paths !== 'object') {
    throw new Error('finance OpenAPI document has no `paths` object');
  }

  for (const [path, item] of Object.entries(paths)) {
    if (item === null || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      const operationId = operation?.operationId;
      const key = typeof operationId === 'string' ? wanted.get(operationId) : undefined;
      if (key === undefined || found[key] !== undefined) continue;
      found[key] = { method: method.toUpperCase(), path };
    }
  }

  const missing = [...wanted].filter(([, key]) => found[key] === undefined).map(([id]) => id);
  if (missing.length > 0) {
    throw new Error(
      `finance OpenAPI document declares no ${missing.join(' and no ')}. ` +
        'The BFM calls those operationIds by name; this stub cannot answer what it cannot find.'
    );
  }

  return found;
}

/**
 * Turns `/transactions/{id}` into a matcher for `/transactions/txn-1`.
 *
 * @param {string} template an OpenAPI path template
 * @returns {(pathname: string) => Record<string, string> | null}
 */
export function pathMatcher(template) {
  const names = [];
  const pattern = template.replace(/\{([^}]+)\}/gu, (_match, name) => {
    names.push(name);
    return '([^/]+)';
  });
  const regex = new RegExp(`^${pattern}$`, 'u');

  return (pathname) => {
    const match = regex.exec(pathname);
    if (match === null) return null;
    return Object.fromEntries(
      names.map((name, index) => [name, decodeURIComponent(match[index + 1])])
    );
  };
}

/**
 * finance's ordering: newest date first, and the larger id first within a date.
 *
 * Reproduced rather than approximated because the BFM's cursor is built from
 * the last row of a page and fed back as `beforeDate`/`beforeId`; a stub that
 * ordered rows differently would page in a way no real deployment does.
 *
 * @param {{ date: string, id: string }} a
 * @param {{ date: string, id: string }} b
 * @returns {number}
 */
export function compareRows(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

/** finance's own defaults, from `pillars/finance/src/api/rest/transactions-handlers.ts`. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/**
 * finance's contract bounds, per parameter, from the `transactions.list`
 * operation in `pillars/finance/openapi/finance.openapi.json`.
 *
 * They are not the same bound, and using one for both is a rejection finance
 * would not make: `limit` is capped at 500, while `offset` runs to
 * `Number.MAX_SAFE_INTEGER`, so a perfectly ordinary `?offset=1000` would 400
 * from a stub that shared the ceiling.
 */
const BOUNDS = {
  limit: { min: 1, max: 500 },
  offset: { min: 0, max: Number.MAX_SAFE_INTEGER },
};

/**
 * The query string as finance would read it, or the complaint it would answer
 * with.
 *
 * Rejecting rather than shrugging matters more in a fixture than it does in the
 * pillar. A half anchor answered with page one is a plausible 200 that a paging
 * caller reads as "start again" — finance says so in its own handler and
 * refuses — and a stub that shrugged would turn a real BFM bug into a harness
 * that quietly passes.
 *
 * @param {URLSearchParams} params
 * @returns {{ query: { limit: number, offset: number, beforeDate?: string, beforeId?: string } } | { error: string }}
 */
export function parseListQuery(params) {
  const beforeDate = params.get('beforeDate') ?? undefined;
  const beforeId = params.get('beforeId') ?? undefined;

  // Each half is shaped before the pair is weighed, which is the order finance
  // applies them in: its contract types both parameters, so a malformed one is
  // a 400 from the ts-rest layer and never reaches the handler that checks
  // they came together. An unshaped `beforeDate` here would anchor a string
  // comparison against something that is not a date and quietly return the
  // wrong page; an empty `beforeId` counts as supplied and anchors on ''.
  if (beforeDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(beforeDate)) {
    return { error: 'beforeDate must be a YYYY-MM-DD date' };
  }
  if (beforeId !== undefined && beforeId.length === 0) {
    return { error: 'beforeId must not be empty' };
  }

  if ((beforeDate === undefined) !== (beforeId === undefined)) {
    const missing = beforeDate === undefined ? 'beforeDate' : 'beforeId';
    return { error: `beforeDate and beforeId must be supplied together; ${missing} is missing` };
  }

  // finance's contract types these, so a value that is not a whole number in
  // range never reaches its handler — it is a 400 from the ts-rest layer. `NaN`
  // reaching `slice` here would answer 200 with an empty page instead.
  const bounded = (name, fallback) => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/u.test(raw)) return `${name} must be a whole number`;
    const { min, max } = BOUNDS[name];
    const value = Number(raw);
    if (value < min || value > max) return `${name} must be between ${min} and ${max}`;
    return value;
  };

  const limit = bounded('limit', DEFAULT_LIMIT);
  if (typeof limit === 'string') return { error: limit };
  const offset = bounded('offset', DEFAULT_OFFSET);
  if (typeof offset === 'string') return { error: offset };

  return {
    query: {
      limit,
      offset,
      ...(beforeDate === undefined ? {} : { beforeDate }),
      ...(beforeId === undefined ? {} : { beforeId }),
    },
  };
}

/**
 * One page of transactions, paged the way finance pages them.
 *
 * `pagination` mirrors `paginationMeta` in `pillars/finance/src/api/shared/pagination.ts`:
 * `total` is the count under the active filters — the keyset anchor is one of
 * them, so it shrinks as pages are consumed — `offset` is the request's own,
 * and `hasMore` compares the two. The BFM reads none of it (its schema requires
 * `data` alone and strips the rest) but finance's contract declares it
 * required, so a fixture that invented its own meaning would be teaching the
 * next reader something false for no gain.
 *
 * @param {Array<Record<string, unknown>>} rows every seeded row
 * @param {{ limit?: number, offset?: number, beforeDate?: string, beforeId?: string }} query
 * @returns {{ data: Array<Record<string, unknown>>, pagination: { total: number, limit: number, offset: number, hasMore: boolean } }}
 */
export function selectPage(rows, query) {
  const ordered = rows.toSorted(compareRows);
  const matching =
    query.beforeDate !== undefined && query.beforeId !== undefined
      ? ordered.filter(
          (row) => compareRows(row, { date: query.beforeDate, id: query.beforeId }) > 0
        )
      : ordered;

  // finance's defaults, not "everything". `parseListQuery` already applies
  // them on the request path, so this only decides what the helper does when
  // called directly — and a helper that answered an unlimited page for a query
  // finance would have capped at 50 is a fixture that cannot be trusted on its
  // own terms.
  const limit = query.limit ?? DEFAULT_LIMIT;
  const offset = query.offset ?? DEFAULT_OFFSET;

  return {
    data: matching.slice(offset, offset + limit),
    pagination: {
      total: matching.length,
      limit,
      offset,
      hasMore: offset + limit < matching.length,
    },
  };
}

/**
 * The registry snapshot the BFM reads, with finance pointed at this stub.
 *
 * Two readers in a live BFM parse this, with different rules, and the snapshot
 * has to satisfy the stricter of each — which is not the same reader twice:
 *
 * - `pillarRegistry()` (`libs/sdk/src/discovery/snapshot-schema.ts`), behind
 *   the bootstrap roster, validates `manifest` against the full, `.strict()`
 *   `ManifestPayloadSchema` and rejects the WHOLE snapshot over one bad entry.
 *   That is why the manifest below is complete rather than a stub of a stub.
 * - `HttpDiscoveryTransport` (`libs/sdk/src/client/discovery.ts`), behind the
 *   cross-pillar call, asks only that `manifest` be an object — but it is the
 *   one that requires `status`, throwing on an entry without it, where the
 *   discovery parser treats it as optional. That is why `status` is stated.
 *
 * @param {{ financeBaseUrl: string, now?: string }} options
 * @returns {{ fetchedAt: string, pillars: Array<{ pillarId: string, baseUrl: string, registered: boolean, status: string, lastHeartbeatAt: string, manifest: Record<string, unknown> }> }}
 */
export function buildRegistrySnapshot({ financeBaseUrl, now = new Date().toISOString() }) {
  return {
    fetchedAt: now,
    pillars: [
      {
        pillarId: FINANCE_PILLAR_ID,
        baseUrl: financeBaseUrl,
        registered: true,
        status: 'healthy',
        lastHeartbeatAt: now,
        manifest: {
          pillar: FINANCE_PILLAR_ID,
          version: '1.0.0',
          contract: {
            package: '@pops/finance',
            version: '1.0.0',
            tag: 'contract-finance@v1.0.0',
          },
          routes: {
            queries: ['finance.transactions.list', 'finance.transactions.get'],
            mutations: [],
            subscriptions: [],
          },
          search: { adapters: [] },
          ai: { tools: [] },
          uri: { types: ['finance/transaction'] },
          consumedSettings: { keys: [] },
          healthcheck: { path: '/health' },
        },
      },
    ],
  };
}

/**
 * What finance answers on its data routes while the outage switch is on.
 *
 * finance's own error envelope, which requires `message` and nothing else. The
 * status is what carries the meaning: the SDK maps everything it does not
 * model onto `unavailable`, so 503 is read by the BFM as "finance did not
 * answer" and reaches the phone as `upstream_unavailable`.
 */
export const FINANCE_OUTAGE_BODY = {
  message: 'finance is not serving transactions right now',
};

/**
 * Starts the registry-and-finance origin the BFM talks to.
 *
 * @param {{ rows: Array<Record<string, unknown>>, contract?: Record<string, unknown>, host?: string }} options
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void>, setFinanceOutage: (active: boolean) => void, isFinanceOutage: () => boolean }>}
 */
export async function startUpstreamStub({
  rows,
  contract = readFinanceContract(),
  host = '127.0.0.1',
}) {
  const routes = financeRoutes(contract);
  const matchesDetail = pathMatcher(routes.get.path);
  let financeOutage = false;

  // Serialised once, not per request, and that is a correctness fix rather than
  // a micro-optimisation. finance's snapshot is ~630 kB, `JSON.stringify` of it
  // blocks this single-threaded process for a noticeable slice of a second, and
  // the BFM probes `/openapi` on every bootstrap under a 2s timeout while its
  // discovery refresh polls `/registry/pillars` under a 5s one. On a three-core
  // runner already driving a simulator, restringifying that document under each
  // probe is enough to miss those deadlines — and a missed refresh marks the
  // snapshot stale, which the app draws as "Some of Pops could not be reached"
  // ABOVE the transactions list. The banner appearing between Maestro resolving
  // a row and tapping it moves the row out from under the tap: the flow's
  // failure was a tap that landed on nothing (POPS-1835).
  const contractBody = Buffer.from(JSON.stringify(contract));

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}`);
    const json = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    // The BFM resolves the base URL fresh on every call, so `baseUrl` has to
    // be this server's own address rather than a value captured before it had
    // one — the port is only known once it is listening.
    if (url.pathname === '/registry/pillars') {
      // `address()` is typed as `AddressInfo | string | null` — null before
      // the socket is listening, a string for a pipe. Neither can happen from
      // inside a request handler, which is exactly why reading `.port` off it
      // unguarded would fail as a TypeError thrown out of an http callback:
      // no response, the BFM's own fetch times out, and the flow reports
      // "transactions are temporarily unreachable". A 500 that says what
      // happened is the difference between a diagnosis and a hunt.
      const address = server.address();
      if (address === null || typeof address === 'string') {
        return json(500, {
          message: `ios-e2e upstream stub has no TCP address to advertise (got ${JSON.stringify(address)})`,
        });
      }
      return json(200, buildRegistrySnapshot({ financeBaseUrl: `http://${host}:${address.port}` }));
    }

    if (url.pathname === '/openapi') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(contractBody.byteLength),
      });
      return response.end(contractBody);
    }

    if (request.method === routes.list.method && url.pathname === routes.list.path) {
      if (financeOutage) return json(503, FINANCE_OUTAGE_BODY);
      const parsed = parseListQuery(url.searchParams);
      // finance's error envelope, which requires `message` and nothing else.
      // The BFM turns a 400 into `upstream_invalid_request`, so a bad query
      // reaches the phone as a failure rather than as a page of nothing.
      if ('error' in parsed) return json(400, { message: parsed.error });
      return json(200, selectPage(rows, parsed.query));
    }

    if (request.method === routes.get.method) {
      const params = matchesDetail(url.pathname);
      if (params !== null) {
        if (financeOutage) return json(503, FINANCE_OUTAGE_BODY);
        const found = rows.find((row) => row.id === params.id);
        if (found === undefined) return json(404, { message: `no transaction ${params.id}` });
        return json(200, { data: found });
      }
    }

    json(404, {
      message: `ios-e2e upstream stub serves nothing at ${request.method} ${url.pathname}`,
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });

  const { port } = server.address();
  return {
    url: `http://${host}:${port}`,
    port,
    // `close()` on its own stops accepting NEW connections and then waits for
    // the open ones to end, and undici — which every SDK call and every
    // reachability probe goes through — keeps its sockets alive for reuse. So
    // a bare close both hangs (nothing ends those sockets) and does not close
    // (the BFM keeps being served down a connection it already had), which is
    // two ways for a teardown to be a lie.
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    setFinanceOutage: (active) => {
      financeOutage = active;
    },
    isFinanceOutage: () => financeOutage,
  };
}
