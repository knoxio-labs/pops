import { AlertTriangle, ChevronRight } from 'lucide-react';

import { Card } from '@pops/ui';

import { arrangementCoverageLabel } from './format';
import { ArrangementKindIcon } from './kind-icon';
import { arrangementCoverage } from './model';
import { ArrangementSource } from './source';

import type {
  ArrangementCoverage as CoverageFinding,
  ArrangementRow,
  ArrangementState,
} from './model';

/** Shows exact source gap endpoints and dates before disclosing related arrangement sources. */
export function ArrangementCoverage({
  state,
  rows,
}: {
  state: ArrangementState;
  rows: ArrangementRow[];
}) {
  const findings = arrangementCoverage(state);
  if (!findings.length) return null;
  return (
    <section aria-label="Coverage issues" className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-medium">
        <AlertTriangle className="size-4 text-destructive" aria-hidden />
        Coverage issues<span className="text-xs text-muted-foreground">{findings.length}</span>
      </h2>
      <Card className="gap-0 overflow-hidden border-dashed border-border bg-muted/20 py-0 shadow-none">
        <div className="divide-y divide-dashed divide-border">
          {findings.map((finding) => (
            <CoverageIssue key={finding.id} finding={finding} rows={rows} />
          ))}
        </div>
      </Card>
    </section>
  );
}

function CoverageIssue({ finding, rows }: { finding: CoverageFinding; rows: ArrangementRow[] }) {
  const related = rows.filter(
    (row) => finding.recordIds.includes(row.visitId) && row.kind === finding.kind
  );
  if (!related.length)
    return (
      <div className="flex min-h-11 items-center px-3 py-3">
        <CoverageLabel finding={finding} />
      </div>
    );
  return (
    <details className="group px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <CoverageLabel finding={finding} expandable />
      </summary>
      <div className="flex flex-wrap gap-2 pb-3">
        {related.map((row) => (
          <ArrangementSource key={row.id} row={row} />
        ))}
      </div>
    </details>
  );
}

function CoverageLabel({
  finding,
  expandable = false,
}: {
  finding: CoverageFinding;
  expandable?: boolean;
}) {
  return (
    <span className="flex w-full items-center gap-2">
      {expandable ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <ArrangementKindIcon kind={finding.kind} />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm">{arrangementCoverageLabel(finding)}</span>
        <span className="text-xs text-muted-foreground">{finding.title}</span>
      </span>
    </span>
  );
}
