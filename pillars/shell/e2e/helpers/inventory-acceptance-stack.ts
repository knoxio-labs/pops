/**
 * A real `registry` + `inventory` pair for the inventory-types acceptance
 * spec (POPS-4354), and the `page.route` that forwards the web app's
 * `/inventory-api/*` calls to it.
 *
 * Every other spec here stubs the REST surface (`e2e/README.md`, "No backend
 * runs"). The acceptance spec is the one exception, and it is opt-in: it runs
 * only under `INVENTORY_ACCEPTANCE=1`, which `mise run inventory:acceptance
 * -- --web` sets. The forwarded calls carry a service-account key granted the
 * inventory root scope, which is how an owner-authorised editor reaches the
 * catalogue routes without a Cloudflare Access session in front of it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  waitForRegistration,
} from '@pops/pillar-sdk/testing';

import type { Page } from '@playwright/test';

const INVENTORY_API_URL = /^https?:\/\/[^/]+\/inventory-api\//;
const serviceAccountSchema = z.object({ plaintextKey: z.string().min(1) });

/** The booted pair and a key for talking to Inventory as a second editor would. */
export interface InventoryAcceptanceStack {
  readonly inventoryBaseUrl: string;
  readonly apiKey: string;
  /** A JSON call straight to Inventory, bypassing the browser. */
  call(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<{ status: number; body: unknown }>;
  stop(): Promise<void>;
}

/** Boots registry + inventory on a temp directory and mints an owner-scoped key. */
export async function startInventoryAcceptanceStack(): Promise<InventoryAcceptanceStack> {
  const tempDir = mkdtempSync(join(tmpdir(), 'inventory-acceptance-web-'));
  const registry = await spawnPillarProcess({
    label: 'registry',
    cwd: resolvePillarDir(import.meta.url, 'registry'),
    port: await getFreePort(),
    env: { POPS_REGISTRY_ENABLED: 'true', REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db') },
  });
  const inventoryPort = await getFreePort();
  const inventory = await spawnPillarProcess({
    label: 'inventory',
    cwd: resolvePillarDir(import.meta.url, 'inventory'),
    port: inventoryPort,
    env: {
      POPS_REGISTRY_ENABLED: 'true',
      POPS_REGISTRY_URL: registry.baseUrl,
      INVENTORY_SQLITE_PATH: join(tempDir, 'inventory.db'),
      INVENTORY_SELF_BASE_URL: `http://127.0.0.1:${String(inventoryPort)}`,
    },
  });
  await waitForRegistration(registry.baseUrl, 'inventory');
  const minted = await fetch(`${registry.baseUrl}/service-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'web-acceptance', scopes: ['inventory'] }),
  });
  const { plaintextKey } = serviceAccountSchema.parse(await minted.json());

  return {
    inventoryBaseUrl: inventory.baseUrl,
    apiKey: plaintextKey,
    call: async (path, init = {}) => {
      const response = await fetch(`${inventory.baseUrl}${path}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: { 'content-type': 'application/json', 'x-api-key': plaintextKey },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text === '' ? null : JSON.parse(text) };
    },
    stop: async () => {
      await inventory.stop();
      await registry.stop();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/** Forwards every `/inventory-api/*` call the page makes to the real Inventory. */
export async function forwardInventoryApi(
  page: Page,
  stack: InventoryAcceptanceStack
): Promise<void> {
  await page.route(INVENTORY_API_URL, async (route) => {
    const request = route.request();
    const source = new URL(request.url());
    const target = `${stack.inventoryBaseUrl}${source.pathname.replace(/^\/inventory-api/, '')}${source.search}`;
    const response = await route.fetch({
      url: target,
      headers: { ...request.headers(), 'x-api-key': stack.apiKey },
    });
    await route.fulfill({ response });
  });
}
