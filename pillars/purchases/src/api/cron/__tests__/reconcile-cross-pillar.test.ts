/**
 * Soft-URI reconciliation worker tests, against a real on-disk
 * purchases.db so the mark/clear SQL runs end to end.
 *
 * The lookups are stubs — the point of the injectable seam. What is under
 * test is the decision table: which outcomes are allowed to write, which
 * must leave the row exactly as it was, and which URIs are never probed
 * at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../../db/__tests__/helpers.js';
import {
  createPurchase,
  listDistinctDocumentUris,
  markDocumentUriStale,
  markInventoryItemUriStale,
  purchaseDocuments,
  purchaseItemUnits,
} from '../../../db/index.js';
import {
  parseSoftUri,
  startReconcileCrossPillarWorker,
  type ReconcileLookupFn,
  type ReconcileLookupResult,
  type ReconcileWorkerHandle,
} from '../reconcile-cross-pillar.js';

import type { OpenedPurchasesDb } from '../../../db/index.js';

const ITEM_URI = 'pops://inventory/item/abc';
const DOC_URI = 'pops://documents/document/42';
const NOW = new Date('2026-08-08T09:00:00.000Z');

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let handles: ReconcileWorkerHandle[];

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  handles = [];
  seedAmazonSource(opened);
});

afterEach(() => {
  for (const handle of handles) handle.stop();
  cleanup();
  vi.useRealTimers();
});

/** Seed one order carrying an optional unit reference and an optional document reference. */
function seed(options: { itemUri?: string; documentUri?: string } = {}): void {
  createPurchase(
    opened.db,
    amazonOrder({
      totalCents: 5000,
      items: [
        {
          name: 'Nanoleaf bulb',
          quantity: 1,
          unitPriceCents: 5000,
          lineTotalCents: 5000,
          kind: 'durable',
          units: [
            {
              serialNumber: 'SN-1',
              ...(options.itemUri === undefined ? {} : { inventoryItemUri: options.itemUri }),
            },
          ],
        },
      ],
      ...(options.documentUri === undefined
        ? {}
        : { documents: [{ documentUri: options.documentUri, kind: 'tax_invoice' as const }] }),
    })
  );
}

function unitStaleAt(): (string | null)[] {
  return opened.db
    .select({ staleAt: purchaseItemUnits.inventoryItemStaleAt })
    .from(purchaseItemUnits)
    .all()
    .map((row) => row.staleAt);
}

function documentStaleAt(): (string | null)[] {
  return opened.db
    .select({ staleAt: purchaseDocuments.documentStaleAt })
    .from(purchaseDocuments)
    .all()
    .map((row) => row.staleAt);
}

const always =
  (result: ReconcileLookupResult): ReconcileLookupFn =>
  () =>
    Promise.resolve(result);

const unreachableLookup: ReconcileLookupFn = () => {
  throw new Error('lookup should not have been called');
};

/** Start a worker with a far-future interval so only the immediate tick runs. */
function start(options: {
  inventoryItem?: ReconcileLookupFn;
  document?: ReconcileLookupFn;
  intervalMs?: number;
}): ReconcileWorkerHandle {
  const handle = startReconcileCrossPillarWorker({
    db: opened.db,
    lookups: {
      inventoryItem: options.inventoryItem ?? unreachableLookup,
      document: options.document ?? unreachableLookup,
    },
    intervalMs: options.intervalMs ?? 60 * 60 * 1000,
    now: () => NOW,
  });
  handles.push(handle);
  return handle;
}

describe('parseSoftUri', () => {
  it('splits a well-formed reference', () => {
    expect(parseSoftUri(ITEM_URI)).toEqual({ pillar: 'inventory', type: 'item', id: 'abc' });
  });

  it('keeps an id containing slashes whole', () => {
    expect(parseSoftUri('pops://documents/document/a/b')?.id).toBe('a/b');
  });

  it.each(['', 'not-a-uri', 'pops://inventory/item', 'pops://inventory//1', 'http://x/y/z'])(
    'rejects %o',
    (uri) => {
      expect(parseSoftUri(uri)).toBeNull();
    }
  );
});

