/**
 * Shared setup for the sync protocol suites: a real app over a fresh
 * migrated database, a fake service-account verifier and a Paperless stub,
 * plus builders for wire mutations. Requests go through the caller's
 * `createTestTransport()`, which each suite registers at module scope.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import type { AiClient } from '../ai/client.js';
import type { DocumentsClient, PaperlessStatus } from '../documents/client.js';
import type { BoundAgent, Test, TestTransport } from './test-http.js';

/** A key the fake verifier recognises; never a real credential. */
export const SYNC_KEY = 'pops_sa_synctest.not-a-real-secret';

/** The protocol header every sync request carries. */
export const PROTOCOL: Record<string, string> = { 'Pops-Inventory-Protocol': '1' };

/** A verifier granting `scopes` to the account `name`. */
export function granting(scopes: readonly string[], name = 'bfm'): ServiceAccountVerifier {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: { id: `sa_${name}`, name, scopes },
  };
  return () => Promise.resolve(verification);
}

/** A documents client whose Paperless reports `status`. */
export function paperless(status: Partial<PaperlessStatus> = {}): DocumentsClient {
  return {
    getPaperlessStatus: () =>
      Promise.resolve({ configured: true, available: true, baseUrl: null, ...status }),
    searchPaperlessDocuments: () => Promise.resolve([]),
  };
}

export interface SyncHarness {
  readonly db: OpenedInventoryDb;
  readonly api: BoundAgent;
  close(): void;
}

/** Open a fresh database and app. Call `close()` in `afterEach`. */
export function openSyncHarness(
  transport: TestTransport,
  options: { verify?: ServiceAccountVerifier; documents?: DocumentsClient; ai?: AiClient } = {}
): SyncHarness {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-sync-test-'));
  const db = openInventoryDb(join(dir, 'inventory.db'));
  const app = createInventoryApiApp({
    inventoryDb: db,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: options.verify ?? granting([]),
    documents: options.documents ?? paperless(),
    ...(options.ai === undefined ? {} : { ai: options.ai }),
  });
  return {
    db,
    api: transport.requestOn(app),
    close() {
      db.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** One wire mutation. */
export interface WireMutation {
  mutationId: string;
  op: string;
  entityId: string;
  baseRevision: number | null;
  catalogueRevision?: number;
  dependsOn: string[];
  clientTime: string;
  args: unknown;
}

/** A mutation with a fresh id and no base revision unless given. */
export function wireMutation(
  op: string,
  entityId: string,
  args: unknown,
  extra: Partial<WireMutation> = {}
): WireMutation {
  return {
    mutationId: randomUUID(),
    op,
    entityId,
    baseRevision: null,
    dependsOn: [],
    clientTime: '2026-09-19T10:00:00.000Z',
    args,
    ...extra,
  };
}

/** `location.create` for a root place. */
export function createLocation(
  id: string,
  name: string,
  parentId: string | null = null
): WireMutation {
  return wireMutation('location.create', id, { location: { name, parentId } });
}

/** `item.create` at `placement` (in hand by default). */
export function createItem(
  id: string,
  name: string,
  placement: unknown = { kind: 'hand' }
): WireMutation {
  return wireMutation('item.create', id, { item: { name, placement } });
}

/** POST a batch as an uncredentialled caller and return the response. */
export function send(api: BoundAgent, mutations: readonly WireMutation[]): Test {
  return api.post('/sync/mutations').set(PROTOCOL).send({ mutations });
}
