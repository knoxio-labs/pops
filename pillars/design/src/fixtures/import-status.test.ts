import { batchesByAccountId, configByAccountId, TODAY } from '@/fixtures/import-sources';
import { cadenceOf, feedVerb, importStatusFor } from '@/fixtures/import-status';
import { describe, expect, it } from 'vitest';

import type { ImportBatch } from '@/fixtures/import-sources';

const at = (day: string, n = 0): ImportBatch => ({
  id: `b${n}`,
  accountId: 'x',
  kind: 'csv-dialect',
  format: 'ANZ',
  at: `${day}T10:00:00+10:00`,
  rowCount: 1,
});

/** Newest first, the order the fixture keeps and the derivation expects. */
const batches = (...days: string[]): ImportBatch[] => days.map((d, i) => at(d, i));

describe('cadenceOf', () => {
  it('is undefined under three batches', () => {
    expect(cadenceOf([])).toBeUndefined();
    expect(cadenceOf(batches('2026-09-06'))).toBeUndefined();
    expect(cadenceOf(batches('2026-09-06', '2026-09-01'))).toBeUndefined();
  });

  it('is the middle gap when the gaps are odd in number', () => {
    expect(cadenceOf(batches('2026-09-30', '2026-09-27', '2026-09-20', '2026-09-01'))).toBe(7);
  });

  it('averages the two middle gaps when they are even in number, rounded', () => {
    expect(cadenceOf(batches('2026-09-06', '2026-09-05', '2026-09-04'))).toBe(1);
    expect(cadenceOf(batches('2026-09-06', '2026-09-04', '2026-09-03'))).toBe(2);
  });

  it('measures only the last five batches', () => {
    const recentDaily = ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02'];
    expect(cadenceOf(batches(...recentDaily, '2026-06-01', '2026-03-01'))).toBe(1);
  });

  it('survives a gap of zero days', () => {
    expect(cadenceOf(batches('2026-09-06', '2026-09-06', '2026-09-06'))).toBe(0);
  });
});

describe('importStatusFor', () => {
  it('is never for an account nothing has fed, with the 45-day fallback threshold', () => {
    const status = importStatusFor('a5');
    expect(status.config).toBeUndefined();
    expect(status.kind).toBeUndefined();
    expect(status.lastAt).toBeUndefined();
    expect(status.span).toBeUndefined();
    expect(status.daysQuiet).toBeUndefined();
    expect(status).toMatchObject({ thresholdDays: 45, staleness: 'never' });
  });

  it('takes the kind and format from the config first, then from the newest batch', () => {
    expect(importStatusFor('a13')).toMatchObject({ kind: 'api', format: 'Up' });
    const config = configByAccountId.a2;
    delete configByAccountId.a2;
    try {
      expect(importStatusFor('a2')).toMatchObject({ kind: 'csv-dialect', format: 'Amex' });
    } finally {
      if (config) configByAccountId.a2 = config;
    }
  });

  it('spans from the earliest batch start to the latest batch end, ignoring empty batches', () => {
    expect(importStatusFor('a13').span).toEqual({ from: '2026-09-01', to: '2026-09-06' });
    expect(importStatusFor('a1').span).toEqual({ from: '2025-10-01', to: '2026-08-31' });
  });

  it('counts days quiet from the newest batch to today', () => {
    expect(TODAY).toBe('2026-09-06');
    expect(importStatusFor('a13').daysQuiet).toBe(0);
    expect(importStatusFor('a2').daysQuiet).toBe(35);
  });

  it('uses the measured cadence as the threshold, else the configured one', () => {
    expect(importStatusFor('a13')).toMatchObject({ cadenceDays: 1, thresholdDays: 1 });
    expect(importStatusFor('a1')).toMatchObject({ cadenceDays: undefined, thresholdDays: 30 });
  });

  it('buckets staleness against the configured cadence: fresh within it, due past it, stale past one and a half times it', () => {
    configByAccountId.t1 = {
      accountId: 't1',
      kind: 'csv-dialect',
      format: 'ANZ',
      expectedCadenceDays: 30,
    };
    const withNewest = (day: string): void => {
      batchesByAccountId.t1 = [at(day, 1), at('2026-01-01', 0)];
    };
    try {
      withNewest('2026-08-07');
      expect(importStatusFor('t1')).toMatchObject({ daysQuiet: 30, staleness: 'fresh' });
      withNewest('2026-08-06');
      expect(importStatusFor('t1')).toMatchObject({ daysQuiet: 31, staleness: 'due' });
      withNewest('2026-07-23');
      expect(importStatusFor('t1')).toMatchObject({ daysQuiet: 45, staleness: 'due' });
      withNewest('2026-07-22');
      expect(importStatusFor('t1')).toMatchObject({ daysQuiet: 46, staleness: 'stale' });
    } finally {
      delete configByAccountId.t1;
      delete batchesByAccountId.t1;
    }
  });

  it('reads stale for the fixture PDF account and due for the fixture Amex account', () => {
    expect(importStatusFor('a3').staleness).toBe('stale');
    expect(importStatusFor('a2').staleness).toBe('due');
    expect(importStatusFor('a13').staleness).toBe('fresh');
  });
});

describe('feedVerb', () => {
  it('syncs an api source and imports everything else', () => {
    expect(feedVerb('api')).toBe('sync');
    expect(feedVerb('csv-dialect')).toBe('import');
    expect(feedVerb('pdf-statement')).toBe('import');
    expect(feedVerb(undefined)).toBe('import');
  });
});
