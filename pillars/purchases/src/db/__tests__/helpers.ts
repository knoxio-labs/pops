import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openPurchasesDb, upsertSource, type OpenedPurchasesDb } from '../index.js';

import type { CreatePurchaseInput } from '../index.js';

/** A private on-disk database and the call that closes and removes it. */
export interface TempDb {
  opened: OpenedPurchasesDb;
  cleanup: () => void;
}

/** A database's contents, reopenable as many independent copies as wanted. */
export interface TempDbTemplate {
  /**
   * Open a private copy. Writes through it are invisible to every other
   * copy and to the database the template was taken from.
   */
  open: () => TempDb;
}

/**
 * Directories holding a template, removed when the process exits.
 *
 * A template outlives the test that built it by design, so no `afterEach`
 * can remove it and the files would otherwise survive the run.
 */
const templateDirs: string[] = [];
let templateCleanupRegistered = false;

function templateDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  templateDirs.push(dir);
  if (!templateCleanupRegistered) {
    templateCleanupRegistered = true;
    process.once('exit', () => {
      for (const created of templateDirs) rmSync(created, { recursive: true, force: true });
    });
  }
  return dir;
}

/**
 * Copy an open database's bytes to `destination`.
 *
 * The checkpoint is what makes the copy whole: in WAL mode the committed
 * pages a reader would see live partly in `-wal`, so copying the main file
 * of an un-checkpointed database yields one that is missing its most recent
 * writes rather than one that is corrupt — a far worse failure, because it
 * still opens.
 */
function copyDbTo(opened: OpenedPurchasesDb, destination: string): void {
  opened.raw.pragma('wal_checkpoint(TRUNCATE)');
  copyFileSync(opened.raw.name, destination);
}

function openCopyOf(templatePath: string): TempDb {
  const dir = mkdtempSync(join(tmpdir(), 'purchases-test-'));
  const path = join(dir, 'purchases.db');
  copyFileSync(templatePath, path);
  const opened = openPurchasesDb(path);
  return {
    opened,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

let migratedTemplate: string | undefined;

/**
 * A migrated, empty database, built once per process.
 *
 * Replaying the migration journal costs ~23 ms and the pillar's suite opens
 * a database per test, so the journal was being replayed north of a thousand
 * times a run — the single largest source of CPU contention in it, and the
 * contention that made unrelated supertest tests miss vitest's 5 s default
 * under load. Copying the finished file instead costs ~2.5 ms.
 */
function migratedTemplatePath(): string {
  if (migratedTemplate !== undefined) return migratedTemplate;
  const path = join(templateDir('purchases-template-'), 'purchases.db');
  const opened = openPurchasesDb(path);
  opened.raw.pragma('wal_checkpoint(TRUNCATE)');
  opened.raw.close();
  migratedTemplate = path;
  return path;
}

/**
 * Open a throwaway on-disk purchases DB with migrations applied.
 *
 * On disk rather than `:memory:` on purpose — the migration journal, the
 * WAL pragma and `foreign_keys=ON` are what these tests are checking, and
 * an in-memory handle exercises a different code path in the opener.
 *
 * The migrations are applied to the template rather than to this database,
 * which is a copy of it. Every caller still goes through the real opener,
 * so the pragmas it sets and the journal check it makes are still exercised
 * — what is skipped is only re-executing DDL whose result is already known.
 * A test that needs to watch migrations run against a database in some other
 * state calls `openPurchasesDb` directly, as the migration tests do.
 */
export function openTempDb(): TempDb {
  return openCopyOf(migratedTemplatePath());
}

/**
 * The bound to give a `beforeAll` that builds one of these arrangements.
 *
 * Vitest's 10s hook default is not the right number for work that is done
 * once for a whole block: it has been seen to fire on a developer box busy
 * with a dozen unrelated builds, where the arrangement was not slow and
 * nothing was wrong. The arrangements it covers cost well under a second
 * each with the box to themselves, so this is not headroom for a slow test
 * — it is far enough above them to mean only one thing when it fires, which
 * is that the build has hung. Every *test* still runs at vitest's 5s
 * default, which is where a wall-clock assertion belongs.
 */
export const ARRANGEMENT_TIMEOUT_MS = 30_000;

/**
 * Freeze what an opened database currently holds, so an expensive
 * arrangement can be built once and handed to many tests.
 *
 * The alternative — rebuilding the arrangement per test — is what put the
 * pillar's two heaviest blocks near vitest's default timeout. Each `open()`
 * is a fresh file, so tests that mutate stay isolated from each other.
 */
export function snapshotTempDb(opened: OpenedPurchasesDb): TempDbTemplate {
  const path = join(templateDir('purchases-snapshot-'), 'purchases.db');
  copyDbTo(opened, path);
  return { open: () => openCopyOf(path) };
}

export function seedAmazonSource(opened: OpenedPurchasesDb): void {
  upsertSource(opened.db, {
    id: 'amazon',
    label: 'Amazon',
    descriptorPattern: 'AMAZON%',
    settlementWindowDays: 21,
    autoLinkPolicy: 'review',
    ingestAdapter: 'amazon-export',
  });
}

/** A minimal valid order. Override any field per test. */
export function amazonOrder(overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId: '249-1512883-0105415',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    checksum: 'amazon:249-1512883-0105415',
    ...overrides,
  };
}

/**
 * The real two-line coffee order from the Amazon DSAR export, shipped in
 * one box and settled by one charge. Used wherever a test needs a
 * fully-formed order rather than a bare total.
 */
export function coffeeOrder(overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput {
  return amazonOrder({
    totalCents: 5678,
    shipments: [{ ref: 'box1', carrier: 'AMZL', status: 'delivered', shippingCents: 0 }],
    items: [
      {
        ref: 'tamper',
        shipmentRef: 'box1',
        name: 'Espresso Tamping Station',
        sku: 'B0DSVZQ8P5',
        unitPriceCents: 4499,
        lineTotalCents: 4499,
        kind: 'durable',
        tags: ['coffee', 'kitchen'],
      },
      {
        ref: 'funnel',
        shipmentRef: 'box1',
        name: 'Magnetic Dosing Funnel',
        sku: 'B0FCSJTKJ8',
        unitPriceCents: 1179,
        lineTotalCents: 1179,
        kind: 'durable',
        tags: ['coffee'],
      },
    ],
    charges: [
      {
        sourceChargeRef: 'chg-1',
        shipmentRef: 'box1',
        amountCents: 5678,
        chargedAt: '2026-02-02T12:23:50Z',
        paymentHint: 'Visa - 7373',
        allocations: [
          { itemRef: 'tamper', amountCents: 4499 },
          { itemRef: 'funnel', amountCents: 1179 },
        ],
      },
    ],
    ...overrides,
  });
}
