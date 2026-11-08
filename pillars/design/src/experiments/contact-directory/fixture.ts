import { entities, type Entity } from '../../fixtures/entities';
import { initialPerson } from '../contact-person-detail/model';

import type { DirectoryContact, DirectoryState } from './model';

/** Fictional directory snapshots for source-rich, blank, sparse and same-name identities. */
export type DirectoryScenario = 'default' | 'empty' | 'sparse' | 'duplicate-names';

function marinaContact(): DirectoryContact {
  const marina = initialPerson('default');
  return {
    id: 'contact-marina',
    name: marina.name,
    kind: 'person',
    aliases: [],
    notes: marina.notes,
    methods: marina.methods.map(({ id, label, value }) => ({ id, label, value })),
    addresses: marina.addresses.map(({ id, label, city, address }) => ({
      id,
      label,
      city,
      value: address,
    })),
    origin: 'Contacts',
  };
}

function contacts(): DirectoryContact[] {
  return [
    marinaContact(),
    {
      id: 'contact-clara',
      name: 'Clara Silva',
      kind: 'person',
      aliases: ['Clarinha'],
      notes: '',
      methods: [{ id: 'method-clara-email', label: 'Personal', value: 'clara@example.test' }],
      addresses: [],
      origin: 'Contacts',
    },
    {
      id: 'contact-pousada',
      name: 'Pousada do Carmo',
      kind: 'company',
      aliases: [],
      notes: '',
      methods: [
        { id: 'method-pousada-email', label: 'Reservations', value: 'reservas@carmo.example.test' },
      ],
      addresses: [
        { id: 'address-pousada', label: 'Reception', city: 'Olinda', value: 'Rua do Carmo, 42' },
      ],
      origin: 'Contacts',
    },
    {
      id: 'contact-horizonte',
      name: 'Horizonte Produções',
      kind: 'organisation',
      aliases: ['Horizonte'],
      notes: '',
      methods: [],
      addresses: [
        {
          id: 'address-horizonte',
          label: 'Office',
          city: 'Belo Horizonte',
          value: 'Rua da Bahia, 90',
        },
      ],
      origin: 'Contacts',
    },
  ];
}

function financeContact(source: Entity): DirectoryContact {
  const legacy = structuredClone(source);
  return {
    id: legacy.id,
    name: legacy.name,
    kind: legacy.type,
    aliases: [...(legacy.aliases ?? [])],
    notes: legacy.notes ?? '',
    methods: [],
    addresses: [],
    origin: 'Finance',
    legacy,
  };
}

/** Returns independent snapshots while preserving every legacy Finance identity, field and source taxonomy. */
export function initialDirectory(scenario: DirectoryScenario = 'default'): DirectoryState {
  const state: DirectoryState = {
    contacts: [...contacts(), ...entities.map(financeContact)],
    query: '',
    kind: '',
    city: '',
    origin: '',
    selectedId: 'contact-marina',
  };
  if (scenario === 'empty') return { ...state, contacts: [], selectedId: null };
  if (scenario === 'sparse')
    return {
      ...state,
      contacts: [
        {
          id: 'contact-sparse',
          name: 'Rui Almeida',
          kind: 'person',
          aliases: [],
          notes: '',
          methods: [],
          addresses: [],
          origin: 'Contacts',
        },
      ],
      selectedId: 'contact-sparse',
    };
  if (scenario === 'duplicate-names')
    return {
      ...state,
      contacts: [
        ...state.contacts,
        {
          id: 'contact-marina-other',
          name: 'Marina Duarte',
          kind: 'person',
          aliases: [],
          notes: '',
          methods: [],
          addresses: [],
          origin: 'Contacts',
        },
      ],
    };
  return state;
}
