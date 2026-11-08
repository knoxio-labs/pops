import { Route, X } from 'lucide-react';

import { Button, ComboboxSelect, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { useIdea } from './context';
import { visitLabel } from './display';

/** Placement is optional and independent of city and timing; mismatches remain visible for review. */
export function IdeaVisitPicker() {
  const { state, change } = useIdea();
  return (
    <section>
      <h2 className="text-xs font-medium text-muted-foreground">Route placement</h2>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" aria-label="Change route placement">
            <Route className="size-4 text-app-accent" aria-hidden />
            {state.visitId ? visitLabel(state, state.visitId) : 'Add to visit'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-2">
          <ComboboxSelect
            aria-label="Visit"
            value={state.visits.some((visit) => visit.id === state.visitId) ? state.visitId : ''}
            options={state.visits.map((visit) => ({
              value: visit.id,
              label: visitLabel(state, visit.id),
            }))}
            placeholder="Choose visit"
            searchPlaceholder="Find a visit…"
            variant="ghost"
            onChange={(value) => {
              if (typeof value === 'string' && value !== state.visitId)
                change({ ...state, visitId: value });
            }}
          />
          {state.visitId && (
            <Button
              variant="ghost"
              aria-label="Unlink visit"
              onClick={() => change({ ...state, visitId: '' })}
            >
              <X className="size-4" aria-hidden />
              Remove from visit
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </section>
  );
}
