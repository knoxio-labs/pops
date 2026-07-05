import { Info, MapPin } from 'lucide-react';

import { Badge } from '@pops/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pops/ui';

import { extractLocationDetails } from '../../lib/transaction-utils';

import type { ProcessedTransaction } from '@pops/finance';

interface LocationFieldProps {
  transaction: ProcessedTransaction;
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-4 h-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{details.extractedFrom}</p>
              {details.confidence && (
                <p className="text-xs text-muted-foreground mt-1">
                  Confidence: {details.confidence}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
