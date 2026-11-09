import { directoryKinds, type DirectoryContact } from '../contact-directory/model';

/** Explicit editable facts; kind remains a string until validated against the complete source taxonomy. */
export interface ContactDraft {
  name: string;
  kind: string;
  aliases: string[];
  notes: string;
  methods: DirectoryContact['methods'];
  addresses: DirectoryContact['addresses'];
}

/** Local editor state; a null selection creates a distinct identity rather than matching by name. */
export interface ContactEditorState {
  contacts: DirectoryContact[];
  selectedId: string | null;
  draft: ContactDraft;
  error: string | null;
}

/** Fictional creation, editing, duplicate-name and sparse review scenarios. */
export type ContactEditorScenario = 'new' | 'edit' | 'business' | 'duplicate' | 'sparse';

function emptyDraft(): ContactDraft {
  return { name: '', kind: '', aliases: [], notes: '', methods: [], addresses: [] };
}

/** Copies editable source facts so draft edits cannot mutate the directory record or its legacy source. */
export function editableDraft(contact: DirectoryContact): ContactDraft {
  return {
    name: contact.name,
    kind: contact.kind,
    aliases: [...contact.aliases],
    notes: contact.notes,
    methods: contact.methods.map((method) => ({ ...method })),
    addresses: contact.addresses.map((address) => ({ ...address })),
  };
}

/** Requires only an explicit nonblank name and a supported kind; optional facts impose no dependencies. */
export function contactDraftError(draft: ContactDraft): string | null {
  if (!draft.name.trim()) return 'Enter a name.';
  if (!directoryKinds.some(({ kind }) => kind === draft.kind)) return 'Choose a contact kind.';
  return null;
}

function normalisedFacts(draft: ContactDraft) {
  return {
    name: draft.name.trim(),
    aliases: draft.aliases.map((alias) => alias.trim()).filter(Boolean),
    notes: draft.notes.trim(),
    methods: draft.methods
      .map((method) => ({ ...method, label: method.label.trim(), value: method.value.trim() }))
      .filter((method) => method.label || method.value),
    addresses: draft.addresses
      .map((address) => ({
        ...address,
        label: address.label.trim(),
        city: address.city.trim(),
        value: address.value.trim(),
      }))
      .filter((address) => address.label || address.city || address.value),
  };
}

/** Saves explicit facts, preserving source provenance on edit and refusing missing or colliding identifiers. */
export function saveContactDraft(state: ContactEditorState, newId: string): ContactEditorState {
  const existing = state.contacts.find((contact) => contact.id === state.selectedId);
  if (state.selectedId !== null && !existing)
    return { ...state, error: 'The selected contact is unavailable.' };
  const error = contactDraftError(state.draft);
  if (error) return { ...state, error };
  const selectedKind = directoryKinds.find(({ kind }) => kind === state.draft.kind);
  if (!selectedKind) return { ...state, error: 'Choose a contact kind.' };
  const id = existing?.id ?? newId.trim();
  if (!existing && (!id || state.contacts.some((contact) => contact.id === id)))
    return { ...state, error: 'Choose a distinct contact identifier.' };
  const facts = { ...normalisedFacts(state.draft), kind: selectedKind.kind };
  const saved: DirectoryContact = existing
    ? { ...existing, ...facts }
    : { ...facts, id, origin: 'Contacts' };
  return {
    contacts: existing
      ? state.contacts.map((contact) => (contact.id === existing.id ? saved : contact))
      : [...state.contacts, saved],
    selectedId: id,
    draft: editableDraft(saved),
    error: null,
  };
}

/** Discards edits by restoring source facts, or clears an unsaved draft; missing selections stay unresolved. */
export function resetContactDraft(state: ContactEditorState): ContactEditorState {
  if (state.selectedId === null) return { ...state, draft: emptyDraft(), error: null };
  const contact = state.contacts.find((item) => item.id === state.selectedId);
  return contact
    ? { ...state, draft: editableDraft(contact), error: null }
    : { ...state, error: 'The selected contact is unavailable.' };
}
