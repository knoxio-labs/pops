import { describe, expect, it } from 'vitest';

import { entities, ENTITY_TYPE_LABEL } from '../../fixtures/entities';
import { initialPerson } from '../contact-person-detail/model';
import { initialDirectory } from './fixture';
import {
  createDirectoryContact,
  directoryCities,
  directoryKinds,
  groupContacts,
  selectedDirectoryContact,
  visibleContacts,
} from './model';

describe('contact directory', () => {
  it('preserves the full Finance taxonomy and groups only populated kinds', () => {
    const state = initialDirectory();
    expect(directoryKinds).toHaveLength(7);
    expect(Object.fromEntries(directoryKinds.map(({ kind, label }) => [kind, label]))).toEqual(
      ENTITY_TYPE_LABEL
    );
    expect(groupContacts(state.contacts).map(({ kind }) => kind)).toEqual(
      directoryKinds.map(({ kind }) => kind)
    );
    expect(
      groupContacts(visibleContacts({ ...state, kind: 'bank' })).map(
        ({ kind, label, contacts }) => [kind, label, contacts.map((contact) => contact.kind)]
      )
    ).toEqual([['bank', 'Bank', ['bank']]]);
    expect(groupContacts([])).toEqual([]);
  });

  it.each([
    ['PRODUCOES', 'contact-horizonte'],
    ['clarinha', 'contact-clara'],
    ['MARINA@EXAMPLE.TEST', 'contact-marina'],
    ['porto alegre', 'contact-marina'],
    ['rua da bahia', 'contact-horizonte'],
    ['ATO', 'e3'],
  ])('searches accent-insensitive source facts for %s', (query, id) => {
    expect(
      visibleContacts({ ...initialDirectory(), query }).map((contact) => contact.id)
    ).toContain(id);
  });

  it('ANDs explicit origin, source kind and address city filters with search', () => {
    const state = initialDirectory();
    expect(
      visibleContacts({
        ...state,
        kind: 'company',
        city: 'Olinda',
        origin: 'Contacts',
        query: 'carmo',
      }).map((contact) => contact.id)
    ).toEqual(['contact-pousada']);
    expect(
      visibleContacts({ ...state, kind: 'company', city: 'Olinda', origin: 'Finance' })
    ).toEqual([]);
    expect(
      visibleContacts({ ...state, kind: 'bank', origin: 'Finance' }).map((contact) => contact.id)
    ).toEqual(['e4']);
    expect(visibleContacts({ ...state, city: 'olinda' })).toEqual([]);
    expect(visibleContacts({ ...state, kind: 'unknown' })).toEqual([]);
  });

  it('derives exact unique city choices only from nonblank address facts', () => {
    const state = initialDirectory();
    expect(directoryCities(state)).toEqual(['Belo Horizonte', 'Olinda', 'Porto Alegre']);
    expect(directoryCities(initialDirectory('sparse'))).toEqual([]);
    const contact = selectedDirectoryContact(state);
    if (!contact) throw new Error('Expected selected fixture contact');
    const withUnknown = {
      ...state,
      contacts: [
        ...state.contacts,
        {
          ...contact,
          id: 'unknown-city',
          addresses: [{ id: 'a', label: '', city: ' ', value: 'No city supplied' }],
        },
      ],
    };
    expect(directoryCities(withUnknown)).toEqual(directoryCities(state));
  });

  it('retains duplicate names as distinct identities with deterministic identifier ties', () => {
    const state = initialDirectory('duplicate-names');
    const records = visibleContacts({ ...state, query: 'Marina Duarte' });
    expect(records.map((contact) => contact.id)).toEqual([
      'contact-marina',
      'contact-marina-other',
    ]);
    expect(
      visibleContacts({ ...state, contacts: state.contacts.toReversed(), query: 'Marina Duarte' })
    ).toEqual(records);
    const next = createDirectoryContact(
      state,
      { name: 'Marina Duarte', kind: 'person' },
      'contact-third'
    );
    expect(visibleContacts({ ...next, query: 'Marina Duarte' })).toHaveLength(3);
  });

  it('creates a selected identity with empty optional facts and clears filters that would hide it', () => {
    const state = {
      ...initialDirectory(),
      query: 'nothing',
      kind: 'bank',
      origin: 'Finance',
      city: 'Olinda',
    };
    const next = createDirectoryContact(
      state,
      { name: '  New Venue  ', kind: 'place' },
      'contact-new'
    );
    expect(selectedDirectoryContact(next)).toEqual({
      id: 'contact-new',
      name: 'New Venue',
      kind: 'place',
      aliases: [],
      notes: '',
      methods: [],
      addresses: [],
      origin: 'Contacts',
    });
    expect([next.query, next.kind, next.city, next.origin]).toEqual(['', '', '', '']);
    expect(visibleContacts(next).some((contact) => contact.id === 'contact-new')).toBe(true);
    expect(next.contacts.slice(0, -1)).toEqual(state.contacts);
    expect(state.selectedId).toBe('contact-marina');
  });

  it.each([
    ['Name', 'unknown', 'new'],
    ['Name', '', 'new'],
    [' ', 'person', 'new'],
    ['Name', 'person', ' '],
    ['Name', 'person', 'e1'],
  ])('rejects invalid explicit creation %s / %s / %s', (name, kind, id) => {
    const state = initialDirectory();
    expect(createDirectoryContact(state, { name, kind }, id)).toBe(state);
  });

  it('keeps original legacy identifiers and every source field through filtering and creation', () => {
    const state = initialDirectory();
    const finance = state.contacts.filter((contact) => contact.origin === 'Finance');
    expect(finance.map((contact) => contact.id)).toEqual(entities.map((entity) => entity.id));
    for (const contact of finance) {
      const source = entities.find((entity) => entity.id === contact.id);
      expect(contact.legacy).toEqual(source);
      expect(contact.legacy).not.toBe(source);
      expect(contact.kind).toBe(source?.type);
      expect(contact.aliases).toEqual(source?.aliases ?? []);
      expect(contact.notes).toBe(source?.notes ?? '');
      expect(contact.addresses).toEqual([]);
    }
    visibleContacts({ ...state, query: 'ATO', kind: 'government', origin: 'Finance' });
    const next = createDirectoryContact(state, { name: 'ANZ', kind: 'bank' }, 'new-anz');
    expect(next.contacts.filter((contact) => contact.origin === 'Finance')).toEqual(finance);
    expect(next.contacts.find((contact) => contact.id === 'e4')).toBe(
      state.contacts.find((contact) => contact.id === 'e4')
    );
  });

  it('retains C02 Marina source facts and returns actual selected records', () => {
    const state = initialDirectory();
    const marina = initialPerson('default');
    const selected = selectedDirectoryContact(state);
    expect(selected).toBe(state.contacts.find((contact) => contact.id === 'contact-marina'));
    expect(selected?.methods).toEqual(
      marina.methods.map(({ id, label, value }) => ({ id, label, value }))
    );
    expect(selected?.addresses).toEqual(
      marina.addresses.map(({ id, label, city, address }) => ({ id, label, city, value: address }))
    );
    expect(selected?.notes).toBe(marina.notes);
    expect(selectedDirectoryContact({ ...state, selectedId: 'removed' })).toBeNull();
    expect(selectedDirectoryContact(initialDirectory('empty'))).toBeNull();
    expect(initialDirectory('empty').contacts).toEqual([]);
  });

  it('returns independent fixtures without mutating reusable Finance sources', () => {
    const first = initialDirectory();
    const second = initialDirectory();
    const contact = first.contacts.find((record) => record.id === 'e2');
    if (!contact?.legacy) throw new Error('Expected Finance fixture');
    contact.aliases.push('Local alias');
    contact.legacy.name = 'Local name';
    expect(second.contacts.find((record) => record.id === 'e2')?.name).toBe('Sarah Chen');
    expect(entities.find((entity) => entity.id === 'e2')?.name).toBe('Sarah Chen');
    expect(second.contacts.find((record) => record.id === 'e2')?.aliases).not.toContain(
      'Local alias'
    );
  });
});
