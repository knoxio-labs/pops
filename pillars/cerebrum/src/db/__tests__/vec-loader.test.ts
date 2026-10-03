/**
 * `embeddings_vec` sizing: the table width follows the configured embedding
 * dimensions, and a width change never discards stored vectors.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openCerebrumDb } from '../open-cerebrum-db.js';
import { DEFAULT_EMBEDDING_DIMENSIONS, resolveEmbeddingDimensions } from '../vec-loader.js';

import type BetterSqlite3 from 'better-sqlite3';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-vec-test-'));
  dbPath = join(tmpDir, 'cerebrum.db');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertVector(raw: BetterSqlite3.Database, rowId: number, width: number): void {
  const blob = Buffer.from(new Float32Array(width).fill(0.5).buffer);
  raw.prepare('INSERT INTO embeddings_vec (rowid, vector) VALUES (?, ?)').run(BigInt(rowId), blob);
}

function vectorCount(raw: BetterSqlite3.Database): number {
  return raw.prepare('SELECT count(*) FROM embeddings_vec').pluck().get() as number;
}

describe('resolveEmbeddingDimensions', () => {
  it('falls back to the default when unset or blank', () => {
    expect(resolveEmbeddingDimensions({})).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
    expect(resolveEmbeddingDimensions({ EMBEDDING_DIMENSIONS: '' })).toBe(1536);
    expect(resolveEmbeddingDimensions({ EMBEDDING_DIMENSIONS: '   ' })).toBe(1536);
  });

  it('reads a positive integer', () => {
    expect(resolveEmbeddingDimensions({ EMBEDDING_DIMENSIONS: '1024' })).toBe(1024);
    expect(resolveEmbeddingDimensions({ EMBEDDING_DIMENSIONS: ' 512 ' })).toBe(512);
  });

  it.each(['0', '-1024', '10.5', '1024abc', 'abc', '1e3'])('rejects %s', (value) => {
    expect(() => resolveEmbeddingDimensions({ EMBEDDING_DIMENSIONS: value })).toThrow(
      /EMBEDDING_DIMENSIONS must be a positive integer/
    );
  });
});

describe('embeddings_vec sizing', () => {
  it('creates the table at the requested width', () => {
    const { raw, vecAvailable } = openCerebrumDb(dbPath, { embeddingDimensions: 1024 });
    try {
      expect(vecAvailable).toBe(true);
      insertVector(raw, 1, 1024);
      expect(vectorCount(raw)).toBe(1);
      expect(() => insertVector(raw, 2, 1536)).toThrow();
    } finally {
      raw.close();
    }
  });

  it('sizes the table from EMBEDDING_DIMENSIONS when no option is passed', () => {
    vi.stubEnv('EMBEDDING_DIMENSIONS', '512');
    const { raw } = openCerebrumDb(dbPath);
    try {
      insertVector(raw, 1, 512);
      expect(() => insertVector(raw, 2, 1536)).toThrow();
    } finally {
      raw.close();
    }
  });

  it('defaults to 1536 when EMBEDDING_DIMENSIONS is unset', () => {
    vi.stubEnv('EMBEDDING_DIMENSIONS', undefined);
    const { raw } = openCerebrumDb(dbPath);
    try {
      insertVector(raw, 1, 1536);
      expect(() => insertVector(raw, 2, 1024)).toThrow();
    } finally {
      raw.close();
    }
  });

  it('resizes an empty table when the width changes', () => {
    openCerebrumDb(dbPath, { embeddingDimensions: 1536 }).raw.close();

    const { raw, vecAvailable } = openCerebrumDb(dbPath, { embeddingDimensions: 1024 });
    try {
      expect(vecAvailable).toBe(true);
      insertVector(raw, 1, 1024);
      expect(() => insertVector(raw, 2, 1536)).toThrow();
    } finally {
      raw.close();
    }
  });

  it('keeps stored vectors and disables vector features on a width change', () => {
    const first = openCerebrumDb(dbPath, { embeddingDimensions: 1536 });
    insertVector(first.raw, 1, 1536);
    first.raw.close();

    const warn = vi.fn();
    const { raw, vecAvailable } = openCerebrumDb(dbPath, {
      embeddingDimensions: 1024,
      logger: { warn },
    });
    try {
      expect(vecAvailable).toBe(false);
      expect(vectorCount(raw)).toBe(1);
      expect(() => insertVector(raw, 2, 1024)).toThrow();
      expect(warn).toHaveBeenCalledWith(
        { existing: 1536, requested: 1024 },
        expect.stringContaining('different width')
      );
    } finally {
      raw.close();
    }
  });

  it('keeps stored vectors when reopened at the same width', () => {
    const first = openCerebrumDb(dbPath, { embeddingDimensions: 1024 });
    insertVector(first.raw, 1, 1024);
    first.raw.close();

    const { raw, vecAvailable } = openCerebrumDb(dbPath, { embeddingDimensions: 1024 });
    try {
      expect(vecAvailable).toBe(true);
      expect(vectorCount(raw)).toBe(1);
    } finally {
      raw.close();
    }
  });
});
