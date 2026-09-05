/**
 * What every account surface says about its imports, derived from the
 * batches rather than stored (POPS-2917's `importStatus`): when it was last
 * fed, what its rows span, how often it is usually fed, and whether it is
 * overdue. The threshold is the account's own rhythm — the median gap
 * between its last five batches, or the cadence it was configured with, or
 * 45 days when it has neither — so a daily Up sync two days quiet reads as
 * stale and a monthly card export three weeks quiet does not.
 */
import { batchesFor, configByAccountId, TODAY } from './import-sources';

import type { ImportBatch, ImportConfig, ImportSourceKind } from './import-sources';

export type Staleness = 'never' | 'fresh' | 'due' | 'stale';

export interface ImportStatus {
  config?: ImportConfig;
  /** The kind the account is fed by: its config, else its newest batch. */
  kind?: ImportSourceKind;
  format?: string;
  lastAt?: string;
  newestTransactionDate?: string;
  span?: { from: string; to: string };
  cadenceDays?: number;
  daysQuiet?: number;
  thresholdDays: number;
  staleness: Staleness;
}

const MS_PER_DAY = 86_400_000;
const FALLBACK_THRESHOLD_DAYS = 45;
const STALE_FACTOR = 1.5;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);

/** Median gap in days between the last five batches; undefined under three. */
export function cadenceOf(batches: ImportBatch[]): number | undefined {
  const recent = batches.slice(0, 5);
  if (recent.length < 3) return undefined;
  const gaps = recent
    .slice(1)
    .map((older, i) => daysBetween(older.at, recent[i]?.at ?? older.at))
    .toSorted((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2 : (gaps[mid] ?? 0);
  return Math.round(median);
}

function spanOf(batches: ImportBatch[]): { from: string; to: string } | undefined {
  const dated = batches.filter((b) => b.from !== undefined && b.to !== undefined);
  if (dated.length === 0) return undefined;
  const froms = dated.map((b) => b.from ?? '').toSorted();
  const tos = dated.map((b) => b.to ?? '').toSorted();
  return { from: froms[0] ?? '', to: tos.at(-1) ?? '' };
}

function sourceOf(
  config: ImportConfig | undefined,
  newest: ImportBatch | undefined
): Pick<ImportStatus, 'kind' | 'format'> {
  const source = config ?? newest;
  return source ? { kind: source.kind, format: source.format } : {};
}

function stalenessOf(daysQuiet: number | undefined, threshold: number): Staleness {
  if (daysQuiet === undefined) return 'never';
  if (daysQuiet > threshold * STALE_FACTOR) return 'stale';
  if (daysQuiet > threshold) return 'due';
  return 'fresh';
}

export function importStatusFor(accountId: string): ImportStatus {
  const config = configByAccountId[accountId];
  const batches = batchesFor(accountId);
  const newest = batches[0];
  const span = spanOf(batches);
  const cadenceDays = cadenceOf(batches);
  const daysQuiet = newest ? daysBetween(newest.at.slice(0, 10), TODAY) : undefined;
  const thresholdDays = cadenceDays ?? config?.expectedCadenceDays ?? FALLBACK_THRESHOLD_DAYS;
  return {
    config,
    ...sourceOf(config, newest),
    lastAt: newest?.at,
    newestTransactionDate: span?.to,
    span,
    cadenceDays,
    daysQuiet,
    thresholdDays,
    staleness: stalenessOf(daysQuiet, thresholdDays),
  };
}

/** Wording follows the source: a synced account syncs, a file-fed one imports. */
export function feedVerb(kind: ImportSourceKind | undefined): 'sync' | 'import' {
  return kind === 'api' ? 'sync' : 'import';
}
