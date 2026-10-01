import { ChevronDown } from 'lucide-react';
import { type ReactElement } from 'react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { QualityBand } from '../../food-api-shared-types.js';
import type { InboxListResponses } from '../../food-api/types.gen.js';

type QualitySignal = InboxListResponses[200]['items'][number]['topSignals'][number];

interface Props {
  band: QualityBand;
  topSignals: readonly QualitySignal[];
  bandLabel: string;
}

const BAND_CLASS: Record<QualityBand, string> = {
  clean: 'bg-success/15 text-success',
  minor: 'bg-warning/15 text-warning',
  attention: 'bg-stat-orange/15 text-stat-orange',
  blocked: 'bg-destructive/15 text-destructive',
};

/** Shows a draft's quality band and exposes its top signals through a disclosure. */
export function QualityBandBadge({ band, topSignals, bandLabel }: Props): ReactElement {
  const signalSummary =
    topSignals.length === 0 ? bandLabel : topSignals.map((s) => s.code).join('\n');
  const className = `rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${BAND_CLASS[band]}`;

  if (topSignals.length === 0) {
    return (
      <span
        className={`inline-flex items-center ${className}`}
        title={signalSummary}
        data-testid="quality-band-badge"
        data-band={band}
      >
        {bandLabel}
      </span>
    );
  }

  return (
    <Collapsible className="min-w-0" onClick={(event) => event.stopPropagation()}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={`min-h-11 min-w-11 justify-between gap-1 ${className}`}
          title={signalSummary}
          aria-label={`${bandLabel}: ${signalSummary}`}
          data-testid="quality-band-badge"
          data-band={band}
        >
          {bandLabel}
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {topSignals.map((signal) => (
            <li key={signal.code}>{signal.code}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
