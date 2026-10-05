import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pops/ui';

import type { SourceMarkerText } from './sourceMeta';

/** Shows tag provenance details when the marker receives focus or pointer hover. */
export function ProvenanceBadge({ icon, visibleText, accessibleText }: SourceMarkerText) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={visibleText}
            className="inline-flex min-h-11 min-w-11 appearance-none items-center justify-center gap-0.5 border-0 bg-transparent p-0 font-sans text-2xs uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">{icon}</span>
            {visibleText}
          </button>
        </TooltipTrigger>
        <TooltipContent>{accessibleText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
