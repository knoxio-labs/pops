/**
 * The test-database helpers themselves.
 *
 * They are test infrastructure, but they are infrastructure with a way of
 * being silently wrong: a database handed out with its migrations missing,
 * or a snapshot missing the writes it was taken to preserve, does not throw
 * — it produces a suite that agrees with itself about the wrong contents.
 * Both shortcuts these helpers take (migrate once and copy the file, freeze
 * an expensive arrangement and copy that) fail in exactly that shape, so
 * they are pinned here rather than assumed from the suites that use them.
 */
import { describe, expect, it } from 'vitest';

import { createPurchase, listPurchases } from '../index.js';
import { amazonOrder, openTempDb, seedAmazonSource, snapshotTempDb } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

function migrationCount(opened: OpenedPurchasesDb): number {
  const row = opened.raw.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get();
  if (typeof row !== 'object' || row === null || !('n' in row) || typeof row.n !== 'number') {
    throw new Error('no migration count');
  }
  return row.n;
}

function write(opened: OpenedPurchasesDb, checksum: string): void {
  createPurchase(opened.db, amazonOrder({ checksum, sourceOrderId: checksum }));
}

function checksums(opened: OpenedPurchasesDb): string[] {
  return listPurchases(opened.db, { limit: 100 }).map((row) => row.checksum);
}

describe('openTempDb', () => {
  it('hands out a migrated database, not an empty file with the right name', () => {
    const { opened, cleanup } = openTempDb();
    try {
      // The copy has to carry the journal too. A database whose tables
      // exist but whose `__drizzle_migrations` rows do not would let the
      // real opener re-run every migration against it — the exact cost this
      // is here to avoid, paid anyway and invisibly.
      expect(migrationCount(opened)).toBeGreaterThan(0);
      expect(opened.raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(opened.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('gives each caller a database of its own', () => {
    const first = openTempDb();
    const second = openTempDb();
    try {
      seedAmazonSource(first.opened);
      write(first.opened, 'only-in-first');

      expect(checksums(first.opened)).toEqual(['only-in-first']);
      expect(checksums(second.opened)).toEqual([]);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });
});

describe('snapshotTempDb', () => {
  it('preserves writes the source made after it was opened', () => {
    const source = openTempDb();
    seedAmazonSource(source.opened);
    write(source.opened, 'written-before-the-snapshot');

    // In WAL mode those rows are committed but still live in `-wal`, so a
    // snapshot that copied the main database file alone would open cleanly
    // and be missing them.
    const template = snapshotTempDb(source.opened);
    source.cleanup();

    const copy = template.open();
    try {
      expect(checksums(copy.opened)).toEqual(['written-before-the-snapshot']);
    } finally {
      copy.cleanup();
    }
  });

  it('isolates every copy from every other', () => {
    const source = openTempDb();
    seedAmazonSource(source.opened);
    write(source.opened, 'shared');
    const template = snapshotTempDb(source.opened);
    source.cleanup();

    const first = template.open();
    const second = template.open();
    try {
      write(first.opened, 'only-in-first');

      expect(checksums(first.opened).toSorted()).toEqual(['only-in-first', 'shared']);
      expect(checksums(second.opened)).toEqual(['shared']);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it('freezes the source at the moment it was taken', () => {
    const source = openTempDb();
    seedAmazonSource(source.opened);
    write(source.opened, 'in-the-snapshot');

    const template = snapshotTempDb(source.opened);
    write(source.opened, 'after-the-snapshot');

    const copy = template.open();
    try {
      expect(checksums(copy.opened)).toEqual(['in-the-snapshot']);
      expect(checksums(source.opened).toSorted()).toEqual([
        'after-the-snapshot',
        'in-the-snapshot',
      ]);
    } finally {
      copy.cleanup();
      source.cleanup();
    }
  });
});
