/**
 * The DB opener, the source table, and the failure paths that only run when
 * something has already gone wrong — which is exactly when a leaked file
 * handle or a swallowed error costs the most.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPurchase,
  deleteSource,
  DuplicatePurchaseError,
  getSource,
  listSources,
  PurchaseNotFoundError,
  PurchaseSourceNotFoundError,
  setPurchaseStatus,
  upsertSource,
} from '../index.js';
import { openPurchasesDb } from '../open-purchases-db.js';
import { expectRow } from '../services/internal.js';
import { amazonOrder, openTempDb, seedAmazonSource } from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

describe('openPurchasesDb', () => {
  it('creates the parent directory rather than failing on a fresh volume', () => {
    const dir = mkdtempSync(join(tmpdir(), 'purchases-nested-'));
    const nested = join(dir, 'a', 'b', 'purchases.db');
    try {
      const db = openPurchasesDb(nested);
      db.raw.close();
      expect(listSources(openPurchasesDb(nested).db)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('closes the handle when migration fails, rather than leaking a lock', () => {
    // A database that already holds a conflicting `purchases` table: the
    // migrator's CREATE TABLE throws, and the opener must close the handle
    // before rethrowing rather than leaking a locked descriptor.
    const dir = mkdtempSync(join(tmpdir(), 'purchases-conflict-'));
    const path = join(dir, 'purchases.db');
    const seeded = new Database(path);
    seeded.exec('CREATE TABLE purchases (nothing_like_the_real_thing text)');
    seeded.close();

    try {
      expect(() => openPurchasesDb(path)).toThrow(/purchases/i);
      // The proof the handle was closed: another process can take an
      // exclusive lock. A leaked descriptor would make this throw SQLITE_BUSY.
      const after = new Database(path);
      expect(() => after.exec('BEGIN EXCLUSIVE; ROLLBACK;')).not.toThrow();
      after.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a path that is a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'purchases-isdir-'));
    try {
      expect(() => openPurchasesDb(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('expectRow', () => {
  it('names the caller when a mutation returned nothing', () => {
    expect(() => expectRow([], 'someWrite')).toThrow(/someWrite: expected a row but got none/);
  });

  it('returns the first row otherwise', () => {
    expect(expectRow([{ id: 'a' }, { id: 'b' }], 'someWrite')).toEqual({ id: 'a' });
  });
});

describe('domain errors', () => {
  it('carry the identifier that failed', () => {
    expect(new PurchaseNotFoundError('p1').purchaseId).toBe('p1');
    expect(new PurchaseSourceNotFoundError('s1').sourceId).toBe('s1');
    expect(new DuplicatePurchaseError('c1').checksum).toBe('c1');
  });

  it('are distinguishable by name after a structured-clone round trip', () => {
    // Error subclasses lose their prototype across some boundaries; the
    // `name` is what the REST mapper can always rely on.
    expect(new PurchaseNotFoundError('p1').name).toBe('PurchaseNotFoundError');
    expect(new PurchaseSourceNotFoundError('s1').name).toBe('PurchaseSourceNotFoundError');
    expect(new DuplicatePurchaseError('c1').name).toBe('DuplicatePurchaseError');
  });
});

describe('sources', () => {
  it('upsert replaces every field, not just the ones supplied', () => {
    upsertSource(opened.db, {
      id: 'bunnings',
      label: 'Bunnings',
      descriptorPattern: 'BUNNINGS%',
      ingestAdapter: 'manual',
    });
    upsertSource(opened.db, { id: 'bunnings', label: 'Bunnings Warehouse' });

    const source = getSource(opened.db, 'bunnings');
    expect(source?.label).toBe('Bunnings Warehouse');
    // Omitted nullable fields are cleared, not silently retained — an
    // upsert that half-applies is worse than one that fully replaces.
    expect(source?.descriptorPattern).toBeNull();
    expect(source?.ingestAdapter).toBeNull();
  });

  it('keeps the default settlement window when the caller omits it', () => {
    upsertSource(opened.db, { id: 'bunnings', label: 'Bunnings' });
    expect(getSource(opened.db, 'bunnings')?.settlementWindowDays).toBe(21);
    expect(getSource(opened.db, 'bunnings')?.autoLinkPolicy).toBe('review');
  });

  it('lists sources in a stable order', () => {
    upsertSource(opened.db, { id: 'woolworths', label: 'Woolworths' });
    upsertSource(opened.db, { id: 'bunnings', label: 'Bunnings' });
    expect(listSources(opened.db).map((s) => s.id)).toEqual(['amazon', 'bunnings', 'woolworths']);
  });

  it('reports a miss rather than throwing', () => {
    expect(getSource(opened.db, 'nope')).toBeUndefined();
    expect(deleteSource(opened.db, 'nope')).toBe(false);
  });

  it('refuses to delete a source an order still references', () => {
    createPurchase(opened.db, amazonOrder());
    expect(() => deleteSource(opened.db, 'amazon')).toThrow(/FOREIGN KEY/i);
  });

  it('deletes a source nothing references', () => {
    upsertSource(opened.db, { id: 'bunnings', label: 'Bunnings' });
    expect(deleteSource(opened.db, 'bunnings')).toBe(true);
    expect(getSource(opened.db, 'bunnings')).toBeUndefined();
  });
});

describe('setPurchaseStatus', () => {
  it('reports false for an id that was never there', () => {
    expect(setPurchaseStatus(opened.db, 'nope', 'linked')).toBe(false);
  });

  it('bumps updatedAt so a sweep can find recently-touched orders', () => {
    const id = createPurchase(opened.db, amazonOrder());
    opened.raw
      .prepare("UPDATE purchases SET updated_at = '2000-01-01T00:00:00Z' WHERE id = ?")
      .run(id);

    expect(setPurchaseStatus(opened.db, id, 'linked')).toBe(true);
    const row = opened.raw
      .prepare('SELECT status, updated_at AS updatedAt FROM purchases WHERE id = ?')
      .get(id) as { status: string; updatedAt: string };
    expect(row.status).toBe('linked');
    expect(row.updatedAt).not.toBe('2000-01-01T00:00:00Z');
  });
});
