/**
 * S6 — the protocol boundary once protocol 2 is rolled out. A protocol-1
 * sync client is refused with `426 client_too_old` (directly, and relayed to
 * the phone when the BFM in front of it only speaks protocol 1), a
 * protocol-2 client is served, and the rollout itself refuses a downgrade or
 * an unsupported version.
 *
 * The protocol-1 BFM is simulated by a proxy between the real BFM and
 * Inventory that rewrites `Pops-Inventory-Protocol` to `1` — the exact wire a
 * BFM build from before protocol 2 sends — so the refusal travels through
 * BFM's real relay and error mapping rather than a stub.
 */
import { randomUUID } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DraftSession, typeByKey } from './test-helpers-acceptance-mcp.js';
import { startAcceptanceStack, type AcceptanceStack } from './test-helpers-acceptance-stack.js';

const PROTOCOL_HEADER = 'pops-inventory-protocol';
const tooOldSchema = z.object({ code: z.literal('client_too_old') });
const snapshotSchema = z.object({ minimumProtocol: z.number().int() });
const errorCodeSchema = z.object({ code: z.string() });

interface DowngradingProxy {
  readonly baseUrl: string;
  downgrade: boolean;
  close(): Promise<void>;
}

async function startDowngradingProxy(target: string): Promise<DowngradingProxy> {
  const upstream = new URL(target);
  const state = { downgrade: false };
  const server: Server = createServer((request, response) => {
    const headers: IncomingHttpHeaders = { ...request.headers, host: upstream.host };
    if (state.downgrade && headers[PROTOCOL_HEADER] !== undefined) headers[PROTOCOL_HEADER] = '1';
    const forwarded = httpRequest(
      {
        host: upstream.hostname,
        port: upstream.port,
        method: request.method,
        path: request.url,
        headers,
      },
      (answered) => {
        response.writeHead(answered.statusCode ?? 502, answered.headers);
        answered.pipe(response);
      }
    );
    forwarded.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(forwarded);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('proxy has no port');
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    get downgrade() {
      return state.downgrade;
    },
    set downgrade(value: boolean) {
      state.downgrade = value;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('S6 protocol-1 refusal and protocol-2 success at the BFM boundary', () => {
  let stack: AcceptanceStack;
  let proxy: DowngradingProxy | undefined;
  let catalogueRevision = 0;
  let typeId = '';

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url, {
      bfm: true,
      bfmInventoryBaseUrl: async (inventoryBaseUrl) => {
        proxy = await startDowngradingProxy(inventoryBaseUrl);
        return proxy.baseUrl;
      },
    });
    await stack.activateProtocol2();
    const draft = await DraftSession.open();
    await draft.patch([{ kind: 'put_type', key: 'acc_protocol', label: 'Protocol type' }]);
    const published = await draft.mustPublish({
      minimumProtocol: 2,
      note: 'S6 protocol 2 catalogue',
    });
    catalogueRevision = published.revision.revision;
    typeId = typeByKey(published, 'acc_protocol').id;
  });

  afterAll(async () => {
    await stack.stop();
    await proxy?.close();
  });

  it('S6.1 Inventory refuses a protocol-1 sync client with 426 and serves protocol 2', async () => {
    const old = await stack.inventorySync('/sync/snapshot', 1);
    expect(old.status).toBe(426);
    expect(tooOldSchema.parse(old.body).code).toBe('client_too_old');

    const current = await stack.inventorySync('/sync/snapshot', 2);
    expect(current.status).toBe(200);
    expect(snapshotSchema.parse(current.body).minimumProtocol).toBe(2);
  });

  it('S6.2 the phone syncs through a protocol-2 BFM and is told the minimum is 2', async () => {
    const bfm = stack.bfm;
    if (bfm === undefined || proxy === undefined) throw new Error('BFM did not start');
    proxy.downgrade = false;
    const snapshot = await bfm.get('/mobile/inventory/sync/snapshot');
    expect(snapshot.status).toBe(200);
    expect(snapshotSchema.parse(snapshot.body).minimumProtocol).toBe(2);
  });

  it('S6.3 a protocol-1 BFM relay turns into update-required (426 client_too_old) for the phone', async () => {
    const bfm = stack.bfm;
    if (bfm === undefined || proxy === undefined) throw new Error('BFM did not start');
    proxy.downgrade = true;
    try {
      const snapshot = await bfm.get('/mobile/inventory/sync/snapshot');
      expect(snapshot.status).toBe(426);
      expect(tooOldSchema.parse(snapshot.body).code).toBe('client_too_old');

      const mutations = await bfm.post('/mobile/inventory/mutations', {
        mutations: [
          {
            mutationId: randomUUID(),
            op: 'item.create',
            entityId: randomUUID(),
            baseRevision: null,
            catalogueRevision,
            dependsOn: [],
            clientTime: '2026-09-24T00:00:00.000Z',
            args: { item: { name: 'Refused by an old relay', typeId, values: [] } },
          },
        ],
      });
      expect(mutations.status, mutations.text).toBe(426);
    } finally {
      proxy.downgrade = false;
    }
    expect((await bfm.get('/mobile/inventory/sync/snapshot')).status).toBe(200);
  });

  it('S6.4 the rollout refuses a downgrade and a protocol this build does not support', async () => {
    const downgrade = await stack.inventory('/type-catalogue/protocol-rollout', {
      body: { expectedMinimumProtocol: 2, minimumProtocol: 1 },
    });
    expect(downgrade.status).toBe(409);
    expect(errorCodeSchema.parse(downgrade.body).code).toBe('protocol_minimum_downgrade');

    const unsupported = await stack.inventory('/type-catalogue/protocol-rollout', {
      body: { expectedMinimumProtocol: 2, minimumProtocol: 3 },
    });
    expect(unsupported.status).toBe(400);
    expect(errorCodeSchema.parse(unsupported.body).code).toBe('protocol_not_supported');
  });
});
