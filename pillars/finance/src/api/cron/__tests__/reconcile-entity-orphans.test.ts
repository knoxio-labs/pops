/**
 * Entity-orphan detection worker tests (issue #3615).
 *
 * Verifies the worker SURFACES orphans without ever mutating, and — critically —
 * that an empty live set (contacts unavailable) is treated as "skip", never as
 * "everything is orphaned". Runs against a real on-disk finance.db so the
 * detection queries execute for real; `fetchLiveEntities` is injected so no HTTP
 * transport is needed.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactions,
  type LiveEntityRef,
  type OpenedFinanceDb,
} from '../../../db/index.js';
import {
  startReconcileEntityOrphansWorker,
  type EntityOrphanWorkerHandle,
} from '../reconcile-entity-orphans.js';

let tmpDir: string;
let opened: OpenedFinanceDb;
let handle: EntityOrphanWorkerHandle | undefined;

interface LogEntry {
  msg: string;
  meta?: Record<string, unknown>;
}

function makeLogger(): {
  info: LogEntry[];
  warn: LogEntry[];
  logger: {
    info: (m: string, meta?: Record<string, unknown>) => void;
    warn: (m: string, meta?: Record<string, unknown>) => void;
  };
} {
  const info: LogEntry[] = [];
  const warn: LogEntry[] = [];
  return {
    info,
    warn,
    logger: {
      info: (msg, meta) => info.push({ msg, meta }),
      warn: (msg, meta) => warn.push({ msg, meta }),
    },
  };
}

function seedTxn(entityId: string, entityName: string): void {
  opened.db
    .insert(transactions)
    .values({
      description: `txn-${entityId}`,
      account: 'Amex',
      amountCents: -1000,
      date: '2026-01-01',
      type: 'Expense',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      entityId,
      entityName,
    })
    .run();
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-orphan-worker-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  handle?.stop();
  handle = undefined;
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('startReconcileEntityOrphansWorker', () => {
  it('detects orphans, reports stats, warns — and never mutates', async () => {
    seedTxn('dead-wool', 'Woolworths');
    const live: LiveEntityRef[] = [{ id: 'live-wool', name: 'Woolworths' }];
    const { warn, logger } = makeLogger();

    handle = startReconcileEntityOrphansWorker({
      db: opened.db,
      fetchLiveEntities: () => Promise.resolve(live),
      logger,
      intervalMs: 60_000,
    });
    handle.stop();

    const stats = await handle.runOnce();
    expect(stats).toMatchObject({ skipped: false, orphanRows: 1, orphanIds: 1, repairable: 1 });
    expect(warn.some((e) => e.msg.includes('orphans detected'))).toBe(true);

    // detect-only: the dead id must still be on the row
    expect(
      opened.db.select().from(transactions).where(eq(transactions.entityId, 'dead-wool')).all()
    ).toHaveLength(1);
  });

  it('skips (no false mass-orphan) when contacts returns an empty set', async () => {
    seedTxn('dead-wool', 'Woolworths');
    const { warn, logger } = makeLogger();

    handle = startReconcileEntityOrphansWorker({
      db: opened.db,
      fetchLiveEntities: () => Promise.resolve([]),
      logger,
      intervalMs: 60_000,
    });
    handle.stop();

    const stats = await handle.runOnce();
    expect(stats.skipped).toBe(true);
    expect(stats.orphanIds).toBe(0);
    expect(warn.some((e) => e.msg.includes('empty set'))).toBe(true);
    // untouched
    expect(
      opened.db.select().from(transactions).where(eq(transactions.entityId, 'dead-wool')).all()
    ).toHaveLength(1);
  });

  it('skips when the fetch throws', async () => {
    seedTxn('dead-wool', 'Woolworths');
    const { warn, logger } = makeLogger();

    handle = startReconcileEntityOrphansWorker({
      db: opened.db,
      fetchLiveEntities: () => Promise.reject(new Error('contacts down')),
      logger,
      intervalMs: 60_000,
    });
    handle.stop();

    const stats = await handle.runOnce();
    expect(stats.skipped).toBe(true);
    expect(warn.some((e) => e.msg.includes('fetch threw'))).toBe(true);
  });

  it('reports a clean sweep when every reference resolves', async () => {
    seedTxn('live-wool', 'Woolworths');
    const { info, logger } = makeLogger();

    handle = startReconcileEntityOrphansWorker({
      db: opened.db,
      fetchLiveEntities: () => Promise.resolve([{ id: 'live-wool', name: 'Woolworths' }]),
      logger,
      intervalMs: 60_000,
    });
    handle.stop();

    const stats = await handle.runOnce();
    expect(stats).toMatchObject({ skipped: false, orphanIds: 0 });
    expect(info.some((e) => e.msg.includes('clean'))).toBe(true);
  });
});
