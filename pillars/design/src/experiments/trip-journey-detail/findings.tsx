import { AlertTriangle, Route } from 'lucide-react';

import { cn } from '@pops/ui';

import { useJourney } from './context';
import { journeyFindings } from './model';

/** Show only source-backed timing conflicts and actionable missing arrangements. */
export function JourneyFindings() {
  const { state } = useJourney();
  const findings = journeyFindings(state);
  if (!findings.length) return null;
  return (
    <section aria-label="Journey issues" className="space-y-2">
      {findings.map((finding) => {
        const Icon = finding.kind === 'conflict' ? AlertTriangle : Route;
        return (
          <p
            key={finding.id}
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-lg border border-dashed border-foreground/30 bg-muted/60 px-3 py-2 text-sm',
              finding.kind === 'conflict' && 'border-solid border-destructive bg-destructive/10'
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-app-accent" aria-hidden />
            {finding.title}
          </p>
        );
      })}
    </section>
  );
}