describe('the inventory leg', () => {
  it('leaves a resolving reference clear', async () => {
    seed({ itemUri: ITEM_URI });

    const stats = await start({ inventoryItem: always({ kind: 'ok' }) }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(stats).toMatchObject({ resolved: 1, staleMarked: 0 });
  });

  it('stamps staleAt when the owning pillar reports 404', async () => {
    seed({ itemUri: ITEM_URI });

    const stats = await start({ inventoryItem: always({ kind: 'not-found' }) }).runOnce();

    expect(unitStaleAt()).toEqual([NOW.toISOString()]);
    expect(stats).toMatchObject({ staleMarked: 1 });
  });

  it('clears a stale flag once the reference resolves again', async () => {
    seed({ itemUri: ITEM_URI });
    markInventoryItemUriStale(opened.db, ITEM_URI, '2026-01-01T00:00:00.000Z');

    await start({ inventoryItem: always({ kind: 'ok' }) }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
  });

  it('probes the id, not the whole URI', async () => {
    seed({ itemUri: ITEM_URI });
    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({ kind: 'ok' });

    await start({ inventoryItem: lookup }).runOnce();

    expect(lookup.mock.calls).not.toHaveLength(0);
    expect(lookup.mock.calls.every(([arg]) => arg === 'abc')).toBe(true);
  });

  it('never probes a unit that carries no reference', async () => {
    seed({});

    const stats = await start({}).runOnce();

    expect(stats).toEqual({ resolved: 0, staleMarked: 0, badUri: 0, unavailable: 0 });
  });
});

describe('an unreachable owning pillar', () => {
  it.each([
    ['unavailable', { kind: 'unavailable', reason: 'unavailable' } as const],
    ['a lookup that throws', 'throw' as const],
  ])('leaves a clear flag clear on %s', async (_label, outcome) => {
    seed({ itemUri: ITEM_URI });
    const lookup: ReconcileLookupFn =
      outcome === 'throw' ? () => Promise.reject(new Error('ECONNREFUSED')) : always(outcome);

    const stats = await start({ inventoryItem: lookup }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(stats).toMatchObject({ unavailable: 1, staleMarked: 0 });
  });

  it('leaves an ALREADY-stale flag stale rather than clearing it', async () => {
    seed({ itemUri: ITEM_URI });
    markInventoryItemUriStale(opened.db, ITEM_URI, '2026-01-01T00:00:00.000Z');

    await start({ inventoryItem: always({ kind: 'unavailable', reason: 'degraded' }) }).runOnce();

    expect(unitStaleAt()).toEqual(['2026-01-01T00:00:00.000Z']);
  });
});

describe('a URI the owning pillar cannot make sense of', () => {
  it('preserves the row and counts it as a bad URI', async () => {
    seed({ itemUri: ITEM_URI });

    const stats = await start({
      inventoryItem: always({ kind: 'bad-uri', reason: 'id must be an integer' }),
    }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(stats).toMatchObject({ badUri: 1, staleMarked: 0 });
  });

  it.each([
    ['the wrong pillar', 'pops://finance/item/1'],
    ['the wrong type', 'pops://inventory/thing/1'],
    ['an unparseable string', 'inventory/item/1'],
  ])('never probes a reference addressed to %s', async (_label, uri) => {
    seed({ itemUri: uri });

    const stats = await start({ inventoryItem: unreachableLookup }).runOnce();

    expect(stats).toMatchObject({ badUri: 1 });
    expect(unitStaleAt()).toEqual([null]);
  });
});

describe('the documents leg', () => {
  it('stamps staleAt when the document is gone', async () => {
    seed({ documentUri: DOC_URI });

    const stats = await start({ document: always({ kind: 'not-found' }) }).runOnce();

    expect(documentStaleAt()).toEqual([NOW.toISOString()]);
    expect(stats).toMatchObject({ staleMarked: 1 });
  });

  it('clears a stale document that resolves again', async () => {
    seed({ documentUri: DOC_URI });
    markDocumentUriStale(opened.db, DOC_URI, '2026-01-01T00:00:00.000Z');

    await start({ document: always({ kind: 'ok' }) }).runOnce();

    expect(documentStaleAt()).toEqual([null]);
  });

  it('runs independently of the inventory leg in one tick', async () => {
    seed({ itemUri: ITEM_URI, documentUri: DOC_URI });

    const stats = await start({
      inventoryItem: always({ kind: 'ok' }),
      document: always({ kind: 'not-found' }),
    }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(documentStaleAt()).toEqual([NOW.toISOString()]);
    expect(stats).toMatchObject({ resolved: 1, staleMarked: 1 });
  });

  it('does not confuse an inventory URI stored on a document row', async () => {
    seed({ documentUri: ITEM_URI });
    expect(listDistinctDocumentUris(opened.db)).toEqual([ITEM_URI]);

    const stats = await start({ document: unreachableLookup }).runOnce();

    expect(stats).toMatchObject({ badUri: 1 });
    expect(documentStaleAt()).toEqual([null]);
  });
});

describe('logging', () => {
  /**
   * Regression: the mark/clear writes once lived inside the argument list of
   * an optional-chained `logger?.info?.(…)`, so a worker with no logger —
   * every caller in these tests, and any future one — evaluated nothing and
   * reconciled nothing while reporting a full set of stats.
   */
  it('writes whether or not a logger is configured', async () => {
    seed({ itemUri: ITEM_URI });

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookups: { inventoryItem: always({ kind: 'not-found' }), document: unreachableLookup },
      intervalMs: 60 * 60 * 1000,
      now: () => NOW,
    });
    handles.push(handle);
    await handle.runOnce();

    expect(unitStaleAt()).toEqual([NOW.toISOString()]);
  });

  it('reports the row count it touched to a logger that is configured', async () => {
    seed({ itemUri: ITEM_URI });
    const info = vi.fn();

    const handle = startReconcileCrossPillarWorker({
      db: opened.db,
      lookups: { inventoryItem: always({ kind: 'not-found' }), document: unreachableLookup },
      intervalMs: 60 * 60 * 1000,
      now: () => NOW,
      logger: { info },
    });
    handles.push(handle);
    await handle.runOnce();

    expect(info).toHaveBeenCalledWith(
      'purchases reconcile uri marked stale',
      expect.objectContaining({ leg: 'inventory-item', uri: ITEM_URI, marked: 1 })
    );
  });
});

describe('the tick timer', () => {
  it('arms the next tick only after the current one settles', async () => {
    vi.useFakeTimers();
    seed({ itemUri: ITEM_URI });
    let inFlight = 0;
    let maxConcurrent = 0;
    const lookup: ReconcileLookupFn = async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { kind: 'ok' };
    };

    const handle = start({ inventoryItem: lookup, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    handle.stop();

    expect(maxConcurrent).toBe(1);
  });

  it('stops arming once stopped', async () => {
    vi.useFakeTimers();
    seed({ itemUri: ITEM_URI });
    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({ kind: 'ok' });

    const handle = start({ inventoryItem: lookup, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    const afterFirstTick = lookup.mock.calls.length;
    handle.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(lookup.mock.calls.length).toBe(afterFirstTick);
  });

  it('keeps ticking after a pass throws', async () => {
    vi.useFakeTimers();
    seed({ itemUri: ITEM_URI });
    const lookup = vi
      .fn<ReconcileLookupFn>()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockResolvedValue({ kind: 'ok' });

    const handle = start({ inventoryItem: lookup, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(2500);
    handle.stop();

    expect(lookup.mock.calls.length).toBeGreaterThan(1);
  });
});
