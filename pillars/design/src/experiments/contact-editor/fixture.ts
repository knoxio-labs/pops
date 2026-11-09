import { initialDirectory } from '../contact-directory/fixture';
import {
  editableDraft,
  resetContactDraft,
  type ContactEditorScenario,
  type ContactEditorState,
} from './model';

/** Builds independent editor snapshots from the fictional directory without modifying source records. */
export function createContactEditorState(
  scenario: ContactEditorScenario = 'new'
): ContactEditorState {
  const directory = initialDirectory(scenario === 'sparse' ? 'sparse' : 'default');
  let selectedId = directory.selectedId;
  if (scenario === 'new' || scenario === 'duplicate') selectedId = null;
  if (scenario === 'business') selectedId = 'contact-pousada';
  const state: ContactEditorState = {
    contacts: directory.contacts,
    selectedId,
    draft: { name: '', kind: '', aliases: [], notes: '', methods: [], addresses: [] },
    error: null,
  };
  if (scenario === 'duplicate') {
    const marina = state.contacts.find((contact) => contact.id === 'contact-marina');
    if (marina) return { ...state, draft: editableDraft(marina) };
  }
  return resetContactDraft(state);
}
