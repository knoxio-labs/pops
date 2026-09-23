/**
 * The second pillar this harness puts on the registry, and the only reason it
 * exists: Purchases.
 *
 * The bfm declares two mobile features — `transactions` behind `finance`, and
 * `receipt-capture` behind `purchases` (`pillars/bfm/src/api/mobile/features.ts`).
 * With only finance on the registry every flow lands on the single-feature
 * transactions screen, because `ContentView` draws a `TabView` only once two or
 * more features are usable. A flow that wants to reach the receipt screen at
 * all therefore needs a `purchases` the bfm can resolve, and this is it.
 *
 * ## Why a second origin rather than another route on the first
 *
 * The bfm probes each pillar's own `/openapi` at the base URL the registry gave
 * it, so two pillars on one origin would be two pillars sharing one contract
 * document. Serving purchases under a path prefix does not fix that either:
 * the SDK resolves an operation's path against the base URL, and a prefix in
 * the base URL is not carried onto it. One pillar, one origin, one port.
 *
 * ## What it serves
 *
 * `/openapi` is the whole of what reachability is decided from. The stub also
 * keeps a small purchase history for the mobile home, archive and detail
 * routes, and accepts manual purchases into that same history. The Simulator
 * has no camera, so no flow can produce a receipt to upload
 * (`VNDocumentCameraViewController` cannot be driven there at all — the
 * capture spike ran it and the Simulator's AVFoundation backend refuses to
 * configure an input). `POST /purchases/manual` needs none of that: manual
 * entry (POPS-2454) is the one write this Simulator can drive end to end.
 * `POST /receipts*` stays unserved for the
 * same reason it always was — a fixture nobody's flow can exercise is a
 * fixture nobody notices going wrong.
 *
 * The document served is purchases' own committed snapshot, verbatim — same
 * bargain `upstream-stub.mjs` strikes with finance's. A contract the pillar
 * does not actually publish would let this harness agree with a bfm that
 * production would not.
 *
 * ## The reachability switch, and why it defaults to off
 *
 * {@link startPurchasesStub} hands back `setReachable`, and starts
 * **unreachable**: `/openapi` resets the connection instead of answering, which
 * `probeContractRoute` (`pillars/bfm/src/api/mobile/reachability.ts`) reads as
 * `unavailable`, so `receipt-capture` is withheld and every flow that predates
 * this one sees exactly the single-feature root it was written against. A flow
 * that wants the second tab asks for it.
 *
 * Off is expressed as a refused probe rather than as an absence from the
 * registry, and that is the same call `upstream-stub.mjs` makes for finance's
 * two `/openapi` switches, for the same reason: the registry snapshot is read
 * through `@pops/pillar-sdk/discovery`'s process-wide cache — thirty seconds by
 * default, five at the shortest the SDK allows — so a pillar that appears and
 * disappears from it changes what the bfm sees only after a wait this suite
 * refuses to add. The live probe is answered fresh on every bootstrap, so a
 * flow arming this before it pairs sees the consequence on the first request
 * the app makes.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { boundAddress } from './server-address.mjs';

const PURCHASES_CONTRACT_PATH = fileURLToPath(
  new URL('../../pillars/purchases/openapi/purchases.openapi.json', import.meta.url)
);

/** The pillar id the bfm looks up for `receipt-capture`. */
export const PURCHASES_PILLAR_ID = 'purchases';

/**
 * The operation the bfm's purchases client calls, by `ctx.path.join('.')` —
 * `pillars/bfm/src/api/purchases/client.ts`.
 *
 * Nothing here answers it yet, for the reason this file's header gives. It is
 * named anyway, and its presence in the snapshot is asserted below, because
 * the reachability this stub reports is a claim that the bfm could call
 * purchases — and a snapshot that no longer declares the operation makes that
 * claim false while still probing healthy.
 */
export const UPLOAD_OPERATION_ID = 'receipt.upload';

/**
 * The operation `POST /purchases/manual` actually answers —
 * `pillars/bfm/src/api/purchases/draft-client.ts`'s `createManualPurchase`
 * calls it by this name.
 */
export const MANUAL_OPERATION_ID = 'purchase.createManual';

