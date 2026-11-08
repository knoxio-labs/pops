import { AlertTriangle, BedDouble, FileWarning, Plane } from 'lucide-react';

import { cn } from '@pops/ui';

import { alternativeFindings } from './impact';

import type { AlternativesState } from './model';

const findingIcons = {
  transport: Plane,
  accommodation: BedDouble,
  purchase: FileWarning,
  conflict: AlertTriangle,
  reference: AlertTriangle,
};

/** Findings are recalculated from the preview; source bookings are never changed by comparison. */
export function AlternativeFindings({
  state,
  sectionId,
}: {
  state: AlternativesState;
  sectionId: string;
}) {
  const findings = alternativeFindings(state, sectionId);
  return (
    <section aria-label="Affected arrangements" className="space-y-2">
      <h3 className="text-sm font-semibold">Arrangements</h3>
      <ul className="space-y-2">
        {findings.map((finding) => {
          const problem = ['conflict', 'purchase', 'reference'].includes(finding.kind);
          const Icon = findingIcons[finding.kind];
          return (
            <li
              key={finding.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-dashed border-foreground/30 bg-background/40 px-3 py-2 text-sm',
                problem && 'border-solid border-destructive/70 bg-destructive/10'
              )}
            >
              <Icon
                className={cn('size-4 shrink-0 text-app-accent', problem && 'text-destructive')}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{finding.title}</p>
                <p className="text-xs text-foreground/80">
                  {finding.kind === 'accommodation'
                    ? ['Accommodation', finding.detail].filter(Boolean).join(' · ')
                    : finding.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
