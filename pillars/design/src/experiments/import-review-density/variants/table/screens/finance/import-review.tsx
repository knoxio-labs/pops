import { type ImportRow, importRows, STATUS_TONE } from '@/fixtures/import-review';

import {
  Badge,
  Button,
  cn,
  formatCents,
  PageHeader,
  STATUS_BADGE_BASE,
  statusBadgeToneClass,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Import review', order: 1 };

function amount(row: ImportRow): string {
  return formatCents(row.type === 'credit' ? row.amountCents : -row.amountCents, 'AUD');
}

/** Variant "table": every column visible, one line per transaction, built for scanning. */
export function ImportReviewTable({ rows }: { rows: ImportRow[] }) {
  const pending = rows.filter((r) => r.status !== 'matched').length;
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Review import"
        description={`${rows.length} transactions · ${pending} pending`}
        actions={<Button disabled={rows.length === 0}>Commit import</Button>}
      />
      <Table className="mt-4 text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="tabular-nums">{row.date}</TableCell>
              <TableCell className="max-w-64 truncate">{row.description}</TableCell>
              <TableCell className={cn(!row.entity && 'text-muted-foreground')}>
                {row.entity ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.tags.join(', ')}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(STATUS_BADGE_BASE, statusBadgeToneClass[STATUS_TONE[row.status]])}
                >
                  {row.status}
                </Badge>
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  row.type === 'credit' && 'text-success'
                )}
              >
                {amount(row)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export const states: ScreenStates = {
  empty: () => <ImportReviewTable rows={[]} />,
};

export default function ImportReviewTableScreen() {
  return <ImportReviewTable rows={importRows} />;
}
