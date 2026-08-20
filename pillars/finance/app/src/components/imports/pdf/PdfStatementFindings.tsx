/**
 * What reading a PDF statement found, shown before anything is imported.
 *
 * The wizard's other path can skip a step like this because a CSV column either
 * maps or does not. A PDF has no columns to map: the rows are recovered by
 * matching a printed layout, so "how much of the file was understood" is a
 * question with a real answer that only this screen can ask. Every finding here
 * is a way the import could be quietly wrong, stated before it happens.
 */
import { AlertTriangle, FileWarning, Info } from 'lucide-react';

import type { AnzPdfStatementImport } from './anz-pdf-import';

function Finding({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warning' | 'info';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const palette =
    tone === 'warning' ? 'border-warning/30 bg-warning/5 text-warning' : 'border-info/20 bg-info/5 text-info';
  return (
    <div className={`rounded-lg border p-4 ${palette}`}>
      <h4 className="flex items-center gap-2 text-sm font-medium mb-1">
        {icon}
        {title}
      </h4>
      <div className="text-xs space-y-2">{children}</div>
    </div>
  );
}

function LineList({ lines, label }: { lines: readonly string[]; label: string }) {
  return (
    <ul aria-label={label} className="max-h-48 overflow-y-auto font-mono whitespace-pre">
      {lines.map((line) => (
        <li key={line} className="truncate">
          {line}
        </li>
      ))}
    </ul>
  );
}

export interface PdfStatementFindingsProps {
  statement: AnzPdfStatementImport;
  fileCount: number;
}

export function PdfStatementFindings({ statement, fileCount }: PdfStatementFindingsProps) {
  const { plan, unrecognisedRows, coverageChecked, pageCount } = statement;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Read {plan.importable.length} transaction{plan.importable.length === 1 ? '' : 's'} from{' '}
        {pageCount} page{pageCount === 1 ? '' : 's'} across {fileCount} file
        {fileCount === 1 ? '' : 's'}.
      </p>

      {unrecognisedRows.length > 0 && (
        <Finding
          tone="warning"
          icon={<AlertTriangle className="w-4 h-4" />}
          title={`${unrecognisedRows.length} line${unrecognisedRows.length === 1 ? '' : 's'} on the statement could not be read`}
        >
          <p>
            These start like a transaction row and do not match the layout this importer knows, so
            they will not be imported. A statement whose layout has changed looks exactly like
            this — check them against the PDF before continuing.
          </p>
          <LineList lines={unrecognisedRows} label="Unreadable statement lines" />
        </Finding>
      )}

      {plan.withheld.length > 0 && (
        <Finding
          tone="info"
          icon={<FileWarning className="w-4 h-4" />}
          title={`${plan.withheld.length} transaction${plan.withheld.length === 1 ? '' : 's'} withheld as already imported`}
        >
          <p>
            These fall inside the dates this account already holds transactions for, so importing
            them would duplicate charges that came in from the CSV export.
          </p>
          <LineList
            lines={plan.withheld.map(
              ({ transaction }) =>
                `${transaction.date}  ${transaction.amount.toFixed(2)}  ${transaction.description}`
            )}
            label="Withheld transactions"
          />
        </Finding>
      )}

      {!coverageChecked && (
        <Finding
          tone="info"
          icon={<Info className="w-4 h-4" />}
          title="Overlap with existing transactions was not checked"
        >
          <p>
            Nothing here knows which dates this account already holds, so no row was withheld as a
            duplicate. If this statement overlaps a period already imported from a CSV export, those
            charges will import a second time.
          </p>
        </Finding>
      )}
    </div>
  );
}
