import { ArrowUpRight } from 'lucide-react';

import { Button } from '@pops/ui';

import type { CraftSpendingRecord } from '@/fixtures/trip-timeline-craft-types';

/** Renders Finance-owned records without changing their source or membership. */
export function SpendingRecordRows({
  records,
  onOpen,
  onLink,
}: {
  records: readonly CraftSpendingRecord[];
  onOpen: (recordId: string) => void;
  onLink?: (recordId: string) => void;
}) {
  return (
    <ul className="divide-y border-y">
      {records.map((record) => (
        <li
          key={record.id}
          className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">{record.merchant}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {record.date} · {record.account} · {record.type}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <p className="break-words text-right font-medium tabular-nums">
              {record.amount} {record.unit}
            </p>
            {onLink ? (
              <Button variant="outline" onClick={() => onLink(record.id)}>
                Link this transaction
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => onOpen(record.id)}
                suffix={<ArrowUpRight className="size-4" aria-hidden />}
              >
                Open in Finance
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
