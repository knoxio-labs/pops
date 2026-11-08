import type { DirectoryContact } from '../contact-directory/model';

/** Editable business facts and independent, read-only source catalogues for the local prototype. */
export interface BusinessState {
  business: DirectoryContact;
  websites: { id: string; label: string; url: string }[];
  locations: { id: string; label: string; address: string; city: string }[];
  people: { id: string; contactId: string; role: string; locationId: string }[];
  contacts: { id: string; name: string; method: string }[];
  arrangements: {
    id: string;
    title: string;
    kind: 'stay' | 'event' | 'journey';
    status: 'Purchased' | 'Reserved' | 'Considering';
    businessId: string;
    locationId: string;
    from: string;
    to: string;
  }[];
}

/** Named fictional states available for visual review. */
export type BusinessScenario = 'default' | 'empty' | 'organisation' | 'missing-reference';

function upsert<T extends { id: string }>(records: T[], input: T): T[] {
  return records.some((record) => record.id === input.id)
    ? records.map((record) => (record.id === input.id ? input : record))
    : [...records, input];
}

/** Changes explicit identity fields, retaining the source kind, provenance and unrelated facts. */
export function updateBusinessIdentity(
  state: BusinessState,
  input: { name: string; notes: string }
): BusinessState {
  return input.name.trim()
    ? { ...state, business: { ...state.business, ...input, name: input.name.trim() } }
    : state;
}

/** Saves an explicitly identified contact method with a nonempty value; labels are optional. */
export function saveBusinessMethod(
  state: BusinessState,
  input: BusinessState['business']['methods'][number]
): BusinessState {
  return input.id.trim() && input.value.trim()
    ? { ...state, business: { ...state.business, methods: upsert(state.business.methods, input) } }
    : state;
}

/** Removes only the method with the supplied identifier. */
export function removeBusinessMethod(state: BusinessState, id: string): BusinessState {
  return {
    ...state,
    business: {
      ...state.business,
      methods: state.business.methods.filter((item) => item.id !== id),
    },
  };
}

/** Saves a location containing at least one explicit fact; manual city and address text are unrestricted. */
export function saveBusinessLocation(
  state: BusinessState,
  input: BusinessState['locations'][number]
): BusinessState {
  return input.id.trim() && [input.label, input.address, input.city].some((value) => value.trim())
    ? { ...state, locations: upsert(state.locations, input) }
    : state;
}

/** Removes only a location; existing references remain unresolved until explicitly edited. */
export function removeBusinessLocation(state: BusinessState, id: string): BusinessState {
  return { ...state, locations: state.locations.filter((item) => item.id !== id) };
}

/** Allows only nonempty absolute HTTP(S) URLs for saved websites and their clickable presentation. */
export function isBusinessWebsiteUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Saves a nonempty absolute HTTP(S) URL; unsafe protocols and incomplete drafts remain unsaved. */
export function saveBusinessWebsite(
  state: BusinessState,
  input: BusinessState['websites'][number]
): BusinessState {
  return input.id.trim() && isBusinessWebsiteUrl(input.url)
    ? { ...state, websites: upsert(state.websites, input) }
    : state;
}

/** Removes only the website with the supplied identifier. */
export function removeBusinessWebsite(state: BusinessState, id: string): BusinessState {
  return { ...state, websites: state.websites.filter((item) => item.id !== id) };
}

/** Saves known references or retains unchanged unresolved references on an existing association. */
export function saveBusinessPerson(
  state: BusinessState,
  input: BusinessState['people'][number]
): BusinessState {
  const existing = state.people.find((person) => person.id === input.id);
  const retainedContact = Boolean(input.contactId) && existing?.contactId === input.contactId;
  const retainedLocation = Boolean(input.locationId) && existing?.locationId === input.locationId;
  if (
    !input.id.trim() ||
    (!retainedContact && !state.contacts.some((contact) => contact.id === input.contactId)) ||
    (input.locationId !== '' &&
      !retainedLocation &&
      !state.locations.some((location) => location.id === input.locationId))
  )
    return state;
  return { ...state, people: upsert(state.people, input) };
}

/** Removes an association without deleting its source contact. */
export function removeBusinessPerson(state: BusinessState, id: string): BusinessState {
  return { ...state, people: state.people.filter((item) => item.id !== id) };
}

/** Resolves a location without exposing opaque identifiers; an unset optional reference has no label. */
export function locationLabel(state: BusinessState, id: string): string {
  if (!id) return '';
  const location = state.locations.find((item) => item.id === id);
  return location
    ? [location.label, location.address, location.city].filter(Boolean).join(' · ')
    : 'Location unavailable';
}

/** Resolves a contact reference without synthesising a contact from an association. */
export function businessContactLabel(state: BusinessState, id: string): string {
  return state.contacts.find((contact) => contact.id === id)?.name ?? 'Contact unavailable';
}

/** Reports broken explicit source references without repairing, reassigning or discarding them. */
export function businessReferenceFindings(state: BusinessState): { id: string; message: string }[] {
  return [
    ...state.people.flatMap((person) => [
      ...(!state.contacts.some((contact) => contact.id === person.contactId)
        ? [{ id: `person-contact-${person.id}`, message: 'A linked contact is unavailable.' }]
        : []),
      ...(person.locationId &&
      !state.locations.some((location) => location.id === person.locationId)
        ? [
            {
              id: `person-location-${person.id}`,
              message: 'A linked person’s location is unavailable.',
            },
          ]
        : []),
    ]),
    ...state.arrangements.flatMap((arrangement) => [
      ...(arrangement.businessId !== state.business.id
        ? [
            {
              id: `arrangement-business-${arrangement.id}`,
              message: 'An arrangement’s business is unavailable.',
            },
          ]
        : []),
      ...(arrangement.locationId &&
      !state.locations.some((location) => location.id === arrangement.locationId)
        ? [
            {
              id: `arrangement-location-${arrangement.id}`,
              message: 'An arrangement’s location is unavailable.',
            },
          ]
        : []),
    ]),
  ];
}
