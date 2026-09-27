import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REPORTS_URL_STATE,
  formatReportDollars,
  isValueReportEmpty,
  parseReportsUrl,
  writeReportsUrl,
} from './reports-model.js';

describe('reports URL model', () => {
  it('uses defaults for missing and unsupported values', () => {
    expect(
      parseReportsUrl(new URLSearchParams('tab=unknown&by=column&basis=market&group='))
    ).toEqual(DEFAULT_REPORTS_URL_STATE);
  });

  it('parses supported values and keeps a non-empty group key', () => {
    expect(
      parseReportsUrl(new URLSearchParams('tab=values&by=type&basis=purchase&group=electronics'))
    ).toEqual({ tab: 'values', by: 'type', basis: 'purchase', group: 'electronics' });
  });

  it('removes defaults while preserving parameters owned by another surface', () => {
    const current = new URLSearchParams('tab=values&by=type&basis=purchase&group=kitchen&keep=1');

    const next = writeReportsUrl(current, {
      tab: 'overview',
      by: 'room',
      basis: 'replacement',
      group: null,
    });

    expect(next.toString()).toBe('keep=1');
    expect(current.toString()).toBe('tab=values&by=type&basis=purchase&group=kitchen&keep=1');
  });

  it('updates only the requested report value', () => {
    const next = writeReportsUrl(new URLSearchParams('tab=values&basis=purchase&keep=1'), {
      by: 'type',
    });

    expect(next.toString()).toBe('tab=values&basis=purchase&keep=1&by=type');
  });
});

describe('reports value helpers', () => {
  it('formats whole-dollar values in the app locale', () => {
    expect(formatReportDollars(1234567.8)).toBe('$1,234,568');
  });

  it('treats missing groups or zero records as empty', () => {
    expect(isValueReportEmpty({ groups: [], totals: { records: 4 } })).toBe(true);
    expect(isValueReportEmpty({ groups: [{}], totals: { records: 0 } })).toBe(true);
    expect(isValueReportEmpty({ groups: [{}], totals: { records: 1 } })).toBe(false);
  });
});
