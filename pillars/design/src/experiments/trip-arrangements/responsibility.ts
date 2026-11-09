import { arrangementRows } from './projection';

import type { ArrangementState } from './types';

/** Explicitly chooses a known contact for an existing arrangement without changing booking or source facts. */
export function setArrangementResponsibility(
  state: ArrangementState,
  recordId: string,
  contactId: string
): { state: ArrangementState; error: string | null } {
  if (!arrangementRows(state).some((row) => row.id === recordId))
    return { state, error: 'This arrangement is unavailable.' };
  if (!state.contacts.some((contact) => contact.id === contactId))
    return { state, error: 'Choose an available contact.' };
  const existing = state.responsibilities.find((entry) => entry.recordId === recordId);
  if (existing?.contactId === contactId) return { state, error: null };
  const responsibilities = existing
    ? state.responsibilities.map((entry) =>
        entry.recordId === recordId ? { ...entry, contactId } : entry
      )
    : [...state.responsibilities, { recordId, contactId }];
  return { state: { ...state, responsibilities }, error: null };
}

/** Clears only the selected optional association, including broken references; source contacts remain intact. */
export function clearArrangementResponsibility(
  state: ArrangementState,
  recordId: string
): ArrangementState {
  return state.responsibilities.some((entry) => entry.recordId === recordId)
    ? {
        ...state,
        responsibilities: state.responsibilities.filter((entry) => entry.recordId !== recordId),
      }
    : state;
}
