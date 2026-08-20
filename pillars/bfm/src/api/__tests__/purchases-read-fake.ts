/**
 * A stand-in for the purchases pillar's READ surface, behind a real
 * {@link PillarGateway}.
 *
 * A fake HANDLE, like its receipt-upload sibling in `purchases-fake.ts`: the
 * gateway, the wire validation, the day derivation and the paging arithmetic
 * are all production code under test, and only the network is replaced.
 *
 * The list implementation reproduces the producer's contract rather than a
 * convenient approximation — `orderedAt DESC, id ASC`, an inclusive `limit`,
 * and an `offset` applied after ordering — because bfm's cursor is an offset
 * into exactly that order. `pillars/purchases/src/db/services/purchase-reads.ts`
 * is what holds purchases to it; the two must be read as a pair.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

/** A purchases list row, as that pillar's REST layer serves one. */
export interface PurchasesFakeRow {
  id: string;
  source: string;
  merchantEntityName: string | null;
  totalCents: number;
  currency: string;
  orderedAt: string;
  /**
   * Minutes ahead of UTC where the order was placed. Optional here because
   * the producer's own field is: a row written before that column existed
   * carries none, and the fake has to be able to spell that row.
   */
  orderedAtOffsetMinutes?: number | null;
  status: string;
  itemCount: number;
  receiptUri: string | null;
}

/**
 * A row as purchases serves one.
 *
 * The default instant is a Sydney morning — 12:15 on the 13th at +10:00,
 * stored as 02:15 UTC on the same day. It is deliberately NOT one of the
 * shapes that hides a day-derivation bug: see
 * `mobile-purchases-read.test.ts` for the pair that does not agree with
 * itself, which is what a fixture has to be able to express before this
 * suite can defend the day at all.
 */
export function purchasesRow(
  overrides: Partial<PurchasesFakeRow> & { id: string }
): PurchasesFakeRow {
  return {
    source: 'receipt',
    merchantEntityName: 'Woolworths',
    totalCents: 8420,
    currency: 'AUD',
    orderedAt: '2026-08-13T02:15:00.000Z',
    orderedAtOffsetMinutes: 600,
    status: 'awaiting_settlement',
    itemCount: 3,
    receiptUri: 'pops://purchases/receipt/abc',
    ...overrides,
  };
}

export interface PurchasesListCall {
  limit?: number;
  offset?: number;
}

export interface PurchasesReadFake {
  factory: PillarHandleFactory;
  /** Every `purchase.list` input bfm sent, in order. */
  listCalls: PurchasesListCall[];
  /** Add a row after the fake has been handed out, as a capture mid-scroll would. */
  insert: (row: PurchasesFakeRow) => void;
}

/**
 * Read the wire input the SDK hands a procedure. The transport carries
 * `unknown`, so the fake narrows it the way purchases' zod layer would rather
 * than trusting the caller.
 */
function readListCall(input: unknown): PurchasesListCall {
  if (input === null || typeof input !== 'object') return {};
  return {
    limit: 'limit' in input && typeof input.limit === 'number' ? input.limit : undefined,
    offset: 'offset' in input && typeof input.offset === 'number' ? input.offset : undefined,
  };
}

function readId(input: unknown): string {
  if (
    input !== null &&
    typeof input === 'object' &&
    'id' in input &&
    typeof input.id === 'string'
  ) {
    return input.id;
  }
  throw new Error('[bfm-test] purchase.get was called without an id');
}

/** The producer's order: newest first, ties broken by ascending id. */
function compareRows(left: PurchasesFakeRow, right: PurchasesFakeRow): number {
  if (left.orderedAt !== right.orderedAt) return left.orderedAt < right.orderedAt ? 1 : -1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/**
 * Build the fake over a mutable set of rows.
 *
 * @param detail What `purchase.get` answers, per id. An id absent from the map
 *   answers the producer's own 404 shape, because "no such order" is a real
 *   answer bfm has to map rather than a test setup mistake.
 */
export function createPurchasesReadFake(
  initialRows: readonly PurchasesFakeRow[],
  detail: Readonly<Record<string, CallResult<unknown>>> = {}
): PurchasesReadFake {
  const rows = [...initialRows];
  const listCalls: PurchasesListCall[] = [];

  const list = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const input = readListCall(rawInput);
    listCalls.push(input);
    const ordered = [...rows].sort(compareRows);
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    return Promise.resolve({
      kind: 'ok',
      value: { items: ordered.slice(offset, offset + limit) },
    });
  };

  const get = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const id = readId(rawInput);
    return Promise.resolve(
      detail[id] ?? { kind: 'not-found', pillar: 'purchases', message: `Purchase ${id} not found` }
    );
  };

  return {
    factory: <TRouter>() => fakePillarHandle<TRouter>('purchases', { purchase: { list, get } }),
    listCalls,
    insert: (row: PurchasesFakeRow) => {
      rows.push(row);
    },
  };
}

/** The producer's `purchase.get` body, with every field bfm reads present. */
export function purchasesDetail(
  overrides: {
    id?: string;
    merchantEntityName?: string | null;
    totalCents?: number;
    orderedAt?: string;
    /** Absent leaves the producer's default; `null` spells a row that has none. */
    orderedAtOffsetMinutes?: number | null;
    status?: string;
    items?: readonly {
      item: { id: string; name: string; quantity: number; lineTotalCents: number };
    }[];
    documents?: readonly { documentUri: string; kind: string; createdAt: string }[];
  } = {}
): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      purchase: {
        id: overrides.id ?? 'pur-1',
        source: 'receipt',
        sourceOrderId: null,
        merchantEntityName:
          overrides.merchantEntityName === undefined ? 'Woolworths' : overrides.merchantEntityName,
        merchantEntityId: null,
        totalCents: overrides.totalCents ?? 8420,
        subtotalCents: 7600,
        taxCents: 760,
        shippingCents: 0,
        discountCents: 0,
        surchargeCents: 60,
        currency: 'AUD',
        orderedAt: overrides.orderedAt ?? '2026-08-13T02:15:00.000Z',
        orderedAtOffsetMinutes:
          overrides.orderedAtOffsetMinutes === undefined ? 600 : overrides.orderedAtOffsetMinutes,
        status: overrides.status ?? 'awaiting_settlement',
      },
      // Nested under `item`, exactly as `PurchaseItemDetailSchema` sends it.
      // A flat line here is the fake agreeing with a schema the producer does
      // not serve, which is how a unit suite stays green against a 502.
      items: overrides.items ?? [
        { item: { id: 'item-1', name: 'MILK 2L', quantity: 2, lineTotalCents: 620 } },
        { item: { id: 'item-2', name: 'BREAD', quantity: 1, lineTotalCents: 450 } },
      ],
      // Present and unread by bfm — the producer sends them and the wire
      // schema must not demand their absence.
      shipments: [],
      charges: [],
      tags: [],
      accounting: {},
      documents: overrides.documents ?? [
        {
          documentUri: 'pops://purchases/receipt/abc',
          kind: 'receipt',
          createdAt: '2026-08-13T02:16:00.000Z',
        },
      ],
    },
  };
}
