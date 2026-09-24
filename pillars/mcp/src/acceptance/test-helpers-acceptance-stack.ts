/**
 * The real stack the inventory-types acceptance suite (POPS-4354) runs
 * against: `registry` + `inventory` from `live-seam-harness.ts`, plus, when a
 * scenario crosses the phone boundary, a real `bfm` paired the way a phone
 * pairs — an operator pairing code redeemed over `POST /devices/pair` with a
 * freshly generated P-256 key — so every BFM call carries a genuine device
 * access token rather than a row written into BFM's database.
 *
 * BFM is given its production inventory grant (the `inventory.*` subset of
 * `BFM_SERVICE_ACCOUNT_SCOPES`), not the root scope MCP holds, so a
 * scenario that passes through BFM proves the relay works with the
 * authority it actually has.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { startLiveSeam, type LiveSeam } from '../tools/__tests__/live-seam-harness.js';

const BFM_INVENTORY_SCOPES = [
  'inventory.sync',
  'inventory.types',
  'inventory.codes',
  'inventory.media',
] as const;

const INVENTORY_PROTOCOL_HEADER = 'pops-inventory-protocol';

const pairingCodeSchema = z.object({ code: z.string().min(1) });
const pairedDeviceSchema = z.object({ deviceId: z.string(), accessToken: z.string().min(1) });
const rolloutSchema = z.object({
  minimumProtocol: z.number().int().positive(),
  supportedProtocol: z.number().int().positive(),
  catalogueMinimumProtocol: z.number().int().positive(),
});

/** A JSON response: its status, its exact bytes as text, and the parsed body. */
export interface JsonResponse {
  readonly status: number;
  readonly text: string;
  readonly body: unknown;
}

async function readJson(response: Response): Promise<JsonResponse> {
  const text = await response.text();
  return { status: response.status, text, body: text === '' ? null : JSON.parse(text) };
}

/** A paired phone talking to a real BFM process. */
export interface AcceptanceBfm {
  readonly baseUrl: string;
  readonly deviceId: string;
  get(path: string): Promise<JsonResponse>;
  post(path: string, body: unknown): Promise<JsonResponse>;
}

/** The booted stack a scenario drives; `stop()` it in `afterAll`. */
export interface AcceptanceStack {
  readonly seam: LiveSeam;
  /** Present only when the scenario asked for BFM. */
  readonly bfm: AcceptanceBfm | undefined;
  /** An Inventory REST call carrying MCP's service-account key. */
  inventory(path: string, init?: { method?: string; body?: unknown }): Promise<JsonResponse>;
  /** An Inventory sync-protocol call at an explicit protocol version. */
  inventorySync(path: string, protocol: number): Promise<JsonResponse>;
  /** Raises the persisted sync minimum to protocol 2 through the owner rollout route. */
  activateProtocol2(): Promise<void>;
  stop(): Promise<void>;
}

/** Options for {@link startAcceptanceStack}. */
export interface AcceptanceStackOptions {
  /** Boot a paired BFM in front of Inventory. */
  readonly bfm?: boolean;
  /**
   * Rewrites the base URL BFM reaches Inventory at, e.g. to put a proxy in
   * front of it. Receives Inventory's real base URL.
   */
  readonly bfmInventoryBaseUrl?: (inventoryBaseUrl: string) => Promise<string> | string;
}

async function pairDevice(bfmBaseUrl: string): Promise<{ deviceId: string; token: string }> {
  const minted = await readJson(
    await fetch(`${bfmBaseUrl}/operator/pairing/codes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  );
  if (minted.status !== 200 && minted.status !== 201) {
    throw new Error(
      `pairing code refused: ${String(minted.status)} ${JSON.stringify(minted.body)}`
    );
  }
  const { code } = pairingCodeSchema.parse(minted.body);
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const paired = await readJson(
    await fetch(`${bfmBaseUrl}/devices/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        publicKey: spki,
        deviceName: 'Acceptance phone',
        deviceModel: 'iPhone17,1',
      }),
    })
  );
  if (paired.status !== 200 && paired.status !== 201) {
    throw new Error(`pairing refused: ${String(paired.status)} ${JSON.stringify(paired.body)}`);
  }
  const device = pairedDeviceSchema.parse(paired.body);
  return { deviceId: device.deviceId, token: device.accessToken };
}

