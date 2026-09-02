import { type ImportRow, importRows, STATUS_TONE } from '@/fixtures/import-review';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  formatCents,
  PageHeader,
  STATUS_BADGE_BASE,
  statusBadgeToneClass,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Import review', order: 1 };

function RowCard({ row }: { row: ImportRow }) {
  const signed = row.type === 'credit' ? row.amountCents : -row.amountCents;
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="truncate text-sm">{row.description}</CardTitle>
        <CardDescription className="tabular-nums">{row.date}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end justify-between px-4">
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className={cn(STATUS_BADGE_BASE, statusBadgeToneClass[STATUS_TONE[row.status]])}
          >
            {row.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{row.entity ?? 'No entity'}</span>
        </div>
        <span
          className={cn(
            'text-lg font-semibold tabular-nums',
            row.type === 'credit' && 'text-success'
          )}
        >
          {formatCents(signed, 'AUD')}
        </span>
      </CardContent>
    </Card>
  );
}

/** Variant "cards": one card per transaction, the amount as the headline figure. */
export function ImportReviewCards({ rows }: { rows: ImportRow[] }) {
  const pending = rows.filter((r) => r.status !== 'matched').length;
  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Review import"
        description={`${rows.length} transactions · ${pending} pending`}
        actions={<Button disabled={rows.length === 0}>Commit import</Button>}
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <RowCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <ImportReviewCards rows={[]} />,
};

export default function ImportReviewCardsScreen() {
  return <ImportReviewCards rows={importRows} />;
}
