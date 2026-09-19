import { createServer, type IncomingMessage, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  INVENTORY_PILLAR_ID,
  inventoryRegistryEntry,
  startInventoryGate,
} from '../ios-e2e/inventory-pillar.mjs';

describe('the inventory registry entry', () => {
  const entry = inventoryRegistryEntry({
    baseUrl: 'http://127.0.0.1:4343',
    now: '2026-09-19T00:00:00.000Z',
  });

  it('carries the pillar id the bfm maps the inventory feature onto', () => {
    // `MOBILE_FEATURES` in `pillars/bfm/src/api/mobile/features.ts` maps
    // `inventory` onto this id; a typo would leave the tab withheld forever.
    expect(entry.pillarId).toBe('inventory');
    expect(INVENTORY_PILLAR_ID).toBe('inventory');
    expect(entry.manifest.pillar).toBe(entry.pillarId);
  });

  it('points at the address it was handed, registered and healthy', () => {
    expect(entry.baseUrl).toBe('http://127.0.0.1:4343');
    expect(entry.registered).toBe(true);
    expect(entry.status).toBe('healthy');
  });
});

interface Seen {
  method: string;
  url: string;
  body: string;
}

describe('the inventory gate', () => {
  let pillar: Server;
  let seen: Seen[];
  let gate: Awaited<ReturnType<typeof startInventoryGate>>;

  beforeEach(async () => {
    seen = [];
    pillar = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        seen.push({
          method: String(request.method),
          url: String(request.url),
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(207, { 'content-type': 'application/json', 'x-from': 'inventory' });
        response.end(JSON.stringify({ answered: request.url }));
      });
    });
    await new Promise<void>((resolve) => pillar.listen(0, '127.0.0.1', resolve));
    const address = pillar.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    gate = await startInventoryGate({ pillarBaseUrl: `http://127.0.0.1:${String(address.port)}` });
  });

  afterEach(async () => {
    await gate.close();
    await new Promise<void>((resolve) => pillar.close(() => resolve()));
  });

  it('withholds the pillar by refusing /openapi until armed, and never asks the pillar', async () => {
    expect(gate.isReachable()).toBe(false);
    await expect(fetch(`${gate.url}/openapi`)).rejects.toThrow();
    expect(seen).toEqual([]);
  });

  it('forwards /openapi once armed, and refuses it again once disarmed', async () => {
    gate.setReachable(true);
    const answered = await fetch(`${gate.url}/openapi`);
    expect(answered.status).toBe(207);
    expect(answered.headers.get('x-from')).toBe('inventory');

    gate.setReachable(false);
    await expect(fetch(`${gate.url}/openapi`)).rejects.toThrow();
  });

  it('forwards every other route untouched, armed or not: method, path, query and body', async () => {
    const answered = await fetch(`${gate.url}/sync/mutations?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"mutations":[]}',
    });

    expect(answered.status).toBe(207);
    expect(await answered.json()).toEqual({ answered: '/sync/mutations?x=1' });
    expect(seen).toEqual([
      { method: 'POST', url: '/sync/mutations?x=1', body: '{"mutations":[]}' },
    ]);
  });

  it('refuses every relayed route during a sync outage, keeping /openapi and /health', async () => {
    gate.setReachable(true);
    gate.setSyncOutage(true);

    await expect(
      fetch(`${gate.url}/sync/mutations`, { method: 'POST', body: '{"mutations":[]}' })
    ).rejects.toThrow();
    await expect(fetch(`${gate.url}/sync/changes?cursor=1`)).rejects.toThrow();
    expect((await fetch(`${gate.url}/openapi`)).status).toBe(207);
    expect((await fetch(`${gate.url}/health`)).status).toBe(207);
    expect(seen.map((request) => request.url)).toEqual(['/openapi', '/health']);

    gate.setSyncOutage(false);
    expect((await fetch(`${gate.url}/sync/changes?cursor=1`)).status).toBe(207);
    expect(gate.isSyncOutage()).toBe(false);
  });

  it('reports a pillar it cannot reach as its own failure', async () => {
    await new Promise<void>((resolve) => {
      pillar.closeAllConnections();
      pillar.close(() => resolve());
    });
    pillar = createServer();
    await new Promise<void>((resolve) => pillar.listen(0, '127.0.0.1', resolve));

    const answered = await fetch(`${gate.url}/health`);

    expect(answered.status).toBe(502);
    expect(await answered.json()).toEqual({
      message: expect.stringContaining('could not reach the pillar'),
    });
  });
});
