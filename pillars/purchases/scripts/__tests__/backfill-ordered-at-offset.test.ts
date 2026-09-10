/**
 * The offset backfill's one promise: it fills a day from evidence, and leaves
 * everything else alone.
 *
 * Both halves fail silently if they are wrong. A pass that guessed the
 * household zone for orders whose sources never stated one would look
 * identical on the console and would be indistinguishable in the data
 * afterwards — an unknown day converted into a confidently wrong one, with
 * nothing recording that it was invented. A pass that overwrote an offset an
 * ingest already recorded would be the same failure with a newer number.
 *
 * So the cases here are the ones that would pass a happy-path suite: an order
 * whose capture row says nothing, one whose declared zone names nowhere, one
 * an ingest has already answered, and a second run over a database the first
 * one finished with.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openTempDb,
  seedAmazonSource,
  seedWoolworthsSource,
} from '../../src/db/__tests__/helpers.js';
import { createPurchase, purchases } from '../../src/db/index.js';
import {
  applyOffsetBackfill,
  planOffsetBackfill,
  recoverOffset,
  report,
  tallyBySource,
} from '../backfill-ordered-at-offset.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../src/db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  seedWoolworthsSource(opened);
});

afterEach(() => {
  cleanup();
});

/** An order with no offset of its own; `capture` decides what is recoverable. */
function order(overrides: Partial<CreatePurchaseInput> = {}): string {
  return createPurchase(opened.db, {
    source: 'woolworths',
    sourceOrderId: `order-${Math.random().toString(36).slice(2)}`,
    ingestMethod: 'upload',
    orderedAt: '2026-02-02T14:30:00Z',
    currency: 'AUD',
    totalCents: 1000,
    checksum: `chk-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
}

function storedOffset(purchaseId: string): number | null {
  const row = opened.raw
    .prepare('SELECT ordered_at_offset_minutes AS offset FROM purchases WHERE id = ?')
    .get(purchaseId) as { offset: number | null } | undefined;
  return row?.offset ?? null;
}

describe('recoverOffset', () => {
  const row = {
    purchaseId: 'p-1',
    source: 'woolworths',
    orderedAt: '2026-02-02T14:30:00Z',
    captureOffsetMinutes: null,
    declaredTimeZone: null,
    hasCapture: true,
  };

  it('takes a stated offset as-is, which is the only exact evidence there is', () => {
    expect(recoverOffset({ ...row, captureOffsetMinutes: 660 })).toMatchObject({
      offsetMinutes: 660,
      evidence: 'capture-offset',
    });
  });

  it('resolves a declared zone at the order’s own instant, DST and all', () => {
    // February in Sydney is +11:00 and July is +10:00. Resolving at the
    // order's instant rather than at "now" is the whole point: a fixed guess
    // is wrong for roughly half a year of history.
    expect(recoverOffset({ ...row, declaredTimeZone: 'Australia/Sydney' }).offsetMinutes).toBe(660);
    expect(
      recoverOffset({
        ...row,
        orderedAt: '2026-07-02T04:30:00Z',
        declaredTimeZone: 'Australia/Sydney',
      }).offsetMinutes
    ).toBe(600);
  });

  it('prefers the stated offset over the declared zone when both are present', () => {
    // The offset is what the device was actually on. A zone is a place, and
    // deriving from it re-does arithmetic the device already did.
    expect(
      recoverOffset({
        ...row,
        captureOffsetMinutes: 570,
        declaredTimeZone: 'Australia/Sydney',
      })
    ).toMatchObject({ offsetMinutes: 570, evidence: 'capture-offset' });
  });

  it('leaves an order with no capture row alone, and says so', () => {
    expect(recoverOffset({ ...row, hasCapture: false })).toMatchObject({
      offsetMinutes: null,
      evidence: 'no-capture-row',
    });
  });

  it('leaves a capture row that states neither, and distinguishes it from bad evidence', () => {
    expect(recoverOffset(row).evidence).toBe('capture-states-no-zone');
  });

  it('refuses an offset no zone has ever been on rather than writing it through', () => {
    // Both columns carry ±14:00 as a CHECK, so a value outside it cannot be
    // written and cannot have been stored — but this pass reads a column it
    // does not own, and answering null costs nothing where answering wrong
    // would move a purchase across a day boundary on no evidence.
    expect(recoverOffset({ ...row, captureOffsetMinutes: 900 })).toMatchObject({
      offsetMinutes: null,
      evidence: 'unusable-evidence',
    });
  });

  it('refuses a zone the runtime does not know rather than guessing near it', () => {
    expect(recoverOffset({ ...row, declaredTimeZone: 'Australia/Sydneyish' })).toMatchObject({
      offsetMinutes: null,
      evidence: 'unusable-evidence',
    });
  });

  it('accepts a zone alias the runtime really resolves', () => {
    expect(recoverOffset({ ...row, declaredTimeZone: 'Australia/Canberra' }).offsetMinutes).toBe(
      660
    );
  });
});

describe('the pass over a real database', () => {
  it('fills only the orders evidence reaches, and leaves the rest null', () => {
    const recoverable = order({ capture: { utcOffsetMinutes: 660 } });
    const zoned = order({ capture: { declaredTimeZone: 'Australia/Sydney' } });
    const bare = order({ source: 'amazon', ingestMethod: 'export' });

    const plan = planOffsetBackfill(opened.db);
    expect(applyOffsetBackfill(opened.db, plan)).toBe(2);

    expect(storedOffset(recoverable)).toBe(660);
    expect(storedOffset(zoned)).toBe(660);
    expect(storedOffset(bare)).toBeNull();
  });

  it('does not touch an order whose ingest already recorded an offset', () => {
    // The ingest's number is the fact; this pass is a reconstruction. An
    // overwrite would replace evidence with inference and look like a success.
    const answered = order({ orderedAtOffsetMinutes: 600, capture: { utcOffsetMinutes: 660 } });

    applyOffsetBackfill(opened.db, planOffsetBackfill(opened.db));

    expect(storedOffset(answered)).toBe(600);
  });

  it('is idempotent: a second run finds nothing left to do', () => {
    order({ capture: { utcOffsetMinutes: 660 } });

    expect(applyOffsetBackfill(opened.db, planOffsetBackfill(opened.db))).toBe(1);
    const second = planOffsetBackfill(opened.db);
    expect(second).toEqual([]);
    expect(applyOffsetBackfill(opened.db, second)).toBe(0);
  });

  it('plans without writing, so a preview leaves the database as it found it', () => {
    const id = order({ capture: { utcOffsetMinutes: 660 } });

    expect(planOffsetBackfill(opened.db)).toHaveLength(1);

    expect(storedOffset(id)).toBeNull();
    expect(opened.db.select().from(purchases).all()).toHaveLength(1);
  });

  it('leaves an order whose declared zone names nothing, rather than guessing near it', () => {
    // The zone column carries no CHECK — it is whatever the client said — so
    // this is the shape bad evidence actually reaches the database in. An
    // out-of-range OFFSET cannot: `purchase_capture` rejects one on write,
    // which is why that arm of `recoverOffset` is covered above and not here.
    const invented = order({ capture: { declaredTimeZone: 'Australia/Sydneyish' } });

    expect(applyOffsetBackfill(opened.db, planOffsetBackfill(opened.db))).toBe(0);
    expect(storedOffset(invented)).toBeNull();
  });
});

describe('the report', () => {
  it('counts set-vs-left-null per source, because the same number means two things', () => {
    const plan = [
      { purchaseId: 'a', source: 'woolworths', offsetMinutes: 660, evidence: 'capture-offset' },
      { purchaseId: 'b', source: 'woolworths', offsetMinutes: null, evidence: 'no-capture-row' },
      { purchaseId: 'c', source: 'amazon', offsetMinutes: null, evidence: 'no-capture-row' },
    ] as const;

    const tallies = tallyBySource(plan);

    expect(tallies.get('woolworths')).toMatchObject({ set: 1, leftNull: 1 });
    expect(tallies.get('amazon')).toMatchObject({ set: 0, leftNull: 1 });
  });

  it('says a preview wrote nothing, rather than leaving the reader to assume it', () => {
    expect(report([], null).at(-1)).toContain('nothing was written');
    expect(report([], 0).at(-1)).toContain('Wrote 0 row(s)');
  });

  it('names every source and its reasons, so a residual is a known number', () => {
    const plan = [
      { purchaseId: 'c', source: 'amazon', offsetMinutes: null, evidence: 'no-capture-row' },
    ] as const;

    expect(report(plan, null).join('\n')).toContain('amazon: 0 recoverable, 1 left null');
    expect(report(plan, null).join('\n')).toContain('no-capture-row=1');
  });
});
