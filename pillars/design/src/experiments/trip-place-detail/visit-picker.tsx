import { X } from 'lucide-react';

import { Button, ComboboxSelect } from '@pops/ui';

import { useIdea } from './context';
import { visitLabel } from './display';

/** Placement is optional and independent of city and timing; mismatches remain visible for review. */
export function IdeaVisitPicker() {
  const { state, change } = useIdea();
  return (
    <div className="flex flex-wrap items-center gap-2">
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
        </Button>
      )}
    </div>
  );
}
