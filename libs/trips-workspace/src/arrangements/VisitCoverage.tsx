import { BedDouble } from 'lucide-react';

import { Button } from '@pops/ui';

import { arrangementVisitCoverage } from './coverage';

import type { JSX } from 'react';

import type { Visit } from '../stay/types';
import type { ArrangementSources, ArrangementsWorkspaceProps } from './types';
import type { GapCapture } from './use-gap-capture';

/** Compact route-local findings use complete source facts, never the currently filtered arrangement rows. */
export function VisitCoverage({
  visit,
  sources,
  complete,
  identity,
  capture,
}: {
  visit: Visit;
  sources: ArrangementSources;
  complete: boolean;
  identity: ArrangementsWorkspaceProps;
  capture: GapCapture;
}): JSX.Element {
  const { labels } = identity;
  const coverage = arrangementVisitCoverage(visit, sources, complete);
  return (
    <div className="space-y-2">
      {coverage.unknown && (
        <p role="status" className="text-xs text-muted-foreground">
          {labels.unknownCoverage}
        </p>
      )}
      {coverage.findings.map((finding) => (
        <div
          key={`${finding.kind}:${finding.arrival}:${finding.departure}`}
          className="flex min-w-0 gap-3"
        >
          <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
            <p>{identity.formatDate(finding.arrival)}</p>
            <p>{identity.formatDate(finding.departure)}</p>
          </div>
          <div className="relative min-w-0 flex-1 border-l border-dotted border-border pl-4">
            <BedDouble
              aria-hidden
              className="absolute -left-3 top-3 size-5 bg-background text-muted-foreground"
            />
            {finding.kind === 'missing' ? (
              <Button
                variant="ghost"
                className="h-auto min-h-11 w-full justify-between whitespace-normal border border-dotted border-border text-left text-xs font-normal"
                disabled={capture.busy}
                onClick={() => void capture.create(visit.id, finding)}
              >
                <span className="text-muted-foreground">{labels.accommodationMissing}</span>
                <span className="shrink-0 whitespace-nowrap font-medium">{labels.addStay}</span>
              </Button>
            ) : (
              <p className="py-3 text-xs text-muted-foreground">{labels.accommodationOverlap}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
