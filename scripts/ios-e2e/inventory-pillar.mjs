/**
 * The inventory pillar the Inventory flow drives, real rather than stubbed,
 * behind a gate that withholds it until a flow asks for it.
 *
 * ## Why the real pillar
 *
 * Every other pillar here is a stub because what the app does with it is read
 * a list or post one form. Inventory is a sync protocol: a paged snapshot, a
 * change feed with cursors and epochs, mutations with revisions and
 * idempotency keys, and reverts that must name the event they undo. A stub
 * that got all of that right would be a second implementation of the pillar,
 * and one nobody tests against the first. So the flow runs against the built
 * pillar on a temporary database, which is also the only way it proves the
 * phone, the BFM relay and the pillar agree on the wire.
 *
 * ## Why a gate in front of it
 *
 * The BFM names `inventory` in `GET /mobile/bootstrap` as soon as the pillar's
 * `/openapi` answers, and a second usable feature turns the root into a tab
 * bar. Every flow older than the Inventory one is written against the
 * single-feature root, so the pillar has to be invisible to them. The gate
 * does to it what `purchases-stub.mjs` does to purchases, for the reason that
 * file gives: `/openapi` resets the connection until a flow arms it, so the
 * registry entry never has to appear or disappear. Everything else is
 * forwarded to the pillar untouched, armed or not.
 *
 * ## The sync outage
 *
 * The phone writes to its own replica first and sends later, so the one
 * offline behaviour a flow can check end to end is that what it changed while
 * the pillar could not be reached still arrives once it can. `setSyncOutage`
 * resets every connection except `/openapi` and `/health`, so the BFM keeps
 * naming `inventory` usable (the tab stays) while every snapshot, feed page
 * and mutation it relays fails, as it would with the pillar unplugged.
 */

import { spawn } from 'node:child_process';
import { request as httpRequest, createServer } from 'node:http';
import { join } from 'node:path';

import { boundAddress } from './server-address.mjs';

export const INVENTORY_PILLAR_ID = 'inventory';

/**
 * The registry entry the BFM discovers the pillar from, pointed at the gate.
 * Complete for the reason `purchasesRegistryEntry` gives: one entry that fails
 * the strict manifest schema takes the whole snapshot down with it.
 *
 * @param {{ baseUrl: string, now: string }} options
 * @returns {import('./purchases-stub.mjs').RegistryEntry}
 */
export function inventoryRegistryEntry({ baseUrl, now }) {
  return {
    pillarId: INVENTORY_PILLAR_ID,
    baseUrl,
    registered: true,
    status: 'healthy',
    lastHeartbeatAt: now,
    manifest: {
      pillar: INVENTORY_PILLAR_ID,
      version: '1.0.0',
      contract: {
        package: '@pops/inventory',
        version: '1.0.0',
        tag: 'contract-inventory@v1.0.0',
      },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: ['inventory/item', 'inventory/location'] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
    },
  };
}

/**
 * Starts the gate in front of `pillarBaseUrl`. Withheld until `setReachable`.
 *
 * @param {{ pillarBaseUrl: string, host?: string }} options
 * @returns {Promise<{
 *   url: string,
 *   port: number,
 *   close: () => Promise<void>,
 *   setReachable: (active: boolean) => void,
 *   isReachable: () => boolean,
 *   setSyncOutage: (active: boolean) => void,
 *   isSyncOutage: () => boolean,
 * }>}
 */
export async function startInventoryGate({ pillarBaseUrl, host = '127.0.0.1' }) {
  const pillar = new URL(pillarBaseUrl);
  let reachable = false;
  let syncOutage = false;

  const server = createServer((request, response) => {
    const target = request.url ?? '/';
    if (!target.startsWith('/') || target.startsWith('//')) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'ios-e2e inventory gate forwards paths only' }));
      return;
    }
    const { pathname } = new URL(target, pillar);
    if (syncOutage && pathname !== '/openapi' && pathname !== '/health') {
      request.socket.destroy();
      return;
    }
    if (!reachable && pathname === '/openapi') {
      // Reset rather than left hanging, for the reason `purchases-stub.mjs`
      // gives: a socket nobody answers holds the BFM's probe for its whole
      // timeout on every bootstrap.
      request.socket.destroy();
      return;
    }

    const forwarded = httpRequest(
      {
        host: pillar.hostname,
        port: pillar.port,
        method: request.method,
        path: target,
        headers: { ...request.headers, host: pillar.host },
      },
      (answered) => {
        response.writeHead(answered.statusCode ?? 502, answered.headers);
        answered.pipe(response);
      }
    );
    forwarded.on('error', (error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          message: `ios-e2e inventory gate could not reach the pillar: ${String(error)}`,
        })
      );
    });
    request.pipe(forwarded);
  });

  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });
  await listening;

  const { port } = boundAddress(server, 'ios-e2e inventory gate');
  return {
    url: `http://${host}:${port}`,
    port,
    // Connections destroyed for the reason every server here destroys them:
    // kept-alive sockets hold a bare `close()` open.
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    setReachable: (active) => {
      reachable = active;
    },
    isReachable: () => reachable,
    setSyncOutage: (active) => {
      syncOutage = active;
    },
    isSyncOutage: () => syncOutage,
  };
}

/**
 * Spawns the built pillar (`pillars/inventory/dist/api/server.js`) on `port`
 * against a database under `dataDir`. The caller builds it first and waits for
 * `/health`.
 *
 * `POPS_REGISTRY_ENABLED` is emptied for the reason `run.mjs` empties it for
 * the BFM: the registry here is a fixture with no registration route. It is
 * still the registry the pillar verifies the BFM's service-account key
 * against, which `upstream-stub.mjs` answers.
 *
 * @param {{ repoRoot: string, port: number, dataDir: string, buildVersion: string, selfBaseUrl: string, registryUrl: string }} options
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnInventoryPillar({
  repoRoot,
  port,
  dataDir,
  buildVersion,
  selfBaseUrl,
  registryUrl,
}) {
  return spawn('node', [join(repoRoot, 'pillars/inventory/dist/api/server.js')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      BUILD_VERSION: buildVersion,
      INVENTORY_SQLITE_PATH: join(dataDir, 'inventory.db'),
      INVENTORY_IMAGES_DIR: join(dataDir, 'inventory-images'),
      INVENTORY_SELF_BASE_URL: selfBaseUrl,
      POPS_REGISTRY_URL: registryUrl,
      POPS_REGISTRY_ENABLED: '',
      NODE_ENV: 'test',
    },
  });
}
