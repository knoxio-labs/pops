import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openPurchasesDb, upsertSource, type OpenedPurchasesDb } from '../index.js';

import type { CreatePurchaseInput } from '../index.js';

/**
 * Open a throwaway on-disk purchases DB with migrations applied.
 *
 * On disk rather than `:memory:` on purpose — the migration journal, the
 * WAL pragma and `foreign_keys=ON` are what these tests are checking, and
 * an in-memory handle exercises a different code path in the opener.
 */
export function openTempDb(): { opened: OpenedPurchasesDb; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'purchases-test-'));
  const opened = openPurchasesDb(join(dir, 'purchases.db'));
  return {
    opened,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
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

/** A minimal valid purchase. Override any field per test. */
export function amazonPurchase(overrides: Partial<CreatePurchaseInput> = {}): CreatePurchaseInput {
  return {
    source: 'amazon',
    sourceOrderId: '249-1512883-0105415',
    ingestMethod: 'export',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    checksum: 'amazon:249-1512883-0105415:2026-02-02',
    ...overrides,
  };
}