/** The operations used by the mobile purchase history and detail routes. */
export const LIST_OPERATION_ID = 'purchase.list';
export const DETAIL_OPERATION_ID = 'purchase.get';

/**
 * purchases' committed OpenAPI snapshot.
 *
 * @returns {Record<string, unknown>} the parsed document
 */
export function readPurchasesContract() {
  return JSON.parse(readFileSync(PURCHASES_CONTRACT_PATH, 'utf8'));
}

/**
 * Finds the method and path an operationId is declared at.
 *
 * Absence is a failure at boot rather than a surprise mid-flow. A renamed
 * operationId would otherwise leave this stub reporting a healthy pillar the
 * bfm cannot actually call, and the flow that noticed would fail on a screen
 * several minutes later saying something true and useless.
 *
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @param {string} operationId
 * @returns {{ method: string, path: string }}
 */
function routeFor(document, operationId) {
  const paths = document?.paths;
  if (paths === null || typeof paths !== 'object') {
    throw new Error('purchases OpenAPI document has no `paths` object');
  }

  for (const [path, item] of Object.entries(paths)) {
    if (item === null || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      if (operation?.operationId === operationId) {
        return { method: method.toUpperCase(), path };
      }
    }
  }

  throw new Error(
    `purchases OpenAPI document declares no ${operationId}. ` +
      'The bfm calls that operationId by name, so a pillar without it is not one ' +
      'this harness should be reporting as reachable.'
  );
}

/**
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @returns {{ method: string, path: string }}
 */
export function uploadRoute(document) {
  return routeFor(document, UPLOAD_OPERATION_ID);
}

/**
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @returns {{ method: string, path: string }}
 */
export function manualRoute(document) {
  return routeFor(document, MANUAL_OPERATION_ID);
}

/**
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @returns {{ method: string, path: string }}
 */
export function listRoute(document) {
  return routeFor(document, LIST_OPERATION_ID);
}

/**
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @returns {{ method: string, path: string }}
 */
export function detailRoute(document) {
  return routeFor(document, DETAIL_OPERATION_ID);
}

/**
 * The shape both snapshot readers accept for one pillar on the registry —
 * shared with `upstream-stub.mjs`'s finance entry so the two can sit in the
 * same `pillars` array.
 *
 * @typedef {{
 *   pillarId: string,
 *   baseUrl: string,
 *   registered: boolean,
 *   status: string,
 *   lastHeartbeatAt: string,
 *   manifest: Record<string, unknown> & {
 *     routes: { queries: string[], mutations: string[], subscriptions: string[] },
 *   },
 * }} RegistryEntry
 */

/**
 * The registry entry for this stub, in the shape both snapshot readers accept.
 *
 * The stricter of the two — `pillarRegistry()` in
 * `libs/sdk/src/discovery/snapshot-schema.ts` — validates `manifest` against
 * the full `.strict()` payload schema and rejects the WHOLE snapshot over one
 * bad entry, which would take finance down with it. So the manifest is
 * complete rather than a stub of a stub, exactly as `buildRegistrySnapshot`'s
 * finance entry is.
 *
 * @param {{ baseUrl: string, now: string }} options
 * @returns {RegistryEntry}
 */
export function purchasesRegistryEntry({ baseUrl, now }) {
  return {
    pillarId: PURCHASES_PILLAR_ID,
    baseUrl,
    registered: true,
    status: 'healthy',
    lastHeartbeatAt: now,
    manifest: {
      pillar: PURCHASES_PILLAR_ID,
      version: '1.0.0',
      contract: {
        package: '@pops/purchases',
        version: '1.0.0',
        tag: 'contract-purchases@v1.0.0',
      },
      routes: {
        queries: [`purchases.${LIST_OPERATION_ID}`, `purchases.${DETAIL_OPERATION_ID}`],
        mutations: [`purchases.${UPLOAD_OPERATION_ID}`, `purchases.${MANUAL_OPERATION_ID}`],
        subscriptions: [],
      },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: ['purchases/purchase'] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
    },
  };
}

/**
 * Reads a request body to completion and parses it as JSON.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {Promise<Record<string, unknown>>}
 */
