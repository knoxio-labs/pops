/**
 * Item uploaded-files (direct, non-Paperless) tRPC router tests.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCaller,
  seedInventoryItem,
  seedItemUploadedFile,
  setupTestContext,
} from '../../../shared/test-utils.js';

import type { Database } from 'better-sqlite3';

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

interface SandboxedEnv {
  tempDir: string;
  restore: () => void;
}

/** Set INVENTORY_DOCUMENTS_DIR to a fresh temp dir for the duration of a test. */
function withDocumentsDir(label: string): SandboxedEnv {
  const tempDir = join(
    tmpdir(),
    `pops-docs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(tempDir, { recursive: true });
  const original = process.env.INVENTORY_DOCUMENTS_DIR;
  process.env.INVENTORY_DOCUMENTS_DIR = tempDir;
  return {
    tempDir,
    restore: () => {
      if (original === undefined) {
        delete process.env.INVENTORY_DOCUMENTS_DIR;
      } else {
        process.env.INVENTORY_DOCUMENTS_DIR = original;
      }
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe('inventory.documentFiles.upload', () => {
  it('writes the file to INVENTORY_DOCUMENTS_DIR with a sequential filename', async () => {
    const env = withDocumentsDir('upload-happy');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });
      const buffer = Buffer.from('%PDF-1.4 fake receipt body');

      const result = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: 'receipt.pdf',
        mimeType: 'application/pdf',
        fileBase64: buffer.toString('base64'),
      });

      expect(result.message).toBe('Document uploaded');
      expect(result.data.itemId).toBe(itemId);
      expect(result.data.fileName).toBe('receipt.pdf');
      expect(result.data.mimeType).toBe('application/pdf');
      expect(result.data.fileSize).toBe(buffer.byteLength);
      expect(result.data.filePath).toMatch(/^items\/.+\/file_001\.pdf$/);

      // File written to disk under the env-configured base dir.
      const fullPath = join(env.tempDir, result.data.filePath);
      expect(existsSync(fullPath)).toBe(true);
    } finally {
      env.restore();
    }
  });

  it('uses sequential filenames for repeated uploads on the same item', async () => {
    const env = withDocumentsDir('upload-seq');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });
      const buffer = Buffer.from('hello world');
      const base64 = buffer.toString('base64');

      const r1 = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: 'first.txt',
        mimeType: 'text/plain',
        fileBase64: base64,
      });
      const r2 = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: 'second.txt',
        mimeType: 'text/plain',
        fileBase64: base64,
      });
      const r3 = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: 'third.txt',
        mimeType: 'text/plain',
        fileBase64: base64,
      });

      expect(r1.data.filePath).toMatch(/file_001\.txt$/);
      expect(r2.data.filePath).toMatch(/file_002\.txt$/);
      expect(r3.data.filePath).toMatch(/file_003\.txt$/);
    } finally {
      env.restore();
    }
  });

  it('persists a row to item_uploaded_files with the recorded metadata', async () => {
    const env = withDocumentsDir('upload-db');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });
      const buffer = Buffer.from('plain receipt');

      const result = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: 'receipt.txt',
        mimeType: 'text/plain',
        fileBase64: buffer.toString('base64'),
      });

      const row = db
        .prepare('SELECT * FROM item_uploaded_files WHERE id = ?')
        .get(result.data.id) as
        | {
            item_id: string;
            file_name: string;
            file_path: string;
            mime_type: string;
            file_size: number;
          }
        | undefined;

      expect(row).toBeDefined();
      expect(row!.item_id).toBe(itemId);
      expect(row!.file_name).toBe('receipt.txt');
      expect(row!.file_path).toMatch(/^items\/.+\/file_001\.txt$/);
      expect(row!.mime_type).toBe('text/plain');
      expect(row!.file_size).toBe(buffer.byteLength);
    } finally {
      env.restore();
    }
  });

  it('throws NOT_FOUND when item does not exist', async () => {
    const env = withDocumentsDir('upload-notfound');
    try {
      await expect(
        caller.inventory.documentFiles.upload({
          itemId: 'does-not-exist',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          fileBase64: Buffer.from('hi').toString('base64'),
        })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.inventory.documentFiles.upload({
          itemId: 'does-not-exist',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          fileBase64: Buffer.from('hi').toString('base64'),
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('NOT_FOUND');
      }
    } finally {
      env.restore();
    }
  });

  it('rejects unsupported MIME types as BAD_REQUEST', async () => {
    const env = withDocumentsDir('upload-mime');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });

      await expect(
        caller.inventory.documentFiles.upload({
          itemId,
          fileName: 'evil.exe',
          mimeType: 'application/x-msdownload',
          fileBase64: Buffer.from('MZ').toString('base64'),
        })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.inventory.documentFiles.upload({
          itemId,
          fileName: 'evil.exe',
          mimeType: 'application/x-msdownload',
          fileBase64: Buffer.from('MZ').toString('base64'),
        });
      } catch (err) {
        expect((err as TRPCError).code).toBe('BAD_REQUEST');
      }
    } finally {
      env.restore();
    }
  });

  it("rejects path traversal in user-supplied file names ('..')", async () => {
    const env = withDocumentsDir('upload-traversal');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });

      await expect(
        caller.inventory.documentFiles.upload({
          itemId,
          fileName: '..',
          mimeType: 'application/pdf',
          fileBase64: Buffer.from('x').toString('base64'),
        })
      ).rejects.toThrow(TRPCError);
    } finally {
      env.restore();
    }
  });

  it('strips path components from a malicious file name (writes inside item dir)', async () => {
    const env = withDocumentsDir('upload-strip');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'Camera' });

      // The service runs basename() on the supplied name then renames the
      // on-disk file to `file_NNN.{ext}`, so a path-laden input cannot escape.
      const result = await caller.inventory.documentFiles.upload({
        itemId,
        fileName: '../../etc/passwd',
        mimeType: 'text/plain',
        fileBase64: Buffer.from('x').toString('base64'),
      });

      // Output path must live under items/{itemId}/, not anywhere parent.
      expect(result.data.filePath.startsWith(`items/${itemId}/`)).toBe(true);
      expect(result.data.filePath).not.toContain('..');
      // Stored file_name preserves the basename (no traversal segments).
      expect(result.data.fileName).toBe('passwd');
    } finally {
      env.restore();
    }
  });

  it('throws UNAUTHORIZED without auth', async () => {
    const env = withDocumentsDir('upload-auth');
    try {
      const unauth = createCaller(false);
      await expect(
        unauth.inventory.documentFiles.upload({
          itemId: 'a',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          fileBase64: 'dGVzdA==',
        })
      ).rejects.toThrow(TRPCError);
    } finally {
      env.restore();
    }
  });
});

describe('inventory.documentFiles.listForItem', () => {
  it('returns empty list when no files exist for the item', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'TV' });

    const result = await caller.inventory.documentFiles.listForItem({ itemId });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('lists files newest-first and filters by item', async () => {
    const itemA = seedInventoryItem(db, { item_name: 'TV' });
    const itemB = seedInventoryItem(db, { item_name: 'Radio' });
    const oldId = seedItemUploadedFile(db, {
      item_id: itemA,
      file_name: 'old.pdf',
      file_path: `items/${itemA}/file_001.pdf`,
    });
    // Backdate the older row so ORDER BY uploaded_at DESC has something to do.
    db.prepare(
      "UPDATE item_uploaded_files SET uploaded_at = '2024-01-01 00:00:00' WHERE id = ?"
    ).run(oldId);
    seedItemUploadedFile(db, {
      item_id: itemA,
      file_name: 'new.pdf',
      file_path: `items/${itemA}/file_002.pdf`,
    });
    seedItemUploadedFile(db, {
      item_id: itemB,
      file_name: 'other.pdf',
      file_path: `items/${itemB}/file_001.pdf`,
    });

    const result = await caller.inventory.documentFiles.listForItem({ itemId: itemA });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.fileName).toBe('new.pdf');
    expect(result.data[1]!.fileName).toBe('old.pdf');
    expect(result.pagination.total).toBe(2);
  });

  it('paginates results', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'TV' });
    for (let i = 0; i < 5; i++) {
      seedItemUploadedFile(db, {
        item_id: itemId,
        file_name: `f${i}.pdf`,
        file_path: `items/${itemId}/file_00${i + 1}.pdf`,
      });
    }

    const page = await caller.inventory.documentFiles.listForItem({
      itemId,
      limit: 2,
      offset: 0,
    });

    expect(page.data).toHaveLength(2);
    expect(page.pagination.total).toBe(5);
    expect(page.pagination.hasMore).toBe(true);
  });
});

describe('inventory.documentFiles.removeUpload', () => {
  it('removes the DB row and the on-disk file', async () => {
    const env = withDocumentsDir('remove-disk');
    try {
      const itemId = seedInventoryItem(db, { item_name: 'TV' });
      const filePath = `items/${itemId}/file_001.pdf`;
      const fullPath = join(env.tempDir, filePath);
      mkdirSync(join(env.tempDir, 'items', itemId), { recursive: true });
      writeFileSync(fullPath, 'fake-pdf');

      const id = seedItemUploadedFile(db, {
        item_id: itemId,
        file_name: 'receipt.pdf',
        file_path: filePath,
      });

      expect(existsSync(fullPath)).toBe(true);

      const result = await caller.inventory.documentFiles.removeUpload({ id });
      expect(result.message).toBe('Document removed');

      expect(existsSync(fullPath)).toBe(false);
      const row = db.prepare('SELECT * FROM item_uploaded_files WHERE id = ?').get(id);
      expect(row).toBeUndefined();
    } finally {
      env.restore();
    }
  });

  it('throws NOT_FOUND for a missing id', async () => {
    await expect(caller.inventory.documentFiles.removeUpload({ id: 99999 })).rejects.toThrow(
      TRPCError
    );

    try {
      await caller.inventory.documentFiles.removeUpload({ id: 99999 });
    } catch (err) {
      expect((err as TRPCError).code).toBe('NOT_FOUND');
    }
  });

  it('does not error when the on-disk file is already missing', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'TV' });
    const id = seedItemUploadedFile(db, {
      item_id: itemId,
      file_name: 'gone.pdf',
      file_path: `items/${itemId}/file_999.pdf`,
    });

    const result = await caller.inventory.documentFiles.removeUpload({ id });
    expect(result.message).toBe('Document removed');
  });
});

describe('inventory item cascade — uploaded files', () => {
  it('cascades deletes when the parent inventory item is removed', async () => {
    const itemId = seedInventoryItem(db, { item_name: 'TV' });
    seedItemUploadedFile(db, {
      item_id: itemId,
      file_name: 'a.pdf',
      file_path: `items/${itemId}/file_001.pdf`,
    });
    seedItemUploadedFile(db, {
      item_id: itemId,
      file_name: 'b.pdf',
      file_path: `items/${itemId}/file_002.pdf`,
    });

    db.prepare('DELETE FROM home_inventory WHERE id = ?').run(itemId);

    const remaining = db
      .prepare('SELECT COUNT(*) AS c FROM item_uploaded_files WHERE item_id = ?')
      .get(itemId) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('inventory.documentFiles auth', () => {
  it('throws UNAUTHORIZED on listForItem without auth', async () => {
    const unauth = createCaller(false);
    await expect(unauth.inventory.documentFiles.listForItem({ itemId: 'a' })).rejects.toThrow(
      TRPCError
    );
  });

  it('throws UNAUTHORIZED on removeUpload without auth', async () => {
    const unauth = createCaller(false);
    await expect(unauth.inventory.documentFiles.removeUpload({ id: 1 })).rejects.toThrow(TRPCError);
  });
});
