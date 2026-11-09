import { pickerContactLabel } from './model';

import type { ContactPickerState } from './model';

/** Disambiguates identical display names by stable source order without treating them as duplicate identities. */
export function pickerIdentityLabel(state: ContactPickerState, id: string): string {
  const contact = state.contacts.find((item) => item.id === id);
  const label = pickerContactLabel(state, id);
  if (!contact) return label;
  const sameName = state.contacts.filter((item) => item.name === contact.name);
  if (sameName.length < 2) return label;
  return `${label} · Contact ${sameName.findIndex((item) => item.id === id) + 1}`;
}
