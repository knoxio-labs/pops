import { type ImportRow, importRows, STATUS_TONE } from '@/fixtures/import-review';
import { ImportReviewContext } from '@/kit/import-review-context';
import { choiceOf, type ImportChoice } from '@/screens/finance/import/context';

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

const AMEX = choiceOf('a2', 'amex-csv');
const UP_LIVE = choiceOf('a13', 'up-live');

function amount(row: ImportRow): string {
  return formatCents(row.type === 'credit' ? row.amountCents : -row.amountCents, 'AUD');
}

function Columns() {
  return (
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
  );
}

/** Variant "table": every column visible, one line per transaction, built for scanning. */
export function ImportReviewTable({
  rows,
  choice = AMEX,
  liveArrivals,
}: {
  rows: ImportRow[];
  choice?: ImportChoice;
  liveArrivals?: number;
}) {
  const pending = rows.filter((r) => r.status !== 'matched').length;
  return (
    <div className="mx-auto max-w-5xl p-6">
      <ImportReviewContext choice={choice} liveArrivals={liveArrivals} />
      <PageHeader
        title="Review import"
        description={`${rows.length} transactions · ${pending} pending`}
        actions={<Button disabled={rows.length === 0}>Commit import</Button>}
      />
      <Table className="mt-4 text-xs">
        <Columns />
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="tabular-nums">{row.date}</TableCell>
              <TableCell className="max-w-64 truncate">{row.description}</TableCell>
              <TableCell className={cn(!row.entity && 'text-muted-foreground')}>
                {row.entity ?? 'No entity'}
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
  'live-arrivals-held-back': () => (
    <ImportReviewTable rows={importRows} choice={UP_LIVE} liveArrivals={4} />
  ),
  empty: () => <ImportReviewTable rows={[]} />,
};

export default function ImportReviewTableScreen() {
  return <ImportReviewTable rows={importRows} />;
}
