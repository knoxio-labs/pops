/**
 * The second pillar this harness puts on the registry, and the only reason it
 * exists: `receipt-capture`.
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
 * ## Why it serves a contract and nothing else
 *
 * `/openapi` is the whole of what reachability is decided from, and
 * reachability is the whole of what the phone can currently exercise: the
 * Simulator has no camera, so no flow can produce a receipt to upload
 * (`VNDocumentCameraViewController` cannot be driven there at all — the
 * capture spike ran it and the Simulator's AVFoundation backend refuses to
 * configure an input). Serving `POST /receipts` would be a route with no
 * caller, and a fixture nobody exercises is a fixture nobody notices going
 * wrong. When the capture step can be stubbed on the phone, the outcome arms
 * belong here and this comment is what should be replaced.
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
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

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
 * purchases' committed OpenAPI snapshot.
 *
 * @returns {Record<string, unknown>} the parsed document
 */
export function readPurchasesContract() {
  return JSON.parse(readFileSync(PURCHASES_CONTRACT_PATH, 'utf8'));
}

/**
 * Whether the document declares the operation the bfm resolves by name.
 *
 * Absence is a failure at boot rather than a surprise mid-flow. A renamed
 * operationId would otherwise leave this stub reporting a healthy pillar the
 * bfm cannot actually call, and the flow that noticed would fail on a screen
 * several minutes later saying something true and useless.
 *
 * @param {Record<string, unknown>} document purchases' OpenAPI snapshot
 * @returns {{ method: string, path: string }}
 */
export function uploadRoute(document) {
  const paths = document?.paths;
  if (paths === null || typeof paths !== 'object') {
    throw new Error('purchases OpenAPI document has no `paths` object');
  }

  for (const [path, item] of Object.entries(paths)) {
    if (item === null || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      if (operation?.operationId === UPLOAD_OPERATION_ID) {
        return { method: method.toUpperCase(), path };
      }
    }
  }

  throw new Error(
    `purchases OpenAPI document declares no ${UPLOAD_OPERATION_ID}. ` +
      'The bfm calls that operationId by name, so a pillar without it is not one ' +
      'this harness should be reporting as reachable.'
  );
}

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
 * @returns {Record<string, unknown>}
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
        queries: [],
        mutations: [`purchases.${UPLOAD_OPERATION_ID}`],
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
  // Read for its side effect: it throws when the snapshot no longer declares
  // the operation, and this is the moment to find that out.
  uploadRoute(contract);

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
      if (!reachable) return request.socket.destroy();
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(contractBody.byteLength),
      });
      return response.end(contractBody);
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        message:
          `ios-e2e purchases stub serves nothing at ${request.method} ${url.pathname}. ` +
          'It answers `/openapi` and nothing else, on purpose — see its header.',
      })
    );
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });

  const { port } = server.address();
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