async function startBfm(
  seam: LiveSeam,
  tempDir: string,
  inventoryBaseUrl: string
): Promise<{ process: SpawnedPillarProcess; bfm: AcceptanceBfm }> {
  const bfmKey = await seam.mintKey('bfm-acceptance', BFM_INVENTORY_SCOPES);
  const port = await getFreePort();
  const bfmProcess = await spawnPillarProcess({
    label: 'bfm',
    cwd: resolvePillarDir(import.meta.url, 'bfm'),
    port,
    env: {
      NODE_ENV: 'test',
      POPS_REGISTRY_ENABLED: 'true',
      POPS_REGISTRY_URL: seam.registryBaseUrl,
      POPS_INTERNAL_BASE_URLS: `inventory:${inventoryBaseUrl}`,
      BFM_SQLITE_PATH: join(tempDir, 'bfm.db'),
      BFM_SELF_BASE_URL: `http://127.0.0.1:${String(port)}`,
      BFM_ACCESS_TOKEN_SECRET: randomBytes(32).toString('hex'),
      POPS_INTERNAL_API_KEY: bfmKey,
    },
  });
  const { deviceId, token } = await pairDevice(bfmProcess.baseUrl);
  const authorization = `Bearer ${token}`;
  return {
    process: bfmProcess,
    bfm: {
      baseUrl: bfmProcess.baseUrl,
      deviceId,
      get: async (path) =>
        readJson(await fetch(`${bfmProcess.baseUrl}${path}`, { headers: { authorization } })),
      post: async (path, body) =>
        readJson(
          await fetch(`${bfmProcess.baseUrl}${path}`, {
            method: 'POST',
            headers: { authorization, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        ),
    },
  };
}

/**
 * Boots a fresh stack for one scenario. Nothing is shared between scenarios:
 * each gets its own registry, Inventory database and (optionally) BFM.
 */
export async function startAcceptanceStack(
  callerImportMetaUrl: string,
  options: AcceptanceStackOptions = {}
): Promise<AcceptanceStack> {
  const seam = await startLiveSeam(callerImportMetaUrl);
  seam.useDefaultKey();
  const tempDir = mkdtempSync(join(tmpdir(), 'inventory-acceptance-'));
  let bfmProcess: SpawnedPillarProcess | undefined;
  let bfm: AcceptanceBfm | undefined;
  if (options.bfm === true) {
    const inventoryBaseUrl =
      options.bfmInventoryBaseUrl === undefined
        ? seam.inventoryBaseUrl
        : await options.bfmInventoryBaseUrl(seam.inventoryBaseUrl);
    const started = await startBfm(seam, tempDir, inventoryBaseUrl);
    bfmProcess = started.process;
    bfm = started.bfm;
  }

  const inventory: AcceptanceStack['inventory'] = async (path, init = {}) =>
    readJson(
      await fetch(`${seam.inventoryBaseUrl}${path}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: { 'content-type': 'application/json', 'x-api-key': seam.apiKey },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      })
    );

  return {
    seam,
    bfm,
    inventory,
    inventorySync: async (path, protocol) =>
      readJson(
        await fetch(`${seam.inventoryBaseUrl}${path}`, {
          headers: { 'x-api-key': seam.apiKey, [INVENTORY_PROTOCOL_HEADER]: String(protocol) },
        })
      ),
    activateProtocol2: async () => {
      const current = await inventory('/type-catalogue/protocol-rollout');
      const state = rolloutSchema.parse(current.body);
      if (state.minimumProtocol >= 2) return;
      const activated = await inventory('/type-catalogue/protocol-rollout', {
        body: { expectedMinimumProtocol: state.minimumProtocol, minimumProtocol: 2 },
      });
      if (activated.status !== 200) {
        throw new Error(
          `protocol rollout refused: ${String(activated.status)} ${JSON.stringify(activated.body)}`
        );
      }
    },
    stop: async () => {
      await bfmProcess?.stop();
      await seam.stop();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
