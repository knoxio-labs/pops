import { EmptyStateTab } from '@pops/ui';

import type { ProcessedTransaction } from '../../../store/importStore';

interface SkippedTabProps {
  transactions: ProcessedTransaction[];
}

/**
 * Skipped tab - read-only list
 */
export function SkippedTab({ transactions }: SkippedTabProps) {
  if (transactions.length === 0) {
    return <EmptyStateTab message="No skipped transactions" />;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
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
            {transactions.map((t, idx) => (
              <tr key={idx} className="hover:bg-muted">
                <td className="px-4 py-2">{t.date}</td>
                <td className="px-4 py-2">{t.description}</td>
                <td className="px-4 py-2">${Math.abs(t.amount).toFixed(2)}</td>
                <td className="px-4 py-2 text-sm text-muted-foreground">{t.skipReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
