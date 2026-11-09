import { AlertTriangle } from 'lucide-react';

import { Card } from '@pops/ui';

import { arrangementCoverageLabel } from './format';
import { ArrangementKindIcon } from './kind-icon';
import { arrangementCoverage } from './model';

import type { ArrangementState } from './model';

/** Shows source coverage gaps directly without expanding unrelated or repeated booking facts. */
export function ArrangementCoverage({ state }: { state: ArrangementState }) {
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
            <div key={finding.id} className="flex min-h-11 items-center gap-2 px-3 py-3">
              <ArrangementKindIcon kind={finding.kind} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm">{arrangementCoverageLabel(finding)}</span>
                <span className="text-xs text-muted-foreground">{finding.title}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
