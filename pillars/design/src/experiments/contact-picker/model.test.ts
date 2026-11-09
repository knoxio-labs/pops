import { describe, expect, it } from 'vitest';

import { directoryKinds } from '../contact-directory/model';
import { createContactEditorState } from '../contact-editor/fixture';
import { createContactPickerState } from './fixture';
import {
  createAndLinkContact,
  linkPickerContact,
  pickerContactLabel,
  unlinkPickerContact,
  visiblePickerContacts,
} from './model';

describe('shared directory search', () => {
  it.each([
    ['producoes', 'contact-horizonte'],
    ['CLARINHA', 'contact-clara'],
    ['marina@example.test', 'contact-marina'],
    ['Olinda', 'contact-pousada'],
    ['Rua das Flores', 'contact-marina'],
  ])('finds explicit source facts for %j', (query, id) => {
    expect(
      visiblePickerContacts(createContactPickerState(), query, '').some(
        (contact) => contact.id === id
      )
    ).toBe(true);
  });

  it('preserves all seven source kinds and combines explicit search and kind filters', () => {
    const state = createContactPickerState();
    expect(directoryKinds).toHaveLength(7);
    for (const { kind } of directoryKinds) {
      const filtered = visiblePickerContacts(state, '', kind);
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((contact) => contact.kind === kind)).toBe(true);
    }
    expect(visiblePickerContacts(state, 'Carmo', 'company').map((contact) => contact.id)).toEqual([
      'contact-pousada',
    ]);
    expect(visiblePickerContacts(state, 'Carmo', 'person')).toEqual([]);
    expect(visiblePickerContacts(state, '', 'unsupported')).toEqual([]);
    expect(visiblePickerContacts(state, '', '')).toHaveLength(state.contacts.length);
  });
});

describe('explicit task links', () => {
  it('links distinct source IDs even when names match, without duplicating a link', () => {
    const state = createContactPickerState('duplicate-names');
    const first = linkPickerContact(state, 'contact-marina');
    const second = linkPickerContact(first, 'contact-marina-other');
    expect(second.linkedIds).toEqual(['contact-clara', 'contact-marina', 'contact-marina-other']);
    expect(linkPickerContact(second, 'contact-marina')).toBe(second);
    expect(linkPickerContact(state, '')).toBe(state);
    expect(linkPickerContact(state, 'missing')).toBe(state);
    expect(second.contacts).toBe(state.contacts);
    expect(second.task).toBe(state.task);
    expect(state.linkedIds).toEqual(['contact-clara']);
  });

  it('unlinks only the association and retains unresolved sources without substitution', () => {
    const state = createContactPickerState('missing-reference');
    expect(pickerContactLabel(state, 'removed-contact')).toBe('Contact unavailable');
    expect(pickerContactLabel(state, '')).toBe('Contact unavailable');
    expect(pickerContactLabel(state, 'contact-marina')).toBe('Marina Duarte');
    const unlinked = unlinkPickerContact(state, 'removed-contact');
    expect(unlinked.linkedIds).toEqual([]);
    expect(unlinked.contacts).toBe(state.contacts);
    expect(unlinked.task).toBe(state.task);
    expect(unlinkPickerContact(state, 'unlinked')).toBe(state);
    const linked = createContactPickerState();
    expect(unlinkPickerContact(linked, 'contact-clara').contacts).toBe(linked.contacts);
  });
});

describe('atomic directory creation and linking', () => {
  it('creates from explicit draft facts without inferring a kind or merging the same name', () => {
    const state = createContactPickerState();
    const draft = createContactEditorState('duplicate').draft;
    draft.aliases = [' B. '];
    draft.methods = [{ id: 'custom', label: ' Manual ', value: ' @marina ' }];
    draft.addresses = [{ id: 'partial', label: '', city: ' 東京 ', value: '' }];
    const before = structuredClone(state);
    const result = createAndLinkContact(state, draft, 'new-marina');
    expect(result.error).toBeNull();
    expect(
      result.state.contacts.filter((contact) => contact.name === 'Marina Duarte')
    ).toHaveLength(2);
    expect(result.state.linkedIds).toEqual(['contact-clara', 'new-marina']);
    expect(result.state.contacts.at(-1)).toMatchObject({
      id: 'new-marina',
      kind: 'person',
      origin: 'Contacts',
      aliases: ['B.'],
      methods: [{ id: 'custom', label: 'Manual', value: '@marina' }],
      addresses: [{ id: 'partial', label: '', city: '東京', value: '' }],
    });
    expect(result.state.task).toBe(state.task);
    expect(result.state.contacts[0]).toBe(state.contacts[0]);
    expect(state).toEqual(before);
    expect(draft.methods[0]?.value).toBe(' @marina ');
  });

  it.each([
    ['', 'person', 'new', 'Enter a name.'],
    ['Named draft', '', 'new', 'Choose a contact kind.'],
    ['Named draft', 'other', 'new', 'Choose a contact kind.'],
    ['Named draft', 'person', '', 'Choose a distinct contact identifier.'],
    ['Named draft', 'person', 'contact-marina', 'Choose a distinct contact identifier.'],
  ])('rejects invalid create atomically %j %j %j', (name, kind, id, error) => {
    const state = createContactPickerState();
    const draft = { ...createContactEditorState().draft, name, kind };
    const result = createAndLinkContact(state, draft, id);
    expect(result.state).toBe(state);
    expect(result.error).toBe(error);
  });

  it('creates every explicitly selected taxonomy kind with no optional facts or fabricated prefill', () => {
    for (const { kind } of directoryKinds) {
      const state = createContactPickerState('empty');
      const blank = createContactEditorState().draft;
      expect(blank.kind).toBe('');
      const draft = { ...blank, name: 'Explicit selection', kind };
      const result = createAndLinkContact(state, draft, `new-${kind}`);
      expect(result.error).toBeNull();
      expect(result.state.contacts[0]).toEqual({
        ...draft,
        id: `new-${kind}`,
        origin: 'Contacts',
      });
      expect(result.state.linkedIds).toEqual([`new-${kind}`]);
      expect(result.state.task).toBe(state.task);
    }
  });

  it.each(['removed-contact', ' removed-contact '])(
    'rejects creating over an unresolved linked identity %j',
    (id) => {
      const state = createContactPickerState('missing-reference');
      const draft = { ...createContactEditorState().draft, name: 'New identity', kind: 'person' };
      const result = createAndLinkContact(state, draft, id);
      expect(result).toEqual({ state, error: 'Choose a distinct contact identifier.' });
      expect(result.state).toBe(state);
      expect(pickerContactLabel(result.state, 'removed-contact')).toBe('Contact unavailable');
      expect(result.state.linkedIds).toEqual(['removed-contact']);
    }
  );

  it('keeps independent fictional scenarios and full external provenance', () => {
    const state = createContactPickerState('business');
    expect(state.linkedIds).toEqual(['contact-pousada']);
    const source = state.contacts.find((contact) => contact.origin === 'Finance');
    if (!source) throw new Error('Missing Finance fixture');
    const before = structuredClone(source);
    const linked = linkPickerContact(state, source.id);
    expect(linked.contacts.find((contact) => contact.id === source.id)).toBe(source);
    expect(source).toEqual(before);
    state.contacts.splice(0, 1);
    expect(createContactPickerState().contacts[0]?.id).toBe('contact-marina');
    expect(createContactPickerState('empty').task).toEqual(state.task);
    expect(createContactPickerState('empty').contacts).toEqual([]);
  });
});
