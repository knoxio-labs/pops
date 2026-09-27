import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';

type ValueGroup = WebReportsValuesResponse['groups'][number];

/** Builds a complete Values report fixture with explicit server totals. */
export function valuesReport(
  overrides: Partial<WebReportsValuesResponse> = {}
): WebReportsValuesResponse {
  return {
    groups: [],
    totals: {
      purchase: 0,
      records: 0,
      replacement: 0,
      units: 0,
      unvalued: 0,
      withoutPhoto: 0,
    },
    ...overrides,
  };
}

/** Builds a complete Values group fixture without changing server ordering. */
export function valuesGroup(overrides: Partial<ValueGroup> = {}): ValueGroup {
  return {
    entries: [],
    key: 'room-kitchen',
    label: 'Kitchen',
    records: 0,
    share: 0,
    unvalued: 0,
    value: 0,
    ...overrides,
  };
}