function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(body.length === 0 ? '{}' : body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const PURCHASE_STATUSES = new Set([
  'awaiting_settlement',
  'linked',
  'partial',
  'settled_cash',
  'ignored',
]);

/**
 * The deterministic purchase history each stub starts with.
 *
 * @returns {Array<Record<string, unknown>>}
 */
export function seededPurchases() {
  return [
    seededPurchase({
      id: 'purchase-september-unsettled',
      merchant: 'Corner Store',
      orderedAt: '2026-09-18T08:30:00.000Z',
      status: 'awaiting_settlement',
      totalCents: 1_250,
      item: 'Breakfast',
    }),
    seededPurchase({
      id: 'purchase-august-linked',
      merchant: 'Hardware Shop',
      orderedAt: '2026-08-14T02:15:00.000Z',
      status: 'linked',
      totalCents: 4_599,
      item: 'Fasteners',
    }),
    seededPurchase({
      id: 'purchase-july-partial',
      merchant: 'Market',
      orderedAt: '2026-07-03T23:10:00.000Z',
      status: 'partial',
      totalCents: 875,
      item: 'Groceries',
    }),
  ];
}

/**
 * @param {{
 *   id: string,
 *   merchant: string,
 *   orderedAt: string,
 *   status: string,
 *   totalCents: number,
 *   item: string,
 * }} fixture
 * @returns {Record<string, unknown>}
 */
function seededPurchase(fixture) {
  return {
    edit: null,
    purchase: {
      id: fixture.id,
      source: 'ios-e2e',
      merchantEntityId: null,
      merchantEntityName: fixture.merchant,
      totalCents: fixture.totalCents,
      subtotalCents: fixture.totalCents,
      taxCents: 0,
      shippingCents: 0,
      discountCents: 0,
      surchargeCents: 0,
      currency: 'AUD',
      orderedAt: fixture.orderedAt,
      orderedAtOffsetMinutes: 600,
      status: fixture.status,
      updatedAt: fixture.orderedAt,
    },
    items: [
      {
        item: {
          id: `${fixture.id}-item`,
          name: fixture.item,
          quantity: 1,
          lineTotalCents: fixture.totalCents,
        },
        units: [],
      },
    ],
    documents: [],
  };
}

/**
 * @param {Record<string, unknown>} detail
 * @returns {Record<string, unknown>}
 */
function listRow(detail) {
  const purchase = detail['purchase'];
  const items = detail['items'];
  const documents = detail['documents'];
  const receipt = Array.isArray(documents)
    ? documents.find((document) => document?.kind === 'receipt')
    : undefined;
  return {
    ...(purchase !== null && typeof purchase === 'object' ? purchase : {}),
    itemCount: Array.isArray(items) ? items.length : 0,
    receiptUri: receipt?.documentUri ?? null,
  };
}

/**
 * @param {Record<string, unknown>} detail
 * @returns {string | undefined}
 */
function purchaseId(detail) {
  const purchase = detail['purchase'];
  if (purchase === null || typeof purchase !== 'object') return undefined;
  const id = /** @type {Record<string, unknown>} */ (purchase)['id'];
  return typeof id === 'string' ? id : undefined;
}

/** What ts-rest answers when a query fails the pillar's contract schema, before any handler runs. */
const SCHEMA_REJECTION = Object.freeze({
  ok: false,
  code: 'VALIDATION_ERROR',
  message: 'Request does not match the contract schema',
});

/**
 * @param {URLSearchParams} search
 * @returns {{ ok: true, limit: number, statuses: string[] | null, anchor: null | { orderedAt: string, id: string } } | { ok: false, code: string, message: string }}
 */
function readListQuery(search) {
  const rawLimit = search.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return SCHEMA_REJECTION;
  }

  const statuses = search.getAll('statuses');
  if (statuses.some((status) => !PURCHASE_STATUSES.has(status))) {
    return SCHEMA_REJECTION;
  }

  const beforeOrderedAt = search.get('beforeOrderedAt');
  const beforeId = search.get('beforeId');
  if ((beforeOrderedAt === null) !== (beforeId === null)) {
    return {
      ok: false,
      code: 'KEYSET_ANCHOR_INCOMPLETE',
      message: 'beforeOrderedAt and beforeId must be supplied together',
    };
  }
  if (beforeOrderedAt !== null && !isCanonicalInstant(beforeOrderedAt)) {
    return {
      ok: false,
      code: 'UNREADABLE_TIMESTAMP',
      message: `Keyset anchor 'beforeOrderedAt' value '${beforeOrderedAt}' names no instant`,
    };
  }
  if (beforeId !== null && beforeId.length === 0) {
    return SCHEMA_REJECTION;
  }

  return {
    ok: true,
    limit,
    statuses: statuses.length === 0 ? null : statuses,
    anchor:
      beforeOrderedAt === null || beforeId === null
        ? null
        : { orderedAt: new Date(beforeOrderedAt).toISOString(), id: beforeId },
  };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isCanonicalInstant(value) {
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,9})?(?<zone>Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      value
    );
  if (match?.groups === undefined) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const zone = match.groups['zone'];
  if (zone === undefined) return false;
  const offsetMinutes =
    zone === 'Z'
      ? 0
      : (zone.startsWith('-') ? -1 : 1) *
        (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const local = new Date(timestamp + offsetMinutes * 60_000);
  return (
    local.getUTCFullYear() === Number(match.groups['year']) &&
    local.getUTCMonth() + 1 === Number(match.groups['month']) &&
    local.getUTCDate() === Number(match.groups['day']) &&
    local.getUTCHours() === Number(match.groups['hour']) &&
    local.getUTCMinutes() === Number(match.groups['minute']) &&
    local.getUTCSeconds() === Number(match.groups['second'])
  );
}

