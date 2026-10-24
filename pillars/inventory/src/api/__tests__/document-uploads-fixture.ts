/**
 * Shared doubles for the item-document upload suites: a documents client
 * whose every call fails loudly unless a test supplies it, the real client
 * wired to a fake `fetch` and discovery, and an app over a temp database.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import {
  createDocumentUploadsClient,
  type DocumentUploadsClient,
  type PaperlessTaskStatus,
  type TaskLookup,
} from '../documents/uploads-client.js';

import type { Express } from 'express';

import type { PillarSnapshot } from '@pops/pillar-sdk/discovery';
import type { ErrorBody } from '@pops/types';

/** The base URL discovery reports for documents in these suites. */
export const DOCUMENTS_BASE_URL = 'http://documents-api:3012';

function unexpected(name: string): never {
  throw new Error(`documents ${name} called unexpectedly`);
}

/** A documents client whose unsupplied calls throw. */
export function fakeUploads(overrides: Partial<DocumentUploadsClient> = {}): DocumentUploadsClient {
  return {
    taskStatus: () => unexpected('taskStatus'),
    maxUploadBytes: () => unexpected('maxUploadBytes'),
    updateTitle: () => unexpected('updateTitle'),
    upload: () => unexpected('upload'),
    download: () => unexpected('download'),
    ...overrides,
  };
}

/** Answer task lookups from a mutable table; an absent task id is documents' 404. */
export function taskTable(table: Map<string, PaperlessTaskStatus | 'unreachable'>) {
  return async (taskId: string): Promise<TaskLookup> => {
    const entry = table.get(taskId);
    if (entry === undefined) return { kind: 'unknown' };
    if (entry === 'unreachable') return { kind: 'unreachable' };
    return { kind: 'resolved', status: entry };
  };
}

/** A registered documents pillar, as discovery returns it. */
export function documentsSnapshot(): PillarSnapshot {
  return {
    pillarId: 'documents',
    baseUrl: DOCUMENTS_BASE_URL,
    manifest: {
      pillar: 'documents',
      version: '0.1.0',
      contract: { package: '@pops/documents', version: '0.1.0', tag: 'contract-documents@v0.1.0' },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
    },
    registered: true,
    lastSeenAt: new Date(),
    status: 'healthy',
  };
}

/** The real client's byte legs over `fetchImpl`, with the SDK-backed calls replaced. */
export function realByteLegs(
  fetchImpl: typeof fetch,
  overrides: Partial<DocumentUploadsClient> = {}
): DocumentUploadsClient {
  const real = createDocumentUploadsClient({
    lookupDocumentsPillar: () => Promise.resolve(documentsSnapshot()),
    fetchImpl,
  });
  return fakeUploads({ upload: real.upload, download: real.download, ...overrides });
}

/** A JSON response the way documents answers. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Documents' error envelope for `code`. */
export function documentsError(code: string, message: string, details?: unknown): ErrorBody {
  return { code, message, requestId: 'req-documents', retryable: false, details };
}

/** A temp inventory database, opened per test and removed after. */
export function tempInventoryDb(): { open: () => OpenedInventoryDb; close: () => void } {
  let dir: string | undefined;
  let db: OpenedInventoryDb | undefined;
  return {
    open: () => {
      dir = mkdtempSync(join(tmpdir(), 'inventory-document-uploads-test-'));
      db = openInventoryDb(join(dir, 'inventory.db'));
      return db;
    },
    close: () => {
      db?.raw.close();
      if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The inventory app over `inventoryDb` with `uploads` as its documents client. */
export function appWith(inventoryDb: OpenedInventoryDb, uploads: DocumentUploadsClient): Express {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    documents: {
      getPaperlessStatus: () =>
        Promise.resolve({
          configured: true,
          available: true,
          baseUrl: null,
          documentCount: null,
          maxUploadBytes: null,
          allowedMimeTypes: null,
        }),
      searchPaperlessDocuments: () => Promise.resolve({ ok: true, documents: [] }),
      paperlessDocumentMissing: () => Promise.resolve(false),
    },
    documentUploads: uploads,
  });
}
