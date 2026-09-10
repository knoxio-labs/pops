import { type ImportTxn } from '@/fixtures/import-transactions';
import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

/** What each dropped row is missing, mirroring `DroppedRowsNotice`'s `remedies`. */
function dropReason(txn: ImportTxn): 'entity' | 'type' {
  return txn.amount > 0 ? 'type' : 'entity';
}

function remedies(dropped: ImportTxn[]): string[] {
  const reasons = new Set(dropped.map(dropReason));
  const lines: string[] = [];
  if (reasons.has('entity')) {
    lines.push('assign a merchant entity, or change the type to a non-merchant one');
  }
  if (reasons.has('type')) {
    lines.push(
      'set a transaction type on the money coming in: a credit is never assumed to be an expense'
    );
  }
  return lines;
}

/**
 * Ported from `pillars/finance/app/src/components/imports/review/DroppedRowsNotice.tsx`:
 * a non-blocking warning that some matched rows won't be imported because they
 * are missing an entity or a transaction type on a credit.
 */
export function DroppedRowsNotice({ dropped }: { dropped: ImportTxn[] }) {
  const count = dropped.length;
  if (count <= 0) return null;
  return (
    <Alert className="border-warning/25 bg-warning/10 text-warning">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>
        {count} matched transaction{count !== 1 ? 's' : ''} won&apos;t be imported
      </AlertTitle>
      <AlertDescription>
        <ul className="list-inside list-disc text-xs">
          {remedies(dropped).map((line) => (
            <li key={line}>In the Matched tab, {line}.</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
