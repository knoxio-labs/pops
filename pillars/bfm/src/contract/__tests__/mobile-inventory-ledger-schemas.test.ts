import { describe, expect, it } from 'vitest';

import { MobileInventoryLedgerReportBodySchema } from '../mobile-inventory-ledger-schemas.js';

const report = {
  reportedAt: '2026-09-19T01:00:00.000Z',
  attention: [],
  waiting: [],
  resolved: [],
};

describe('MobileInventoryLedgerReportBodySchema', () => {
  it('accepts a report from a client that has never completed a sync', () => {
    const result = MobileInventoryLedgerReportBodySchema.safeParse(report);

    expect(result.success).toBe(true);
    expect(result.data?.lastSyncAt).toBeUndefined();
  });

  it('accepts an explicitly empty sync timestamp', () => {
    const result = MobileInventoryLedgerReportBodySchema.safeParse({ ...report, lastSyncAt: null });

    expect(result.success).toBe(true);
    expect(result.data?.lastSyncAt).toBeNull();
  });

  it('still rejects a malformed nested report', () => {
    const result = MobileInventoryLedgerReportBodySchema.safeParse({
      ...report,
      attention: [{ id: 'case-1' }],
    });

    expect(result.success).toBe(false);
  });
});