/**
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function json(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(bytes.byteLength),
  });
  response.end(bytes);
}

/**
 * @param {URL} url
 * @param {import('node:http').ServerResponse} response
 * @param {Array<Record<string, unknown>>} store
 */
function handleListPurchases(url, response, store) {
  const query = readListQuery(url.searchParams);
  if (!query.ok) {
    json(response, 400, { code: query.code, message: query.message });
    return;
  }

  const rows = store
    .map(listRow)
    .filter((row) => query.statuses === null || query.statuses.includes(String(row['status'])))
    .toSorted((left, right) => {
      const byDate = String(right['orderedAt']).localeCompare(String(left['orderedAt']));
      return byDate === 0 ? String(left['id']).localeCompare(String(right['id'])) : byDate;
    });
  const anchor = query.anchor;
  const scoped =
    anchor === null
      ? rows
      : rows.filter((row) => {
          const orderedAt = String(row['orderedAt']);
          return (
            orderedAt < anchor.orderedAt ||
            (orderedAt === anchor.orderedAt && String(row['id']) > anchor.id)
          );
        });
  json(response, 200, {
    items: scoped.slice(0, query.limit),
    ...(anchor === null ? { total: rows.length } : {}),
  });
}

/**
 * Answers `POST /purchases/manual` the way `purchases` itself does: a
 * `PurchaseDetailResponseSchema`-shaped record
 * (`pillars/bfm/src/api/purchases/list-wire.ts`), echoing back the fields the
 * bfm sent rather than inventing values a Maestro assertion could not have
 * predicted.
 *
 * This is the one write the Simulator can drive without a camera, which is
 * why it is the one this stub answers for real instead of a fixture nobody's
 * flow can reach — see this file's header.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {Array<Record<string, unknown>>} store
 * @returns {Promise<void>}
 */
async function handleCreateManualPurchase(request, response, store) {
  const body = await readJsonBody(request);
  const items = Array.isArray(body['items']) ? body['items'] : [];
  const now = new Date().toISOString();

  const detail = {
    // Never edited: this purchase was just created by this very request, so
    // there is nothing an Original sheet could show yet.
    edit: null,
    purchase: {
      id: randomUUID(),
      source: 'manual',
      merchantEntityId: null,
      merchantEntityName: body['merchantEntityName'] ?? null,
      totalCents: body['totalCents'] ?? 0,
      subtotalCents: body['subtotalCents'] ?? sumLineTotals(items),
      taxCents: body['taxCents'] ?? 0,
      shippingCents: body['shippingCents'] ?? 0,
      discountCents: body['discountCents'] ?? 0,
      surchargeCents: body['surchargeCents'] ?? 0,
      currency: body['currency'] ?? 'AUD',
      orderedAt: body['orderedAt'] ?? now,
      orderedAtOffsetMinutes: body['orderedAtOffsetMinutes'] ?? null,
      status: 'linked',
      updatedAt: now,
    },
    items: items.map((item, index) => ({
      item: {
        id: `manual-item-${index}`,
        name: item?.name ?? '',
        quantity: item?.quantity ?? 1,
        lineTotalCents: item?.lineTotalCents ?? 0,
      },
      units: [],
    })),
    documents: [],
  };

  store.unshift(detail);
  json(response, 200, detail);
}

