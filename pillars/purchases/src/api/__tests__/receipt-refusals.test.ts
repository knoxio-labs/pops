/**
 * Every kind the gate can raise, refused at the route.
 *
 * The upload path decides admissibility once, from `gate.admissible`, and
 * one worked example of a refusal does not show that. What it shows is that
 * *that* example is refused — which is how a reading of `receiptToPurchase`
 * in isolation, where only an unreadable total is checked, can look like a
 * hole that admits the other six. It is not one, because the route never
 * reaches the mapper with a refused reading; but nothing here asserted that
 * per kind, so the claim could not be settled by running anything.
 *
 * So this enumerates `GateFailure['kind']`. Each case is arranged so the
 * named kind is the only thing wrong with the reading — a refusal for some
 * other reason would prove nothing about the kind under test — and each
 * asserts the same two things: the answer is `needs-review`, and no
 * purchase was written. A kind added to the union without a case here
 * leaves that kind unmeasured at the boundary that matters.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';
import type { GateFailure } from '../../ingest/receipt/gate.js';
import type { ReceiptVision } from '../../ingest/receipt/vision.js';
import type { MerchantResolver } from '../contacts/merchant.js';

/** A real JPEG magic number, so the edge check passes. */
const JPEG_BASE64 = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 9),
]).toString('base64');

const GOOD = {
  merchantName: 'Bunnings Warehouse',
  address: '123 Example St, Sydney NSW 2000',
  timeZone: 'Australia/Sydney',
  purchasedOn: '2026-08-01',
  purchasedAt: '14:32',
  currency: 'AUD',
  total: '$27.50',
  tax: null,
  discounts: [],
  lines: [
    { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
    { description: 'Screws Bugle 8g 65mm', amount: '$15.00' },
  ],
  unreadable: [] as string[],
};

/**
 * One reading per kind, each refused for that kind and nothing else.
 *
 * Keyed by the union rather than a plain array of literals, so the compiler
 * refuses this file the day a kind is added without a case here — a plain
 * array only checks that each literal present is valid, not that every
 * member of the union is.
 */
const REFUSALS: Record<GateFailure['kind'], Record<string, unknown>> = {
  'unreadable-total': { ...GOOD, total: 'illegible' },
  'unreadable-line': {
    ...GOOD,
    // The readable line alone accounts for the total, so the sum has
    // nothing to say and the unreadable one is the only complaint.
    total: '$12.50',
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Screws Bugle 8g 65mm', amount: 'sm?dged' },
    ],
  },
  // Nothing to add up, and zero is what nothing adds to — so the arithmetic
  // agrees and `no-lines` is left holding the objection on its own.
  'no-lines': { ...GOOD, total: '$0.00', lines: [] },
  'negative-line': {
    // Sums correctly against the stated total. That is the point: nothing
    // but this check objects to an item worth less than nothing.
    ...GOOD,
    total: '$7.50',
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Loyalty adjustment', amount: '-$5.00' },
    ],
  },
  'sum-mismatch': { ...GOOD, total: '$30.00' },
  'ambiguous-tax': {
    // Two components equal to the stated tax: counting it once and adding
    // the tax gives the same total as counting it twice with the tax
    // already inside. The receipt does not say which reading it is.
    ...GOOD,
    total: '$17.50',
    tax: '$2.50',
    lines: [
      { description: 'Timber Pine DAR 42x19', amount: '$12.50' },
      { description: 'Bag levy', amount: '$2.50' },
      { description: 'Container deposit', amount: '$2.50' },
    ],
  },
  // A torn corner leaves the numbers intact, so every other check passes.
  damaged: { ...GOOD, unreadable: ['the bottom third is torn away'] },
};

const saying = (answer: string): ReceiptVision => ({ read: async () => answer });

/** A test must not reach the live resolver; nothing here turns on the link. */
const NO_MERCHANT: MerchantResolver = { resolve: async () => null };

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let receiptDir: string;

function appWith(vision: ReceiptVision): Express {
  return createPurchasesApiApp({
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
    vision,
    merchant: NO_MERCHANT,
  });
}

const upload = (app: Express) =>
  requestOn(app)
    .post('/receipts')
    .send({ parts: [{ mediaType: 'image/jpeg', dataBase64: JPEG_BASE64 }] });

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  receiptDir = mkdtempSync(join(tmpdir(), 'purchases-refusal-'));
  process.env['PURCHASES_RECEIPT_DIR'] = receiptDir;
  __resetPillarRegistryCache();
});

afterEach(() => {
  cleanup();
  rmSync(receiptDir, { recursive: true, force: true });
  delete process.env['PURCHASES_RECEIPT_DIR'];
  __resetPillarRegistryCache();
});

describe('the upload route, against every kind the gate can raise', () => {
  it('admits a reading the paper agrees with, so the refusals mean something', async () => {
    const response = await upload(appWith(saying(JSON.stringify(GOOD))));
    expect(response.body.kind).toBe('created');
  });

  for (const [kind, reading] of Object.entries(REFUSALS)) {
    it(`sends ${kind} to review and writes no purchase`, async () => {
      const app = appWith(saying(JSON.stringify(reading)));
      const response = await upload(app);

      expect(response.status).toBe(200);
      expect(response.body.kind).toBe('needs-review');
      // The whole list, not the first entry: a case that also trips
      // something else is not a case for the kind it claims to cover.
      expect(response.body.failures.map((one: GateFailure) => one.kind)).toEqual([kind]);

      const listed = await requestOn(app).get('/purchases');
      expect(listed.body.items).toHaveLength(0);
    });
  }
});
