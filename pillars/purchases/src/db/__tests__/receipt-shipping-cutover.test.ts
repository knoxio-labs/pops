/**
 * The cutover migration, executed rather than read.
 *
 * Before shipping had its own term in the receipt gate, a delivery charge
 * was written to `surcharge_cents`. Those rows cannot be split afterwards,
 * so they are tagged, and the tag says the surcharge *may* include
 * delivery — nothing stronger is true of them.
 *
 * Executed because the first draft of this statement was not: an
 * `INSERT ... SELECT` naming no columns fails outright against a
 * `purchase_tags` that has three of them, and a migration that throws takes
 * `openPurchasesDb` with it on every deployment that has ever stored a
 * receipt. Reading the file and asserting on its text would not have caught
 * that. Running it does.
 *
 * The statement is idempotent (`OR IGNORE` against the composite primary
 * key), which is what makes it safe to run here against a database the
 * migrator has already opened.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SHIPPING_UNCERTAIN } from '../../ingest/receipt/purchase.js';
import { createPurchase, getPurchase, upsertSource } from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../index.js';

const CUTOVER_SQL = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'migrations',
    '0004_receipt_shipping_cutover.sql'
  ),
  'utf8'
);

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  upsertSource(opened.db, {
    id: 'receipt',
    label: 'Receipt drop-zone',
    settlementWindowDays: 7,
    autoLinkPolicy: 'review',
    ingestAdapter: 'receipt-upload',
  });
});

afterEach(() => {
  cleanup();
});

const receiptPurchase = (overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput => ({
  source: 'receipt',
  sourceOrderId: 'a'.repeat(64),
  ingestMethod: 'upload',
  orderedAt: '2026-08-01T04:32:00.000Z',
  currency: 'AUD',
  subtotalCents: 2750,
  surchargeCents: 995,
  totalCents: 3745,
  checksum: 'receipt:one',
  ...overrides,
});

const runCutover = (): void => {
  opened.raw.exec(CUTOVER_SQL);
};

const tagsOf = (id: string): readonly string[] => getPurchase(opened.db, id)?.tags ?? [];

describe('the cutover statement', () => {
  it('runs at all against the real table', () => {
    // `purchase_tags` has three columns, `created_at` carrying a default.
    // Without the column list this is "table purchase_tags has 3 columns
    // but 2 values were supplied", on every open, forever.
    expect(() => {
      runCutover();
    }).not.toThrow();
  });

  it('tags a receipt purchase whose surcharge may have been delivery', () => {
    const id = createPurchase(opened.db, receiptPurchase());

    runCutover();

    expect(tagsOf(id)).toContain(SHIPPING_UNCERTAIN);
  });

  it('leaves a receipt purchase with no surcharge alone', () => {
    // Nothing was ever folded in, so there is nothing uncertain about it.
    const id = createPurchase(opened.db, receiptPurchase({ surchargeCents: 0, totalCents: 2750 }));

    runCutover();

    expect(tagsOf(id)).not.toContain(SHIPPING_UNCERTAIN);
  });

  it('leaves other sources alone, because only the receipt path folded delivery in', () => {
    // The amazon adapter has always written `shipping_cents`. Its
    // surcharges are surcharges.
    const id = createPurchase(opened.db, {
      source: 'amazon',
      sourceOrderId: '249-1512883-0105415',
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      surchargeCents: 995,
      totalCents: 5678,
      checksum: 'amazon:one',
    });

    runCutover();

    expect(tagsOf(id)).not.toContain(SHIPPING_UNCERTAIN);
  });

  it('is idempotent, so a re-run is not a constraint violation', () => {
    const id = createPurchase(opened.db, receiptPurchase());

    runCutover();
    runCutover();

    expect(tagsOf(id).filter((tag) => tag === SHIPPING_UNCERTAIN)).toHaveLength(1);
  });

  it('writes the same literal the code calls this tag', () => {
    // SQL cannot import the constant, so the agreement is a gate rather
    // than a promise. A rename on one side without the other leaves a tag
    // nothing queries and a query that finds nothing.
    expect(CUTOVER_SQL).toContain(`'${SHIPPING_UNCERTAIN}'`);
  });
});
