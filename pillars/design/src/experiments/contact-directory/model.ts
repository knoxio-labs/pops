import { ENTITY_TYPE_LABEL, type Entity, type EntityType } from '../../fixtures/entities';

/** A directory identity retains its complete source kind and optionally its original Finance entity. */
export interface DirectoryContact {
  id: string;
  name: string;
  kind: EntityType;
  aliases: string[];
  notes: string;
  methods: { id: string; label: string; value: string }[];
  addresses: { id: string; label: string; city: string; value: string }[];
  origin: 'Contacts' | 'Finance';
  legacy?: Entity;
}

/** Local directory selection and independently combined explicit filters. */
export interface DirectoryState {
  contacts: DirectoryContact[];
  query: string;
  kind: string;
  city: string;
  origin: string;
  selectedId: string | null;
}

function isEntityType(value: string): value is EntityType {
  return Object.hasOwn(ENTITY_TYPE_LABEL, value);
}

/** Complete existing source taxonomy; no entity kind is folded into another kind. */
export const directoryKinds: { kind: EntityType; label: string }[] = Object.entries(
  ENTITY_TYPE_LABEL
).flatMap(([kind, label]) => (isEntityType(kind) ? [{ kind, label }] : []));

const nameOrder = new Intl.Collator('en', { sensitivity: 'base' });

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

function compareContacts(left: DirectoryContact, right: DirectoryContact): number {
  return nameOrder.compare(left.name, right.name) || left.id.localeCompare(right.id, 'en');
}

/** Searches source facts with accent and case folding, then ANDs explicit kind, city and origin filters. */
export function visibleContacts(state: DirectoryState): DirectoryContact[] {
  const query = fold(state.query.trim());
  return state.contacts
    .filter((contact) => {
      if (state.kind && contact.kind !== state.kind) return false;
      if (state.origin && contact.origin !== state.origin) return false;
      if (state.city && !contact.addresses.some((address) => address.city === state.city))
        return false;
      const facts = [
        contact.name,
        ...contact.aliases,
        ...contact.methods.map((method) => method.value),
        ...contact.addresses.flatMap((address) => [address.city, address.value]),
      ];
      return facts.some((fact) => fold(fact).includes(query));
    })
    .toSorted(compareContacts);
}

/** Groups visible records under their complete source kind labels, omitting only empty groups. */
export function groupContacts(
  contacts: DirectoryContact[]
): { kind: EntityType; label: string; contacts: DirectoryContact[] }[] {
  return directoryKinds.flatMap(({ kind, label }) => {
    const members = contacts.filter((contact) => contact.kind === kind).toSorted(compareContacts);
    return members.length ? [{ kind, label, contacts: members }] : [];
  });
}

/** Lists exact unique address cities from source facts; unknown and whitespace-only cities have no choice. */
export function directoryCities(state: DirectoryState): string[] {
  return [
    ...new Set(
      state.contacts
        .flatMap((contact) => contact.addresses.map((address) => address.city))
        .filter((city) => city.trim())
    ),
  ].toSorted(nameOrder.compare);
}

/** Creates a distinct Contacts identity from explicit valid input with no invented contact facts or merging. */
export function createDirectoryContact(
  state: DirectoryState,
  input: { name: string; kind: string },
  id: string
): DirectoryState {
  if (
    !input.name.trim() ||
    !id.trim() ||
    !isEntityType(input.kind) ||
    state.contacts.some((contact) => contact.id === id)
  )
    return state;
  const contact: DirectoryContact = {
    id,
    name: input.name.trim(),
    kind: input.kind,
    aliases: [],
    notes: '',
    methods: [],
    addresses: [],
    origin: 'Contacts',
  };
  return {
    ...state,
    contacts: [...state.contacts, contact],
    selectedId: id,
    query: '',
    kind: '',
    city: '',
    origin: '',
  };
}

/** Resolves the selected source record without synthesising a fallback identity. */
export function selectedDirectoryContact(state: DirectoryState): DirectoryContact | null {
  return state.contacts.find((contact) => contact.id === state.selectedId) ?? null;
}
