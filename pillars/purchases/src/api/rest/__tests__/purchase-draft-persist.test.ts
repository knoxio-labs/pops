/**
 * Writing a reviewer-approved draft (POPS-2454).
 *
 * The happy path is the least interesting part of this module: its job is
 * mostly deciding what a refusal means. A repeated save has to read as a
 * conflict rather than a second purchase, and an input the service rejects
 * has to reach the caller as a 400 rather than as a 500 — because on the
 * phone the difference is "you already saved this" versus "something
 * broke", and only one of those tells the person what to do.
 */
import { describe, expect, it } from 'vitest';

import { openTempDb, seedWoolworthsSource } from '../../../db/__tests__/helpers.js';
import { persistDraftPurchase } from '../purchase-draft-persist.js';

import type { CreatePurchaseInput } from '../../../db/services/purchase-input.js';

const draft = (over: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput => ({
  source: 'woolworths',
  ingestMethod: 'upload',
  orderedAt: '2026-08-01T04:32:00.000Z',
  currency: 'AUD',
  totalCents: 2750,
  checksum: 'draft-checksum-1',
  sourceOrderId: 'draft-checksum-1',
  charges: [{ sourceChargeRef: 'draft-c1', amountCents: 2750, role: 'capture' }],
  ...over,
});

describe('persistDraftPurchase', () => {
  it('writes the draft and reads the row back', () => {
    const { opened, cleanup } = openTempDb();
    try {
      seedWoolworthsSource(opened);

      const result = persistDraftPurchase(opened.db, draft());

      expect(result.kind).toBe('written');
      if (result.kind !== 'written') return;
      expect(result.detail.purchase.totalCents).toBe(2750);
      expect(result.detail.purchase.currency).toBe('AUD');
      expect(result.detail.charges).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('refuses a repeated save as a conflict rather than writing it twice', () => {
    // The idempotency key rides as both checksum and sourceOrderId, so a
    // retried save — a flaky connection, a double tap — is a 409 and not a
    // second purchase for the same money.
    const { opened, cleanup } = openTempDb();
    try {
      seedWoolworthsSource(opened);
      const first = persistDraftPurchase(opened.db, draft());
      expect(first.kind).toBe('written');

      const again = persistDraftPurchase(opened.db, draft({ charges: [] }));

      expect(again.kind).toBe('refused');
      if (again.kind !== 'refused') return;
      expect(again.status).toBe(409);
    } finally {
      cleanup();
    }
  });

  it('maps a draft naming a source nobody registered to a 400, not a crash', () => {
    // `ensureDraftSource` is the caller's job. Skipping it is a caller bug,
    // and the caller is the one who can fix it — so it gets an answer it
    // can act on rather than a 500.
    const { opened, cleanup } = openTempDb();
    try {
      const result = persistDraftPurchase(opened.db, draft({ source: 'never-registered' }));

      expect(result.kind).toBe('refused');
      if (result.kind !== 'refused') return;
      expect(result.status).toBe(400);
    } finally {
      cleanup();
    }
  });
});
