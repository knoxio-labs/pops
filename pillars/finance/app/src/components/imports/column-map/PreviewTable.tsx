import { AlertCircle, CheckCircle } from 'lucide-react';

import { parseAmount, parseDate } from './parsers';

import type { ColumnMap } from './parsers';

interface PreviewTableProps {
  rows: Record<string, string>[];
  columnMap: ColumnMap;
}

function CellWithStatus({
  value,
  parsed,
}: {
  value: string | undefined;
  parsed: string | number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {parsed !== null ? (
        <CheckCircle className="w-4 h-4 text-success" />
      ) : (
        <AlertCircle className="w-4 h-4 text-destructive" />
      )}
      <span className={parsed !== null ? '' : 'text-destructive'}>{value}</span>
      {parsed !== null && <span className="text-xs text-muted-foreground">→ {parsed}</span>}
    </div>
  );
}

export function PreviewTable({ rows, columnMap }: PreviewTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">#</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">Amount</th>
              {columnMap.location && <th className="px-4 py-2 text-left font-medium">Location</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => {
              const dateStr = row[columnMap.date ?? ''];
              const amountStr = row[columnMap.amount ?? ''];
              return (
                <tr key={idx} className="hover:bg-muted">
                  <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <CellWithStatus value={dateStr} parsed={parseDate(dateStr)} />
                  </td>
                  <td className="px-4 py-2">{row[columnMap.description ?? '']}</td>
                  <td className="px-4 py-2">
                    <CellWithStatus value={amountStr} parsed={parseAmount(amountStr)} />
                  </td>
                  {columnMap.location && <td className="px-4 py-2">{row[columnMap.location]}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
