import { EmptyStateTab } from '@pops/ui';

import type { ImportTxn } from '@/fixtures/import-transactions';

/** Ported from `pillars/finance/app/src/components/imports/review/SkippedTab.tsx`. */
export function SkippedTxnTable({ txns }: { txns: ImportTxn[] }) {
  if (txns.length === 0) return <EmptyStateTab message="No skipped transactions" />;
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">Amount</th>
              <th className="px-4 py-2 text-left font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {txns.map((txn) => (
              <tr key={txn.checksum} className="hover:bg-muted">
                <td className="px-4 py-2">{txn.date}</td>
                <td className="px-4 py-2">{txn.description}</td>
                <td className="px-4 py-2">${Math.abs(txn.amount).toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-muted-foreground">{txn.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
