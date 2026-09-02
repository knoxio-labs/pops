import { type ImportRow, importRows, STATUS_TONE } from '@/fixtures/import-review';
import { Inbox } from 'lucide-react';

import {
  Badge,
  Button,
  cn,
  EmptyState,
  formatCents,
  PageHeader,
  STATUS_BADGE_BASE,
  statusBadgeToneClass,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Import review', order: 1 };

function Row({ row }: { row: ImportRow }) {
  const signed = row.type === 'credit' ? row.amountCents : -row.amountCents;
  return (
    <li className="flex items-center gap-4 border-b border-border py-3 last:border-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{row.date}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{row.description}</span>
        <span className="block text-xs text-muted-foreground">
          {row.entity ?? 'No entity'}
          {row.tags.length > 0 ? ` · ${row.tags.join(', ')}` : ''}
        </span>
      </span>
      <Badge
        variant="outline"
        className={cn(STATUS_BADGE_BASE, statusBadgeToneClass[STATUS_TONE[row.status]])}
      >
        {row.status}
      </Badge>
      <span
        className={cn(
          'w-24 shrink-0 text-right text-sm font-medium tabular-nums',
          row.type === 'credit' && 'text-success'
        )}
      >
        {formatCents(signed, 'AUD')}
      </span>
    </li>
  );
}

/** The review step of the import wizard as a row list — the current shape. */
export function ImportReview({ rows }: { rows: ImportRow[] }) {
  const pending = rows.filter((r) => r.status !== 'matched').length;
  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Review import"
        description={`${rows.length} transactions parsed · ${pending} need a decision`}
        actions={<Button disabled={rows.length === 0}>Commit import</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing to review"
          description="Upload a CSV export from your bank to begin."
        />
      ) : (
        <ul className="mt-4">
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <ImportReview rows={[]} />,
  'all-matched': () => (
    <ImportReview rows={importRows.map((row) => ({ ...row, status: 'matched' }))} />
  ),
};

export default function ImportReviewScreen() {
  return <ImportReview rows={importRows} />;
}
