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

/**
 * One page of transactions, keyset-paged the way finance pages them.
 *
 * @param {Array<Record<string, unknown>>} rows every seeded row
 * @param {{ limit?: number, beforeDate?: string, beforeId?: string }} query the SDK's query string
 * @returns {{ data: Array<Record<string, unknown>>, pagination: { total: number, limit: number, offset: number, hasMore: boolean } }}
 */
export function selectPage(rows, query) {
  const ordered = rows.toSorted(compareRows);
  const anchored =
    query.beforeDate !== undefined && query.beforeId !== undefined
      ? ordered.filter(
          (row) => compareRows(row, { date: query.beforeDate, id: query.beforeId }) > 0
        )
      : ordered;

  const limit = query.limit ?? anchored.length;
  const page = anchored.slice(0, limit);

  return {
    data: page,
    pagination: {
      total: ordered.length,
      limit,
      offset: ordered.length - anchored.length,
      hasMore: page.length < anchored.length,
    },
  };
}

/**
 * The registry snapshot the BFM reads, with finance pointed at this stub.
 *
 * Both readers in a live BFM parse this — `pillarRegistry()` for the bootstrap
 * roster and `HttpDiscoveryTransport` for the cross-pillar call — and they
 * disagree about which fields are optional. `status` is stated because the
 * client parser rejects an entry without one; the manifest is complete because
 * the discovery parser validates it strictly and rejects the whole snapshot
 * over a single bad entry.
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
 * Starts the registry-and-finance origin the BFM talks to.
 *
 * @param {{ rows: Array<Record<string, unknown>>, contract?: Record<string, unknown>, host?: string }} options
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export async function startUpstreamStub({
  rows,
  contract = readFinanceContract(),
  host = '127.0.0.1',
}) {
  const routes = financeRoutes(contract);
  const matchesDetail = pathMatcher(routes.get.path);

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
      const address = server.address();
      return json(200, buildRegistrySnapshot({ financeBaseUrl: `http://${host}:${address.port}` }));
    }

    if (url.pathname === '/openapi') {
      return json(200, contract);
    }

    if (request.method === routes.list.method && url.pathname === routes.list.path) {
      const limit = url.searchParams.get('limit');
      return json(
        200,
        selectPage(rows, {
          limit: limit === null ? undefined : Number(limit),
          beforeDate: url.searchParams.get('beforeDate') ?? undefined,
          beforeId: url.searchParams.get('beforeId') ?? undefined,
        })
      );
    }

    if (request.method === routes.get.method) {
      const params = matchesDetail(url.pathname);
      if (params !== null) {
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
