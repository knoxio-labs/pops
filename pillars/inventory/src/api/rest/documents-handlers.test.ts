import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itemDocuments, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { makeClient } from '../__tests__/test-utils.js';
import { createInventoryApiApp } from '../app.js';

import type { DocumentsClient } from '../documents/client.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-documents-handlers-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function documentsClient(
  paperlessDocumentMissing: DocumentsClient['paperlessDocumentMissing']
): DocumentsClient {
  return {
    getPaperlessStatus: () => Promise.resolve({ configured: true, available: true, baseUrl: null }),
    searchPaperlessDocuments: () => Promise.resolve([]),
    paperlessDocumentMissing,
  };
}

function app(documents: DocumentsClient) {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    documents,
  });
}

function addDocument(itemId: string, paperlessDocumentId: number, title: string): void {
  inventoryDb.db
    .insert(itemDocuments)
    .values({ itemId, paperlessDocumentId, documentType: 'manual', title })
    .run();
}

describe('documents.listForItem', () => {
  it('flags Paperless documents that were deleted and keeps resolved links present', async () => {
    const missing = vi.fn(async (id: number): Promise<boolean | null> => id === 404);
    const api = app(documentsClient(missing));
    const item = await makeClient(api).items.create({ itemName: 'Manuals' });
    addDocument(item.data.id, 404, 'Deleted manual');
    addDocument(item.data.id, 200, 'Current manual');

    const response = await requestOn(api).get(`/items/${item.data.id}/documents`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ paperlessDocumentId: 404, missing: true }),
      expect.objectContaining({ paperlessDocumentId: 200, missing: false }),
    ]);
    expect(missing).toHaveBeenCalledTimes(2);
    expect(missing).toHaveBeenCalledWith(404);
    expect(missing).toHaveBeenCalledWith(200);
  });

  it('reports null when Paperless availability cannot be established', async () => {
    const api = app(documentsClient(async () => null));
    const item = await makeClient(api).items.create({ itemName: 'Unavailable document' });
    addDocument(item.data.id, 503, 'Unknown manual');

    const response = await requestOn(api).get(`/items/${item.data.id}/documents`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({ paperlessDocumentId: 503, missing: null }),
    ]);
  });

  it('does not call Paperless for an empty page', async () => {
    const missing = vi.fn(async (): Promise<boolean | null> => true);
    const api = app(documentsClient(missing));
    const item = await makeClient(api).items.create({ itemName: 'No documents' });

    const response = await requestOn(api).get(`/items/${item.data.id}/documents`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(missing).not.toHaveBeenCalled();
  });
});
