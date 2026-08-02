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
  it('upsert is a full replace — every omitted field returns to its default', () => {
    upsertSource(opened.db, {
      id: 'bunnings',
      label: 'Bunnings',
      descriptorPattern: 'BUNNINGS%',
      settlementWindowDays: 7,
      autoLinkPolicy: 'auto',
      ingestAdapter: 'manual',
    });
    upsertSource(opened.db, { id: 'bunnings', label: 'Bunnings Warehouse' });

    const source = getSource(opened.db, 'bunnings');
    expect(source?.label).toBe('Bunnings Warehouse');
    // Nullable fields clear...
    expect(source?.descriptorPattern).toBeNull();
    expect(source?.ingestAdapter).toBeNull();
    // ...and the tuning fields return to their declared defaults rather
    // than retaining 7/auto. One rule for every field: the result of a
    // seed is a function of its input, not of what was in the table.
    expect(source?.settlementWindowDays).toBe(21);
    expect(source?.autoLinkPolicy).toBe('review');
  });

  it('applies the same defaults on the insert path as on the update path', () => {
    upsertSource(opened.db, { id: 'fresh', label: 'Fresh' });
    const inserted = getSource(opened.db, 'fresh');

    upsertSource(opened.db, { id: 'fresh', label: 'Fresh', settlementWindowDays: 3 });
    upsertSource(opened.db, { id: 'fresh', label: 'Fresh' });
    const roundTripped = getSource(opened.db, 'fresh');

    expect(roundTripped?.settlementWindowDays).toBe(inserted?.settlementWindowDays);
    expect(roundTripped?.autoLinkPolicy).toBe(inserted?.autoLinkPolicy);
  });

  it('is idempotent — the same input twice yields the same row', () => {
    const first = upsertSource(opened.db, {
      id: 'woolworths',
      label: 'Woolworths',
      autoLinkPolicy: 'auto',
    });
    const second = upsertSource(opened.db, {
      id: 'woolworths',
      label: 'Woolworths',
      autoLinkPolicy: 'auto',
    });
    expect({ ...second, createdAt: first.createdAt }).toEqual(first);
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

describe('timestamp format', () => {
  /**
   * Every timestamp column must hold ISO-8601, whichever path wrote it.
   *
   * SQLite's `datetime('now')` emits `2026-08-02 16:28:14` while the
   * service layer emits `2026-08-02T16:28:14.929Z`. A space sorts before
   * `T`, so mixing the two makes a row written by one path always sort
   * before a row written by the other — regardless of which actually
   * happened first. Every `orderBy(asc(createdAt))` in the read path, and
   * any dated sweep window, would be quietly wrong.
   */
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  const TIMESTAMP_COLUMNS: readonly (readonly [string, string])[] = [
    ['purchases', 'created_at'],
    ['purchases', 'updated_at'],
    ['purchase_shipments', 'created_at'],
    ['purchase_shipments', 'updated_at'],
    ['purchase_items', 'created_at'],
    ['purchase_item_units', 'created_at'],
    ['purchase_item_tags', 'created_at'],
    ['purchase_charges', 'created_at'],
    ['purchase_charges', 'updated_at'],
    ['purchase_item_allocations', 'created_at'],
    ['purchase_documents', 'created_at'],
    ['purchase_sources', 'created_at'],
  ];

  it('is ISO-8601 on every column the service layer writes', () => {
    createPurchase(
      opened.db,
      amazonOrder({
        shipments: [{ ref: 'box1' }],
        items: [
          {
            ref: 'a',
            shipmentRef: 'box1',
            name: 'A',
            unitPriceCents: 100,
            lineTotalCents: 100,
            tags: ['x'],
            units: [{ serialNumber: 'SN-1' }],
          },
        ],
        charges: [
          {
            sourceChargeRef: 'c',
            amountCents: 100,
            allocations: [{ itemRef: 'a', amountCents: 100 }],
          },
        ],
        documents: [{ documentUri: 'pops://documents/document/x' }],
      })
    );

    for (const [table, column] of TIMESTAMP_COLUMNS) {
      const rows = opened.raw
        .prepare(`SELECT ${column} AS ts FROM ${table} WHERE ${column} IS NOT NULL`)
        .all() as { ts: string }[];
      expect(rows.length, `${table}.${column} had no rows to check`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.ts, `${table}.${column}`).toMatch(ISO);
      }
    }
  });

  it('is ISO-8601 on every column the schema DEFAULT writes', () => {
    // A raw insert that supplies no timestamps at all, so the column
    // defaults fire rather than the service layer.
    opened.raw
      .prepare(
        `INSERT INTO purchases (id, source, ingest_method, ordered_at, currency, total_cents, checksum)
         VALUES ('default-path', 'amazon', 'export', '2026-02-02T01:41:21Z', 'AUD', 100, 'default-path')`
      )
      .run();
    const row = opened.raw
      .prepare('SELECT created_at AS c, updated_at AS u FROM purchases WHERE id = ?')
      .get('default-path') as { c: string; u: string };

    expect(row.c).toMatch(ISO);
    expect(row.u).toMatch(ISO);
  });

  it('sorts a service-written row before a later default-written row', () => {
    // Insert order matters here. The service path writes first and the
    // DEFAULT path second, so a correct schema orders them service-first.
    // Under the old mixed format the default row carried a leading space
    // where the service row carried `T`, and ' ' < 'T' put the *later* row
    // first unconditionally. Doing it the other way round would pass either
    // way and prove nothing.
    const firstId = createPurchase(
      opened.db,
      amazonOrder({ checksum: 'written-first', sourceOrderId: 'a' })
    );
    opened.raw
      .prepare(
        `INSERT INTO purchases (id, source, ingest_method, ordered_at, currency, total_cents, checksum)
         VALUES ('written-second', 'amazon', 'export', '2026-02-02T01:41:21Z', 'AUD', 100, 'b')`
      )
      .run();

    const order = (
      opened.raw.prepare('SELECT id FROM purchases ORDER BY created_at ASC').all() as {
        id: string;
      }[]
    ).map((r) => r.id);
    expect(order).toEqual([firstId, 'written-second']);
  });
});
