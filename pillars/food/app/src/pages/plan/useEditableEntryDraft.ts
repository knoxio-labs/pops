/**
 * Local draft state (servings + notes) for `PlanEntryEditSheet`'s editable
 * body. Re-seeds from `entry` whenever the sheet switches to a different
 * entry, or the underlying entry data changes (e.g. after a refetch).
 *
 * Split out from `PlanEntryEditSheet.tsx` to keep that file under the
 * `max-lines` budget.
 */
import { useState } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

export interface EditableEntryDraft {
  servings: number | '';
  setServings: (n: number | '') => void;
  notes: string;
  setNotes: (s: string) => void;
}

export function useEditableEntryDraft(entry: WirePlanEntryRow): EditableEntryDraft {
  const [servings, setServings] = useState<number | ''>(entry.plannedServings);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [prevEntryId, setPrevEntryId] = useState(entry.id);
  const [prevPlannedServings, setPrevPlannedServings] = useState(entry.plannedServings);
  const [prevNotes, setPrevNotes] = useState(entry.notes);

  if (
    entry.id !== prevEntryId ||
    entry.plannedServings !== prevPlannedServings ||
    entry.notes !== prevNotes
  ) {
    setPrevEntryId(entry.id);
    setPrevPlannedServings(entry.plannedServings);
    setPrevNotes(entry.notes);
    setServings(entry.plannedServings);
    setNotes(entry.notes ?? '');
  }

  return { servings, setServings, notes, setNotes };
}
