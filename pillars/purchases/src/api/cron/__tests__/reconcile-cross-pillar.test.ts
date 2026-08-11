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
  type ReconcileLegStats,
  type ReconcileLookupFn,
  type ReconcileLookupResult,
  type ReconcileTickStats,
  type ReconcileWorkerHandle,
  type ReconcileWorkerLogger,
} from '../reconcile-cross-pillar.js';

import type { OpenedPurchasesDb } from '../../../db/index.js';

const ITEM_URI = 'pops://inventory/item/abc';
const DOC_URI = 'pops://documents/document/42';
const NOW = new Date('2026-08-08T09:00:00.000Z');
const UNIT_PRICE_CENTS = 5000;

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

/**
 * Seed one order whose single line carries a unit per entry in `itemUris`,
 * plus an optional document reference.
 *
 * An empty `itemUris` still writes one unit, unreferenced — the lazily
 * populated shape the schema documents as normal, and the shape the
 * inventory leg sees on every real row today.
 */
function seed(options: { itemUris?: readonly string[]; documentUri?: string } = {}): void {
  const itemUris = options.itemUris ?? [];
  const units =
    itemUris.length === 0
      ? [{ serialNumber: 'SN-1' }]
      : itemUris.map((uri, index) => ({
          serialNumber: `SN-${String(index + 1)}`,
          inventoryItemUri: uri,
        }));
  // Derived rather than fixed so a multi-unit line still costs what its
  // quantity implies. Nothing validates that today, but a fixture whose
  // money contradicts its own quantity is a bad thing to assert against.
  const lineTotalCents = UNIT_PRICE_CENTS * units.length;
  createPurchase(
    opened.db,
    amazonOrder({
      totalCents: lineTotalCents,
      items: [
        {
          name: 'Nanoleaf bulb',
          quantity: units.length,
          unitPriceCents: UNIT_PRICE_CENTS,
          lineTotalCents,
          kind: 'durable',
          units,
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

/**
 * Start a worker with a far-future interval so only the immediate tick runs.
 *
 * The logger stays optional and unset by default: most tests here assert on
 * the returned stats and on the database, and a worker with no logger is
 * the configuration that once silently reconciled nothing.
 */
function start(options: {
  inventoryItem?: ReconcileLookupFn;
  document?: ReconcileLookupFn;
  intervalMs?: number;
  logger?: ReconcileWorkerLogger;
}): ReconcileWorkerHandle {
  const handle = startReconcileCrossPillarWorker({
    db: opened.db,
    lookups: {
      inventoryItem: options.inventoryItem ?? unreachableLookup,
      document: options.document ?? unreachableLookup,
    },
    intervalMs: options.intervalMs ?? 60 * 60 * 1000,
    now: () => NOW,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
  handles.push(handle);
  return handle;
}

/** The named leg's line from a tick, or a failure that says which leg went missing. */
function legStats(stats: ReconcileTickStats, label: string): ReconcileLegStats {
  const found = stats.legs.find((leg) => leg.leg === label);
  if (found === undefined) throw new Error(`tick reported no '${label}' leg`);
  return found;
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
    seed({ itemUris: [ITEM_URI] });

    const stats = await start({ inventoryItem: always({ kind: 'ok' }) }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(stats).toMatchObject({ resolved: 1, staleMarked: 0 });
  });

  it('stamps staleAt when the owning pillar reports 404', async () => {
    seed({ itemUris: [ITEM_URI] });

    const stats = await start({ inventoryItem: always({ kind: 'not-found' }) }).runOnce();

    expect(unitStaleAt()).toEqual([NOW.toISOString()]);
    expect(stats).toMatchObject({ staleMarked: 1 });
  });

  it('clears a stale flag once the reference resolves again', async () => {
    seed({ itemUris: [ITEM_URI] });
    markInventoryItemUriStale(opened.db, ITEM_URI, '2026-01-01T00:00:00.000Z');

    await start({ inventoryItem: always({ kind: 'ok' }) }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
  });

  it('probes the id, not the whole URI', async () => {
    seed({ itemUris: [ITEM_URI] });
    const lookup = vi.fn<ReconcileLookupFn>().mockResolvedValue({ kind: 'ok' });

    await start({ inventoryItem: lookup }).runOnce();

    expect(lookup.mock.calls).not.toHaveLength(0);
    expect(lookup.mock.calls.every(([arg]) => arg === 'abc')).toBe(true);
  });

  it('never probes a unit that carries no reference', async () => {
    seed({});

    const stats = await start({}).runOnce();

    expect(stats).toMatchObject({ resolved: 0, staleMarked: 0, badUri: 0, unavailable: 0 });
  });
});

describe('an unreachable owning pillar', () => {
  it.each([
    ['unavailable', { kind: 'unavailable', reason: 'unavailable' } as const],
    ['a lookup that throws', 'throw' as const],
  ])('leaves a clear flag clear on %s', async (_label, outcome) => {
    seed({ itemUris: [ITEM_URI] });
    const lookup: ReconcileLookupFn =
      outcome === 'throw' ? () => Promise.reject(new Error('ECONNREFUSED')) : always(outcome);

    const stats = await start({ inventoryItem: lookup }).runOnce();

    expect(unitStaleAt()).toEqual([null]);
    expect(stats).toMatchObject({ unavailable: 1, staleMarked: 0 });
  });

  it('leaves an ALREADY-stale flag stale rather than clearing it', async () => {
    seed({ itemUris: [ITEM_URI] });
    markInventoryItemUriStale(opened.db, ITEM_URI, '2026-01-01T00:00:00.000Z');

    await start({ inventoryItem: always({ kind: 'unavailable', reason: 'degraded' }) }).runOnce();

    expect(unitStaleAt()).toEqual(['2026-01-01T00:00:00.000Z']);
  });
});

describe('a URI the owning pillar cannot make sense of', () => {
  it('preserves the row and counts it as a bad URI', async () => {
    seed({ itemUris: [ITEM_URI] });

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
    seed({ itemUris: [uri] });

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
    seed({ itemUris: [ITEM_URI], documentUri: DOC_URI });

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

describe('per-leg work-set reporting', () => {
  /**
   * The reason this reporting exists. Nothing writes
   * `purchase_item_units.inventory_item_uri` — no adapter creates unit rows
   * at all — so the inventory leg's work set is empty on every real
   * deployment, while the documents leg is live off the receipt adapter.
   *
   * Against the flat totals alone that tick is indistinguishable from one
   * where every inventory reference resolved, and the cron reports success
   * over a column it never looked at. Only `checked` separates them.
   */
  it('separates a leg with no work from a leg where everything resolved', async () => {
    seed({ documentUri: DOC_URI });

    const stats = await start({ document: always({ kind: 'ok' }) }).runOnce();

    expect(stats.legs).toEqual([
      { leg: 'inventory-item', checked: 0, resolved: 0, staleMarked: 0, badUri: 0, unavailable: 0 },
      { leg: 'document', checked: 1, resolved: 1, staleMarked: 0, badUri: 0, unavailable: 0 },
    ]);
    // The totals both legs collapse into, and which on their own say nothing
    // about the inventory leg having been skipped entirely.
    expect(stats).toMatchObject({ resolved: 1, staleMarked: 0, badUri: 0, unavailable: 0 });
  });

  it('accounts for every URI in the work set exactly once, whatever became of it', async () => {
    seed({
      itemUris: [ITEM_URI, 'pops://inventory/item/def', 'pops://finance/item/1'],
      documentUri: DOC_URI,
    });
    const byId = new Map<string, ReconcileLookupResult>([
      ['abc', { kind: 'ok' }],
      ['def', { kind: 'not-found' }],
    ]);

    const stats = await start({
      inventoryItem: (id) => Promise.resolve(byId.get(id) ?? { kind: 'unavailable', reason: 'x' }),
      document: always({ kind: 'ok' }),
    }).runOnce();

    // Three distinct URIs: one resolves, one 404s, one is addressed to the
    // wrong pillar and is counted without ever being probed.
    const inventory = legStats(stats, 'inventory-item');
    expect(inventory).toEqual({
      leg: 'inventory-item',
      checked: 3,
      resolved: 1,
      staleMarked: 1,
      badUri: 1,
      unavailable: 0,
    });
    expect(inventory.resolved + inventory.staleMarked + inventory.badUri + inventory.unavailable) //
      .toBe(inventory.checked);
  });

  it('sums the leg counters into the tick totals', async () => {
    seed({ itemUris: [ITEM_URI], documentUri: DOC_URI });

    const stats = await start({
      inventoryItem: always({ kind: 'ok' }),
      document: always({ kind: 'not-found' }),
    }).runOnce();

    expect(stats).toMatchObject({ resolved: 1, staleMarked: 1, badUri: 0, unavailable: 0 });
    expect(stats.legs.map((leg) => leg.checked)).toEqual([1, 1]);
  });

  it('tells the logger an empty leg was empty', async () => {
    seed({ documentUri: DOC_URI });
    const info = vi.fn();

    await start({ document: always({ kind: 'ok' }), logger: { info } }).runOnce();

    expect(info).toHaveBeenCalledWith(
      'purchases reconcile leg complete',
      expect.objectContaining({ leg: 'inventory-item', checked: 0 })
    );
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
    seed({ itemUris: [ITEM_URI] });

    await start({ inventoryItem: always({ kind: 'not-found' }) }).runOnce();

    expect(unitStaleAt()).toEqual([NOW.toISOString()]);
  });

  it('reports the row count it touched to a logger that is configured', async () => {
    seed({ itemUris: [ITEM_URI] });
    const info = vi.fn();

    await start({ inventoryItem: always({ kind: 'not-found' }), logger: { info } }).runOnce();

    expect(info).toHaveBeenCalledWith(
      'purchases reconcile uri marked stale',
      expect.objectContaining({ leg: 'inventory-item', uri: ITEM_URI, marked: 1 })
    );
  });
});

describe('the tick timer', () => {
  it('arms the next tick only after the current one settles', async () => {
    vi.useFakeTimers();
    seed({ itemUris: [ITEM_URI] });
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
    seed({ itemUris: [ITEM_URI] });
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
    seed({ itemUris: [ITEM_URI] });
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

  it('tells a configured logger why a tick failed', async () => {
    // Not a lookup throwing — `runLeg` already swallows that as an
    // `unavailable` outcome. This is a failure from OUTSIDE the per-leg
    // work, e.g. the logger itself, which the worker's own try/catch exists
    // to survive so the next tick still gets armed.
    vi.useFakeTimers();
    seed({ itemUris: [ITEM_URI] });
    const warn = vi.fn();
    const info = vi.fn(() => {
      throw new Error('logger boom');
    });

    const handle = start({
      inventoryItem: always({ kind: 'ok' }),
      intervalMs: 1000,
      logger: { warn, info },
    });
    await vi.advanceTimersByTimeAsync(0);
    handle.stop();

    expect(warn).toHaveBeenCalledWith(
      'purchases reconcile tick failed',
      expect.objectContaining({ error: 'logger boom' })
    );
  });
});
