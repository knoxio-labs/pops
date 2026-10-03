import { Info, MapPin } from 'lucide-react';

import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@pops/ui';

import { extractLocationDetails } from '../../lib/transaction-utils';

import type { ProcessedTransaction } from '@pops/finance';

import type { LocationDetails } from '../../lib/transaction-utils';

interface LocationFieldProps {
  transaction: ProcessedTransaction;
}

function LocationDetailsContent({ details }: { details: LocationDetails }) {
  return (
    <>
      <p className="text-xs">{details.extractedFrom}</p>
      {details.confidence && (
        <p className="text-xs text-muted-foreground mt-1">Confidence: {details.confidence}</p>
      )}
    </>
  );
}

/**
 * Display location with source badge and extraction details tooltip
 */
export function LocationField({ transaction }: LocationFieldProps) {
  const details = extractLocationDetails(transaction);

  if (!details.location) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="w-4 h-4" />
        <span>No location data</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm">{details.location}</span>

      {details.source && (
        <Badge variant={details.source === 'csv' ? 'default' : 'secondary'} className="text-xs">
          {details.source === 'csv' ? 'From CSV' : 'Matched'}
        </Badge>
      )}

      {details.extractedFrom && (
        <Popover>
          <TooltipProvider>
            <Tooltip>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Location details: ${details.extractedFrom}${details.confidence ? `. Confidence: ${details.confidence}` : ''}`}
                    className="relative inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-3.5 before:content-['']"
                  >
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
              </PopoverTrigger>
              <TooltipContent>
                <LocationDetailsContent details={details} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent className="w-72 p-3" align="start">
            <LocationDetailsContent details={details} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
