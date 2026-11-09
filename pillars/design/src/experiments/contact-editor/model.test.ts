import { describe, expect, it } from 'vitest';

import { createContactEditorState } from './fixture';
import { contactDraftError, editableDraft, resetContactDraft, saveContactDraft } from './model';

describe('contact draft saves', () => {
  it('creates a minimal contact only from an explicit name and kind', () => {
    const state = createContactEditorState();
    state.draft = { ...state.draft, name: '  João do Carmo  ', kind: 'person' };
    const saved = saveContactDraft(state, 'new-contact');
    expect(saved.contacts.at(-1)).toEqual({
      id: 'new-contact',
      name: 'João do Carmo',
      kind: 'person',
      origin: 'Contacts',
      aliases: [],
      notes: '',
      methods: [],
      addresses: [],
    });
    expect(saved.selectedId).toBe('new-contact');
    expect(saved.error).toBeNull();
    expect(state.contacts.some((contact) => contact.id === 'new-contact')).toBe(false);
  });

  it.each([
    ['', 'person', 'Enter a name.'],
    [' \n ', 'company', 'Enter a name.'],
    ['Name', '', 'Choose a contact kind.'],
    ['Name', 'made-up', 'Choose a contact kind.'],
    ['Name', 'Person', 'Choose a contact kind.'],
  ])('rejects invalid identity %j %j', (name, kind, message) => {
    const state = createContactEditorState();
    state.draft = { ...state.draft, name, kind };
    expect(contactDraftError(state.draft)).toBe(message);
    const saved = saveContactDraft(state, 'new');
    expect(saved.error).toBe(message);
    expect(saved.contacts).toBe(state.contacts);
    expect(saved.draft).toBe(state.draft);
  });

  it('trims optional facts, removes blank rows and retains partially entered facts without inference', () => {
    const state = createContactEditorState();
    state.draft = {
      name: ' Name ',
      kind: 'government',
      aliases: [' ', ' Alias '],
      notes: '  Note \n',
      methods: [
        { id: 'blank', label: ' ', value: '' },
        { id: 'label', label: '  XMPP / other  ', value: '' },
        { id: 'value', label: '', value: '  @carmo:example.test ' },
      ],
      addresses: [
        { id: 'blank', label: '', city: ' ', value: '' },
        { id: 'city', label: '', city: ' 東京 ', value: '' },
        { id: 'address', label: '', city: '', value: ' Rua São João, s/n ' },
        { id: 'label', label: ' Future office ', city: '', value: '' },
      ],
    };
    const saved = saveContactDraft(state, 'new');
    expect(saved.draft).toEqual({
      name: 'Name',
      kind: 'government',
      aliases: ['Alias'],
      notes: 'Note',
      methods: [
        { id: 'label', label: 'XMPP / other', value: '' },
        { id: 'value', label: '', value: '@carmo:example.test' },
      ],
      addresses: [
        { id: 'city', label: '', city: '東京', value: '' },
        { id: 'address', label: '', city: '', value: 'Rua São João, s/n' },
        { id: 'label', label: 'Future office', city: '', value: '' },
      ],
    });
    expect(state.draft.methods).toHaveLength(3);
  });

  it('keeps duplicate names separate and rejects absent or colliding new identifiers', () => {
    const state = createContactEditorState('duplicate');
    const saved = saveContactDraft(state, 'other-marina');
    expect(
      saved.contacts
        .filter((contact) => contact.name === 'Marina Duarte')
        .map((contact) => contact.id)
    ).toEqual(['contact-marina', 'other-marina']);
    for (const id of ['', ' ', 'contact-marina', ' contact-marina ']) {
      const rejected = saveContactDraft(state, id);
      expect(rejected.error).toBe('Choose a distinct contact identifier.');
      expect(rejected.contacts).toBe(state.contacts);
    }
  });

  it('preserves source identity and legacy data while saving an independent edited draft', () => {
    const state = createContactEditorState('edit');
    const source = state.contacts.find((contact) => contact.id === state.selectedId);
    if (!source) throw new Error('Missing edit fixture');
    source.origin = 'Finance';
    source.legacy = { id: 'legacy-id', name: 'Source name', type: 'bank', abn: 'fictional' };
    const before = structuredClone(source);
    state.draft.name = 'Edited name';
    state.draft.kind = 'bank';
    state.draft.methods.push({ id: 'new', label: 'Custom protocol', value: 'Manual' });
    const saved = saveContactDraft(state, 'ignored-id');
    const contact = saved.contacts.find((item) => item.id === source.id);
    expect(contact?.name).toBe('Edited name');
    expect(contact?.kind).toBe('bank');
    expect(contact?.origin).toBe('Finance');
    expect(contact?.legacy).toBe(source.legacy);
    expect(source).toEqual(before);
    expect(saved.contacts[1]).toBe(state.contacts[1]);
    expect(saved.draft.methods).not.toBe(contact?.methods);
    saved.draft.methods[0]!.label = 'Draft only';
    expect(contact?.methods[0]?.label).not.toBe('Draft only');
  });

  it('does not recreate a selected contact that disappeared', () => {
    const state = createContactEditorState('edit');
    state.selectedId = 'removed-contact';
    const saved = saveContactDraft(state, 'replacement');
    expect(saved.error).toBe('The selected contact is unavailable.');
    expect(saved.contacts).toBe(state.contacts);
    expect(saved.selectedId).toBe('removed-contact');
    expect(resetContactDraft(state).error).toBe('The selected contact is unavailable.');
  });
});

describe('contact draft cancellation', () => {
  it('restores existing facts with independent rows and clears prior errors', () => {
    const state = createContactEditorState('business');
    const source = state.contacts.find((contact) => contact.id === state.selectedId);
    if (!source) throw new Error('Missing business fixture');
    state.draft.name = 'Unsaved';
    state.draft.methods[0]!.value = 'Unsaved';
    state.error = 'Old error';
    const restored = resetContactDraft(state);
    expect(restored.draft).toEqual(editableDraft(source));
    expect(restored.draft.methods[0]).not.toBe(source.methods[0]);
    expect(restored.draft.addresses[0]).not.toBe(source.addresses[0]);
    expect(restored.error).toBeNull();
    expect(restored.contacts).toBe(state.contacts);
  });

  it('clears new drafts and exposes sparse sources without invented optional facts', () => {
    const state = createContactEditorState('duplicate');
    const cleared = resetContactDraft({ ...state, error: 'Old error' });
    expect(cleared.draft).toEqual({
      name: '',
      kind: '',
      aliases: [],
      notes: '',
      methods: [],
      addresses: [],
    });
    expect(cleared.error).toBeNull();
    const sparse = createContactEditorState('sparse');
    expect(sparse.draft.name).toBe('Rui Almeida');
    expect(sparse.draft.methods).toEqual([]);
    expect(sparse.draft.addresses).toEqual([]);
    state.contacts.splice(0, 1);
    expect(
      createContactEditorState('duplicate').contacts.some(
        (contact) => contact.id === 'contact-marina'
      )
    ).toBe(true);
  });
});
