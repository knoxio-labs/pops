/**
 * Tests for the inventory direct-upload document static-file route.
 *
 * The route is filesystem-only (no DB), so we exercise it with real fixture
 * files in a temp dir set as INVENTORY_DOCUMENTS_DIR.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import documentFilesRouter from './document-files.js';

let tempDir: string;
let originalEnv: string | undefined;

function createTestApp(): express.Express {
  const app = express();
  app.use(documentFilesRouter);
  return app;
}

const ITEM_ID = 'abc123def456789012345678901234ab';

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `pops-doc-files-route-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tempDir, { recursive: true });
  originalEnv = process.env.INVENTORY_DOCUMENTS_DIR;
  process.env.INVENTORY_DOCUMENTS_DIR = tempDir;
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.INVENTORY_DOCUMENTS_DIR;
  } else {
    process.env.INVENTORY_DOCUMENTS_DIR = originalEnv;
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/inventory/documents/items/:itemId/:filename', () => {
  describe('successful serving', () => {
    it('serves an existing PDF with content-type application/pdf and cache headers', async () => {
      const itemDir = join(tempDir, 'items', ITEM_ID);
      mkdirSync(itemDir, { recursive: true });
      const fileBytes = Buffer.from('%PDF-1.4 minimal');
      writeFileSync(join(itemDir, 'file_001.pdf'), fileBytes);

      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_001.pdf`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['cache-control']).toBe('private, max-age=3600');
      expect(res.headers['etag']).toBeDefined();
      expect(res.body).toEqual(fileBytes);
    });

    it('serves a plain-text upload with text/plain content-type', async () => {
      const itemDir = join(tempDir, 'items', ITEM_ID);
      mkdirSync(itemDir, { recursive: true });
      const text = Buffer.from('hello world\n');
      writeFileSync(join(itemDir, 'file_002.txt'), text);

      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_002.txt`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toBe('hello world\n');
    });
  });

  describe('not found', () => {
    it('returns 404 when the item directory does not exist', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_001.pdf`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('returns 404 when the file is missing inside an existing item dir', async () => {
      mkdirSync(join(tempDir, 'items', ITEM_ID), { recursive: true });
      const app = createTestApp();

      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_999.pdf`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });
  });

  describe('parameter validation', () => {
    it('returns 400 for an itemId containing path traversal segments', async () => {
      const app = createTestApp();
      const res = await request(app).get(
        '/api/inventory/documents/items/..%2Fetc%2Fpasswd/file_001.pdf'
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid item id');
    });

    it('returns 400 for filename without sequence number', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_.pdf`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid filename');
    });

    it('returns 400 for filename without an extension', async () => {
      const app = createTestApp();
      const res = await request(app).get(`/api/inventory/documents/items/${ITEM_ID}/file_001`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid filename');
    });
  });
});
