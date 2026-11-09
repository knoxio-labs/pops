import { Check } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import type { ArrangementRow } from './model';

/** Keeps source intent, booking state and purchase evidence separate without inventing a task state. */
export function ArrangementStateLabels({ row }: { row: ArrangementRow }) {
  const state = row.status === 'Not needed' ? 'No booking needed' : row.status;
  const needsArrangement = row.status === 'Not arranged' && row.intention === 'In plan';
  const settled = row.status === 'Booked' || row.status === 'Agreed' || row.status === 'Reserved';
  return (
    <span className="flex flex-wrap items-center gap-2">
      {row.intention && (
        <span
          className={cn(
            'text-xs',
            row.intention === 'In plan' ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {row.intention}
        </span>
      )}
      {state &&
        row.status !== 'Purchased' &&
        (settled ? (
          <Badge variant="secondary" className="font-normal">
            {state}
          </Badge>
        ) : (
          <span
            className={cn(
              'text-xs',
              needsArrangement ? 'font-medium text-destructive' : 'text-muted-foreground'
            )}
          >
            {state}
          </span>
        ))}
      {row.purchased && (
        <Badge variant="secondary" className="gap-1 bg-app-accent/15 text-app-accent">
          <Check className="size-3" aria-hidden />
          Purchased
        </Badge>
      )}
    </span>
  );
}
