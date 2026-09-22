import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../../db/__tests__/helpers.js';
import { createPurchase } from '../../../db/index.js';
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
