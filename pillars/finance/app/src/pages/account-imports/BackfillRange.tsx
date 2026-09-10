import { useState } from 'react';

import { todayISODate } from '@pops/date';
import { Button, DateRangeField, type DateRangeValue } from '@pops/ui';

import { useSyncNow } from '../../components/imports/live/useSyncNow';

import type { ImportConfigWire } from './types';

/**
 * TEMPORARY (POPS-3352, removed by POPS-3353).
 *
 * `Sync now` asks Up for a derived range that reaches back ninety days at
 * most, which is right for the steady state and cannot import a history. Up
 * Spending opened in 2019 and every row staged waits in a pending draft for
 * review, so the history has to arrive in pieces small enough to review — a
 * month at a time — rather than as one draft of a thousand rows.
 *
 * This is scaffolding for that walk and comes out when it is done.
 */

function shiftMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const stamp = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(stamp.getUTCFullYear(), stamp.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const safeDay = Math.min(day ?? 1, lastDay);
  return `${stamp.getUTCFullYear()}-${String(stamp.getUTCMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/** The calendar month `date` falls in, as an inclusive range. */
export function monthOf(date: string): DateRangeValue {
  const [year, month] = date.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
  return { start, end: `${start.slice(0, 8)}${String(lastDay).padStart(2, '0')}` };
}

/** The same range shifted a whole month earlier, for walking a backfill backwards. */
export function previousMonth(range: DateRangeValue): DateRangeValue {
  return monthOf(shiftMonths(range.start, -1));
}

/** What a finished backfill pass did, in rows rather than jargon. */
export function backfillOutcomeLine(
  staged: number,
  alreadyStaged: number,
  alreadyInLedger: number
): string {
  if (staged === 0 && alreadyStaged === 0 && alreadyInLedger === 0) {
    return 'Up had nothing in that range.';
  }
  const parts = [`${staged} staged`];
  if (alreadyStaged > 0) parts.push(`${alreadyStaged} already waiting`);
  if (alreadyInLedger > 0) parts.push(`${alreadyInLedger} already in the ledger`);
  return `${parts.join(', ')}.`;
}

/** True when the range cannot be sent: either end missing, or reversed. */
export function rangeIsUnusable(range: DateRangeValue): boolean {
  return range.start === '' || range.end === '' || range.start > range.end;
}

const PRESETS = [
  { label: 'This month', range: () => monthOf(todayISODate()) },
  { label: 'Previous month', range: () => previousMonth(monthOf(todayISODate())) },
];

function BackfillFooter({
  invalid,
  error,
  result,
}: {
  invalid: boolean;
  error: Error | null;
  result: { staged: number; alreadyStaged: number; alreadyInLedger: number } | null | undefined;
}) {
  if (invalid) {
    return (
      <p className="mt-2 text-xs text-destructive">
        Pick a start and an end, with the start first.
      </p>
    );
  }
  if (error) return <p className="mt-2 text-xs text-destructive">{error.message}</p>;
  if (result === undefined || result === null) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {backfillOutcomeLine(result.staged, result.alreadyStaged, result.alreadyInLedger)}
    </p>
  );
}

export function BackfillRange({
  accountId,
  config,
}: {
  accountId: string;
  config: ImportConfigWire | null;
}) {
  const sync = useSyncNow(accountId);
  const [range, setRange] = useState<DateRangeValue>(() => monthOf(todayISODate()));

  if (config?.sourceKind !== 'api' || config.provider !== 'up') return null;

  const invalid = rangeIsUnusable(range);

  return (
    <section className="rounded-md border border-dashed p-4">
      <header className="mb-2">
        <h3 className="text-sm font-medium">Backfill a date range</h3>
        <p className="text-xs text-muted-foreground">
          Temporary, for importing the history a month at a time. Rows stage into the pending draft
          like any other sync; re-running a month you already did stages nothing.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <DateRangeField
          value={range}
          onChange={setRange}
          presets={PRESETS}
          startLabel="From"
          endLabel="To"
          disabled={sync.isSyncing}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRange(previousMonth(range))}
          disabled={sync.isSyncing}
        >
          ← A month earlier
        </Button>
        <Button
          size="sm"
          onClick={() => sync.syncRange({ from: range.start, to: range.end })}
          disabled={sync.isSyncing || invalid}
        >
          {sync.isSyncing ? 'Backfilling…' : 'Backfill'}
        </Button>
      </div>
      <BackfillFooter invalid={invalid} error={sync.error} result={sync.lastJob?.result} />
    </section>
  );
}
