/**
 * Unit tests for the inventory cross-pillar URI reconciliation cron.
 *
 * Covers happy-path, 404, owning-pillar-unavailable, and bad-URI outcomes,
 * the alarm that fires when rows name a finance transaction the writer failed
 * to derive a URI for, and the timer-based scheduling path that arms the next
 * tick after the current one settles.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PillarCallError, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  crossPillarUrisService,
  homeInventory,
  openInventoryDb,
  type OpenedInventoryDb,
} from '../../../db/index.js';
import {
  parseSoftUri,
  runReconciliation,
  startCrossPillarReconciliationWorker,
} from '../reconcile-cross-pillar.js';

import type { FinanceRouter } from '../reconcile-cross-pillar.js';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

const FROZEN_NOW = new Date('2026-06-15T03:30:00.000Z');

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-cron-reconcile-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface SeededRow {
  id: string;
  purchaseTransactionId?: string | null;
  purchaseTransactionUri?: string | null;
}

function seedRow(row: SeededRow): void {
  inventoryDb.db
    .insert(homeInventory)
    .values({
      id: row.id,
      itemName: `item-${row.id}`,
      lastEditedTime: FROZEN_NOW.toISOString(),
      purchaseTransactionId: row.purchaseTransactionId ?? null,
      purchaseTransactionUri: row.purchaseTransactionUri ?? null,
    })
    .run();
}

function readRow(id: string): {
  purchaseTransactionStaleAt: string | null;
} {
  const rows = inventoryDb.db
    .select({
      id: homeInventory.id,
      purchaseTransactionStaleAt: homeInventory.purchaseTransactionStaleAt,
    })
    .from(homeInventory)
    .where(eq(homeInventory.id, id))
    .all();
  const row = rows[0];
  if (!row) throw new Error(`row ${id} not found`);
  return { purchaseTransactionStaleAt: row.purchaseTransactionStaleAt };
}

interface FakeFinanceCall {
  result?: CallResult<unknown>;
  error?: unknown;
}

function makeFinanceProxy(byId: Record<string, FakeFinanceCall>): PillarHandle<FinanceRouter> {
  const fake = {
    callDynamic: vi.fn(
      async (
        _routerName: string,
        _procName: string,
        input?: unknown
      ): Promise<CallResult<unknown>> => {
        const id = (input as { id: string } | undefined)?.id ?? '';
        const slot = byId[id];
        if (!slot) {
          return { kind: 'not-found', pillar: 'finance' };
        }
        if (slot.error) throw slot.error;
        if (slot.result) return slot.result;
        return { kind: 'ok', value: { data: { id } } };
      }
    ),
  };
  return fake as unknown as PillarHandle<FinanceRouter>;
}

describe('parseSoftUri', () => {
  it('parses a well-formed soft URI', () => {
    expect(parseSoftUri('pops://finance/transaction/abc-123')).toEqual({
      pillar: 'finance',
      type: 'transaction',
      id: 'abc-123',
    });
  });

  it('returns null for malformed URIs', () => {
    expect(parseSoftUri('http://finance/transaction/x')).toBeNull();
    expect(parseSoftUri('pops://finance/transaction/')).toBeNull();
    expect(parseSoftUri('pops://finance')).toBeNull();
    expect(parseSoftUri('not a uri at all')).toBeNull();
  });

  it('preserves slashes in the id segment (urn-style)', () => {
    expect(parseSoftUri('pops://finance/transaction/a/b')).toEqual({
      pillar: 'finance',
      type: 'transaction',
      id: 'a/b',
    });
  });
});

describe('runReconciliation — happy-path', () => {
  it('clears the stale marker when finance resolves', async () => {
    seedRow({
      id: 'row-1',
      purchaseTransactionId: 'tx-1',
      purchaseTransactionUri: 'pops://finance/transaction/tx-1',
    });
    crossPillarUrisService.markPurchaseTransactionUriStale(
      inventoryDb.db,
      'pops://finance/transaction/tx-1',
      '2026-06-14T00:00:00.000Z'
    );

    const finance = makeFinanceProxy({ 'tx-1': {} });
    const info = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
      logger: { info },
    });

    expect(counters).toEqual({ ok: 1, notFound: 0, unavailable: 0, badUri: 0 });
    expect(readRow('row-1').purchaseTransactionStaleAt).toBeNull();
    expect(info).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation complete',
      expect.objectContaining({ ok: 1, purchaseTransactionUris: 1 })
    );
  });

  it("reports the leg's work-set size so a total of zero is not ambiguous", async () => {
    seedRow({
      id: 'row-1c',
      purchaseTransactionId: 'tx-1c',
      purchaseTransactionUri: 'pops://finance/transaction/tx-1c',
    });
    const info = vi.fn();

    await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance: makeFinanceProxy({ 'tx-1c': {} }) },
      logger: { info },
    });

    expect(info).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation complete',
      expect.objectContaining({ purchaseTransactionUris: 1 })
    );
  });
});

describe('runReconciliation — the leg has no work', () => {
  it('says nothing and calls nobody when there are no rows at all', async () => {
    const finance = makeFinanceProxy({});
    const info = vi.fn();
    const warn = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
      logger: { info, warn },
    });

    expect(counters).toEqual({ ok: 0, notFound: 0, unavailable: 0, badUri: 0 });
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(finance.callDynamic).not.toHaveBeenCalled();
  });

  it('needs no proxy at all when there is nothing to resolve', async () => {
    await expect(runReconciliation({ db: inventoryDb.db })).resolves.toEqual({
      ok: 0,
      notFound: 0,
      unavailable: 0,
      badUri: 0,
    });
  });

  it('warns instead of staying silent when rows name a transaction with no uri', async () => {
    seedRow({ id: 'row-drift', purchaseTransactionId: 'tx-drift', purchaseTransactionUri: null });
    const finance = makeFinanceProxy({});
    const info = vi.fn();
    const warn = vi.fn();

    await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
      logger: { info, warn },
    });

    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: rows name a finance transaction with no uri to reconcile',
      { rows: 1 }
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('warns even while the leg has work, so a partial writer failure is visible', async () => {
    seedRow({
      id: 'row-ok',
      purchaseTransactionId: 'tx-ok',
      purchaseTransactionUri: 'pops://finance/transaction/tx-ok',
    });
    seedRow({
      id: 'row-drift-2',
      purchaseTransactionId: 'tx-drift-2',
      purchaseTransactionUri: null,
    });
    const warn = vi.fn();

    await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance: makeFinanceProxy({ 'tx-ok': {} }) },
      logger: { warn },
    });

    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: rows name a finance transaction with no uri to reconcile',
      { rows: 1 }
    );
  });

  it('does not warn about rows that name no transaction at all', async () => {
    seedRow({ id: 'row-none' });
    const warn = vi.fn();

    await runReconciliation({ db: inventoryDb.db, logger: { warn } });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('runReconciliation — 404', () => {
  it('stamps staleAt + preserves the row on not-found', async () => {
    seedRow({
      id: 'row-2',
      purchaseTransactionId: 'missing',
      purchaseTransactionUri: 'pops://finance/transaction/missing',
    });
    const finance = makeFinanceProxy({});

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
    });

    expect(counters).toEqual({ ok: 0, notFound: 1, unavailable: 0, badUri: 0 });
    expect(readRow('row-2').purchaseTransactionStaleAt).toBe(FROZEN_NOW.toISOString());
    expect(inventoryDb.db.select().from(homeInventory).all()).toHaveLength(1);
  });

  it('treats a PillarCallError(not-found) the same as a CallResult not-found', async () => {
    seedRow({
      id: 'row-2b',
      purchaseTransactionId: 'raise-404',
      purchaseTransactionUri: 'pops://finance/transaction/raise-404',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(async () => {
        throw new PillarCallError('finance', { kind: 'not-found', pillar: 'finance' });
      }),
    } as unknown as PillarHandle<FinanceRouter>;

    const counters = await runReconciliation({ db: inventoryDb.db, proxies: { finance } });

    expect(counters.notFound).toBe(1);
    expect(readRow('row-2b').purchaseTransactionStaleAt).toBe(FROZEN_NOW.toISOString());
  });
});

describe('runReconciliation — owning-pillar-unavailable', () => {
  it('logs + leaves the row untouched on unavailable', async () => {
    seedRow({
      id: 'row-3',
      purchaseTransactionId: 'tx-3',
      purchaseTransactionUri: 'pops://finance/transaction/tx-3',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(async (): Promise<CallResult<unknown>> => ({
        kind: 'unavailable',
        pillar: 'finance',
      })),
    } as unknown as PillarHandle<FinanceRouter>;
    const warn = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
      logger: { warn },
    });

    expect(counters).toEqual({ ok: 0, notFound: 0, unavailable: 1, badUri: 0 });
    expect(readRow('row-3').purchaseTransactionStaleAt).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: owning pillar unavailable',
      expect.objectContaining({ uri: 'pops://finance/transaction/tx-3' })
    );
  });

  it('treats a thrown non-Pillar error as unavailable (retry next tick)', async () => {
    seedRow({
      id: 'row-3b',
      purchaseTransactionId: 'transient',
      purchaseTransactionUri: 'pops://finance/transaction/transient',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    } as unknown as PillarHandle<FinanceRouter>;

    const counters = await runReconciliation({ db: inventoryDb.db, proxies: { finance } });

    expect(counters.unavailable).toBe(1);
    expect(readRow('row-3b').purchaseTransactionStaleAt).toBeNull();
  });
});

describe('runReconciliation — bad-URI', () => {
  it('records unparseable URIs for ops without touching the row', async () => {
    seedRow({
      id: 'row-4',
      purchaseTransactionId: 'weird',
      purchaseTransactionUri: 'not-a-valid-uri',
    });
    const finance = makeFinanceProxy({});
    const warn = vi.fn();

    const counters = await runReconciliation({
      db: inventoryDb.db,
      proxies: { finance },
      logger: { warn },
    });

    expect(counters).toEqual({ ok: 0, notFound: 0, unavailable: 0, badUri: 1 });
    expect(readRow('row-4').purchaseTransactionStaleAt).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      'inventory cross-pillar reconciliation: bad uri (unparseable / wrong shape)',
      expect.objectContaining({ uri: 'not-a-valid-uri' })
    );
  });

  it('treats a CallResult bad-request from the owning pillar as bad URI', async () => {
    seedRow({
      id: 'row-4b',
      purchaseTransactionId: 'refused',
      purchaseTransactionUri: 'pops://finance/transaction/refused',
    });
    const finance: PillarHandle<FinanceRouter> = {
      callDynamic: vi.fn(async (): Promise<CallResult<unknown>> => ({
        kind: 'bad-request',
        pillar: 'finance',
        message: 'no such id format',
      })),
    } as unknown as PillarHandle<FinanceRouter>;

    const counters = await runReconciliation({ db: inventoryDb.db, proxies: { finance } });

    expect(counters.badUri).toBe(1);
  });
});

describe('startCrossPillarReconciliationWorker', () => {
  it('runs reconciliation immediately, then reschedules at intervalMs', async () => {
    seedRow({
      id: 'row-5',
      purchaseTransactionId: 'tx-5',
      purchaseTransactionUri: 'pops://finance/transaction/tx-5',
    });
    const finance = makeFinanceProxy({ 'tx-5': {} });

    const handle = startCrossPillarReconciliationWorker({
      db: inventoryDb.db,
      intervalMs: 60_000,
      proxies: { finance },
    });

    const financeCalls = vi.mocked(finance.callDynamic);

    await vi.advanceTimersByTimeAsync(0);
    const afterImmediate = financeCalls.mock.calls.length;
    expect(afterImmediate).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(financeCalls.mock.calls.length).toBeGreaterThan(afterImmediate);

    const beforeStop = financeCalls.mock.calls.length;
    handle.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(finance.callDynamic).toHaveBeenCalledTimes(beforeStop);
  });
});
