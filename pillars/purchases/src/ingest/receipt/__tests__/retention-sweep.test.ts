import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../../db/__tests__/helpers.js';
import {
  addExternalReceiptReferences,
  createPurchase,
  removeExternalReceiptReferences,
} from '../../../db/index.js';
import { pendingReceiptCaptures } from '../../../db/schema.js';
import { DEFAULT_RECEIPT_RETENTION_MS, sweepUnreferencedReceipts } from '../retention-sweep.js';
import { receiptUri } from '../store.js';

import type { OpenedPurchasesDb } from '../../../db/index.js';

const SHA_A = 'a'.repeat(64);

let root: string;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

function shardPath(sha: string, extension = 'jpg'): string {
  const dir = join(root, sha.slice(0, 2));
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sha}.${extension}`);
}

function writeReceiptFile(sha: string, ageMs: number, extension = 'jpg'): string {
  const path = shardPath(sha, extension);
  writeFileSync(path, Buffer.from('fake'));
  const mtime = new Date(Date.now() - ageMs);
  utimesSync(path, mtime, mtime);
  return path;
}

function openDb(): { opened: OpenedPurchasesDb; cleanup: () => void } {
  return openTempDb();
}

describe('sweepUnreferencedReceipts', () => {
  it('deletes an unreferenced file older than the window', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    writeReceiptFile(SHA_A, DEFAULT_RECEIPT_RETENTION_MS + 60_000);
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 1, deleted: 1, kept: 0, malformed: 0 });
    } finally {
      cleanup();
    }
  });

  it('expires pending capture metadata at the same retention boundary as its receipt', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const now = new Date();
    const oldReceipt = DEFAULT_RECEIPT_RETENTION_MS + 60_000;
    writeReceiptFile(SHA_A, oldReceipt);
    const { opened, cleanup } = openDb();
    opened.db
      .insert(pendingReceiptCaptures)
      .values({ receiptKey: SHA_A, expiresAt: new Date(now.getTime() - 1).toISOString() })
      .run();

    try {
      expect(sweepUnreferencedReceipts(opened.db, { root, now: () => now })).toEqual({
        scanned: 1,
        deleted: 1,
        kept: 0,
        malformed: 0,
      });
      expect(opened.db.select().from(pendingReceiptCaptures).all()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('keeps an unreferenced file younger than the window', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    writeReceiptFile(SHA_A, 60_000);
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 1, deleted: 0, kept: 1, malformed: 0 });
    } finally {
      cleanup();
    }
  });

  it('never deletes a referenced file, however old', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    writeReceiptFile(SHA_A, DEFAULT_RECEIPT_RETENTION_MS + 60_000);
    const { opened, cleanup } = openDb();

    try {
      seedAmazonSource(opened);
      createPurchase(
        opened.db,
        amazonOrder({ documents: [{ documentUri: receiptUri(SHA_A), kind: 'receipt' }] })
      );

      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 1, deleted: 0, kept: 1, malformed: 0 });
    } finally {
      cleanup();
    }
  });

  it('keeps an old file only an external owner references, until that reference is removed', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const path = writeReceiptFile(SHA_A, DEFAULT_RECEIPT_RETENTION_MS + 60_000);
    const { opened, cleanup } = openDb();
    const owner = 'pops://finance/transaction/txn-1';

    try {
      addExternalReceiptReferences(opened.db, owner, [receiptUri(SHA_A)]);
      expect(sweepUnreferencedReceipts(opened.db, { root })).toEqual({
        scanned: 1,
        deleted: 0,
        kept: 1,
        malformed: 0,
      });
      expect(() => statSync(path)).not.toThrow();

      removeExternalReceiptReferences(opened.db, owner, [receiptUri(SHA_A)]);
      expect(sweepUnreferencedReceipts(opened.db, { root })).toEqual({
        scanned: 1,
        deleted: 1,
        kept: 0,
        malformed: 0,
      });
      expect(() => statSync(path)).toThrow();
    } finally {
      cleanup();
    }
  });

  it('keeps an old file while one of two external owners still references it', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    writeReceiptFile(SHA_A, DEFAULT_RECEIPT_RETENTION_MS + 60_000);
    const { opened, cleanup } = openDb();

    try {
      addExternalReceiptReferences(opened.db, 'pops://finance/transaction/txn-1', [
        receiptUri(SHA_A),
      ]);
      addExternalReceiptReferences(opened.db, 'pops://finance/transaction/txn-2', [
        receiptUri(SHA_A),
      ]);
      removeExternalReceiptReferences(opened.db, 'pops://finance/transaction/txn-1');

      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 1, deleted: 0, kept: 1, malformed: 0 });
    } finally {
      cleanup();
    }
  });

  it('skips a malformed filename in a shard dir without throwing', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const dir = join(root, 'zz');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'not-a-sha.jpg'), Buffer.from('fake'));
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 0, deleted: 0, kept: 0, malformed: 1 });
    } finally {
      cleanup();
    }
  });

  it('counts an extensionless file as malformed', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const dir = join(root, 'aa');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, SHA_A), Buffer.from('fake'));
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 0, deleted: 0, kept: 0, malformed: 1 });
    } finally {
      cleanup();
    }
  });

  it('ignores non-directory entries at the store root', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const unrelatedFile = join(root, 'metadata.json');
    writeFileSync(unrelatedFile, Buffer.from('{}'));
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 0, deleted: 0, kept: 0, malformed: 0 });
      expect(() => statSync(unrelatedFile)).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('deletes an unreferenced file exactly at the retention boundary', () => {
    root = mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-'));
    const now = new Date('2026-09-22T00:00:00.000Z');
    const path = shardPath(SHA_A);
    writeFileSync(path, Buffer.from('fake'));
    const cutoff = new Date(now.getTime() - DEFAULT_RECEIPT_RETENTION_MS);
    utimesSync(path, cutoff, cutoff);
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root, now: () => now });
      expect(result).toEqual({ scanned: 1, deleted: 1, kept: 0, malformed: 0 });
    } finally {
      cleanup();
    }
  });

  it('is a no-op for a store root that does not exist yet', () => {
    root = join(mkdtempSync(join(tmpdir(), 'pops-receipts-sweep-')), 'never-created');
    const { opened, cleanup } = openDb();

    try {
      const result = sweepUnreferencedReceipts(opened.db, { root });
      expect(result).toEqual({ scanned: 0, deleted: 0, kept: 0, malformed: 0 });
    } finally {
      cleanup();
    }
  });
});
