import { visibleContacts, type DirectoryContact } from '../contact-directory/model';
import { saveContactDraft, type ContactDraft } from '../contact-editor/model';

/** Fictional directory and task snapshots for reviewing contact linking without persistence. */
export type PickerScenario =
  | 'default'
  | 'empty'
  | 'duplicate-names'
  | 'missing-reference'
  | 'business';

/** Local task draft and explicit contact identifiers; linked records remain directory-owned. */
export interface ContactPickerState {
  contacts: DirectoryContact[];
  linkedIds: string[];
  task: { title: string; date: string; notes: string };
}

/** Searches explicit directory facts with the same accent folding and complete taxonomy as the directory. */
export function visiblePickerContacts(
  state: ContactPickerState,
  query: string,
  kind: string
): DirectoryContact[] {
  return visibleContacts({
    contacts: state.contacts,
    query,
    kind,
    city: '',
    origin: '',
    selectedId: null,
  });
}

/** Links an existing identity once without copying facts into the task or matching by name. */
export function linkPickerContact(state: ContactPickerState, id: string): ContactPickerState {
  if (!state.contacts.some((contact) => contact.id === id) || state.linkedIds.includes(id))
    return state;
  return { ...state, linkedIds: [...state.linkedIds, id] };
}

/** Removes only the explicit task link, including unresolved links, while retaining directory records. */
export function unlinkPickerContact(state: ContactPickerState, id: string): ContactPickerState {
  if (!state.linkedIds.includes(id)) return state;
  return { ...state, linkedIds: state.linkedIds.filter((linkedId) => linkedId !== id) };
}

/** Atomically creates a validated distinct directory identity and links it; failure preserves the entire state. */
export function createAndLinkContact(
  state: ContactPickerState,
  draft: ContactDraft,
  newId: string
): { state: ContactPickerState; error: string | null } {
  if (state.linkedIds.includes(newId.trim()))
    return { state, error: 'Choose a distinct contact identifier.' };
  const saved = saveContactDraft(
    { contacts: state.contacts, selectedId: null, draft, error: null },
    newId
  );
  if (saved.error) return { state, error: saved.error };
  if (!saved.selectedId) return { state, error: 'Choose a distinct contact identifier.' };
  const created = { ...state, contacts: saved.contacts };
  return { state: linkPickerContact(created, saved.selectedId), error: null };
}

/** Resolves an exact directory identity without substituting a similarly named contact or exposing its ID. */
export function pickerContactLabel(state: ContactPickerState, id: string): string {
  return state.contacts.find((contact) => contact.id === id)?.name ?? 'Contact unavailable';
}