/**
 * @param {readonly { lineTotalCents?: number }[]} items
 * @returns {number}
 */
function sumLineTotals(items) {
  return items.reduce((total, item) => total + (item?.lineTotalCents ?? 0), 0);
}

/**
 * Reads one path parameter from an OpenAPI template containing `{id}`.
 *
 * @param {string} template
 * @param {string} pathname
 * @returns {string | null}
 */
function pathParameter(template, pathname) {
  const marker = '{id}';
  const markerIndex = template.indexOf(marker);
  if (markerIndex === -1) return null;
  const prefix = template.slice(0, markerIndex);
  const suffix = template.slice(markerIndex + marker.length);
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const encoded = pathname.slice(prefix.length, pathname.length - suffix.length);
  if (encoded.length === 0 || encoded.includes('/')) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * Starts the purchases origin the bfm probes.
 *
 * @param {{ contract?: Record<string, unknown>, host?: string }} options
 * @returns {Promise<{
 *   url: string,
 *   port: number,
 *   close: () => Promise<void>,
 *   setReachable: (active: boolean) => void,
 *   isReachable: () => boolean,
 * }>}
 */
export async function startPurchasesStub({
  contract = readPurchasesContract(),
  host = '127.0.0.1',
} = {}) {
  // Read for their side effect: each throws when the snapshot no longer
  // declares the operation, and this is the moment to find that out.
  uploadRoute(contract);
  const manual = manualRoute(contract);
  const list = listRoute(contract);
  const detail = detailRoute(contract);
  const store = seededPurchases();

  let reachable = false;

  // Serialised once rather than per probe, for the reason `upstream-stub.mjs`
  // gives about finance's much larger document: a stringify inside the handler
  // blocks this single-threaded process while the bfm's probe is holding a
  // deadline open, and a missed deadline draws a banner over the app.
  const contractBody = Buffer.from(JSON.stringify(contract));

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}`);

    if (url.pathname === '/openapi') {
      // Reset rather than left hanging: a socket nobody answers ties the bfm's
      // probe up for its whole timeout on every bootstrap, which is a real
      // wait this suite does not want. A reset fails its `fetch` at once, the
      // same as a port nothing is listening on.
      if (!reachable) {
        request.socket.destroy();
        return;
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(contractBody.byteLength),
      });
      response.end(contractBody);
      return;
    }

    if (request.method === manual.method && url.pathname === manual.path) {
      void handleCreateManualPurchase(request, response, store);
      return;
    }

    if (request.method === list.method && url.pathname === list.path) {
      handleListPurchases(url, response, store);
      return;
    }

    const detailId =
      request.method === detail.method ? pathParameter(detail.path, url.pathname) : null;
    if (detailId !== null) {
      const found = store.find((entry) => purchaseId(entry) === detailId);
      if (found === undefined) {
        json(response, 404, {
          code: 'NOT_FOUND',
          message: `Purchase ${detailId} not found`,
        });
      } else {
        json(response, 200, found);
      }
      return;
    }

    json(response, 404, {
      message:
        `ios-e2e purchases stub serves nothing at ${request.method} ${url.pathname}. ` +
        'It answers the purchase list, detail and manual-create routes; receipt upload remains ' +
        "unserved on purpose — see this file's header.",
    });
  });

  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });
  await listening;

  const { port } = boundAddress(server, 'ios-e2e purchases stub');
  return {
    url: `http://${host}:${port}`,
    port,
    // Connections destroyed for the reason the other two servers destroy
    // theirs: undici keeps its sockets alive, so a bare `close()` both hangs
    // and does not close.
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    setReachable: (active) => {
      reachable = active;
    },
    isReachable: () => reachable,
  };
}
