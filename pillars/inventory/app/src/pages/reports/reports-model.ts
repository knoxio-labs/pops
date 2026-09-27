import type { QueryKey } from '@tanstack/react-query';

import type { ValueReportBasis, ValueReportBy } from '../../inventory-web/useValueReport.js';

/** The four views available on the inventory reports route. */
export type ReportTab = 'overview' | 'values' | 'warranties' | 'insurance';

/** The URL-backed controls for the reports shell and Values tab. */
export interface ReportsUrlState {
  readonly tab: ReportTab;
  readonly by: ValueReportBy;
  readonly basis: ValueReportBasis;
  readonly group: string | null;
}

/** A partial URL update accepted by {@link writeReportsUrl}. */
export type ReportsUrlPatch = Partial<ReportsUrlState>;

/** The default state whose values are omitted from generated report URLs. */
export const DEFAULT_REPORTS_URL_STATE: ReportsUrlState = {
  tab: 'overview',
  by: 'room',
  basis: 'replacement',
  group: null,
};

/** Labels and stable ids for the reports shell tabs. */
export const REPORT_TABS: readonly { readonly id: ReportTab; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'values', label: 'Values' },
  { id: 'warranties', label: 'Warranties' },
  { id: 'insurance', label: 'Insurance' },
];

/** Query-key prefixes refreshed when another client changes inventory reports. */
export const REPORTS_QUERY_KEYS: readonly QueryKey[] = [
  ['inventory', 'reports'],
  ['inventory', 'web', 'reports'],
];

/** Returns whether a value is one of the report shell tabs. */
export function isReportTab(value: string | null): value is ReportTab {
  return (
    value === 'overview' || value === 'values' || value === 'warranties' || value === 'insurance'
  );
}

/** Returns whether a value is a supported Values grouping. */
export function isValueReportBy(value: string | null): value is ValueReportBy {
  return value === 'room' || value === 'type';
}

/** Returns whether a value is a supported Values basis. */
export function isValueReportBasis(value: string | null): value is ValueReportBasis {
  return value === 'replacement' || value === 'purchase';
}

/** Reads the reports route state, falling back to the documented defaults. */
export function parseReportsUrl(params: URLSearchParams): ReportsUrlState {
  const tab = params.get('tab');
  const by = params.get('by');
  const basis = params.get('basis');
  const group = params.get('group');
  return {
    tab: isReportTab(tab) ? tab : DEFAULT_REPORTS_URL_STATE.tab,
    by: isValueReportBy(by) ? by : DEFAULT_REPORTS_URL_STATE.by,
    basis: isValueReportBasis(basis) ? basis : DEFAULT_REPORTS_URL_STATE.basis,
    group: group === null || group.trim() === '' ? null : group,
  };
}

/**
 * Applies report-owned URL values while preserving unrelated query parameters.
 * Defaults are removed so copied report URLs stay short and canonical.
 */
export function writeReportsUrl(current: URLSearchParams, patch: ReportsUrlPatch): URLSearchParams {
  const next = new URLSearchParams(current);

  if (patch.tab !== undefined) {
    if (patch.tab === DEFAULT_REPORTS_URL_STATE.tab) next.delete('tab');
    else next.set('tab', patch.tab);
  }
  if (patch.by !== undefined) {
    if (patch.by === DEFAULT_REPORTS_URL_STATE.by) next.delete('by');
    else next.set('by', patch.by);
  }
  if (patch.basis !== undefined) {
    if (patch.basis === DEFAULT_REPORTS_URL_STATE.basis) next.delete('basis');
    else next.set('basis', patch.basis);
  }
  if (patch.group !== undefined) {
    if (patch.group === null || patch.group.trim() === '') next.delete('group');
    else next.set('group', patch.group);
  }

  return next;
}

/** Formats a server-provided monetary value using the app's Australian locale. */
export function formatReportDollars(value: number): string {
  return `$${Math.round(value).toLocaleString('en-AU')}`;
}

/** Returns whether the server report has no rows that can be exported or printed. */
export function isValueReportEmpty(report: {
  readonly groups: readonly unknown[];
  readonly totals: { readonly records: number };
}): boolean {
  return report.groups.length === 0 || report.totals.records === 0;
}
