import type { ArrangementResponsible, ArrangementState } from './types';

/** Resolves only an explicit association; missing contact sources remain visible and removable. */
export function arrangementResponsibility(
  state: ArrangementState,
  recordId: string
): ArrangementResponsible | undefined {
  const association = state.responsibilities.find((entry) => entry.recordId === recordId);
  if (!association) return undefined;
  const contact = state.contacts.find((entry) => entry.id === association.contactId);
  return contact
    ? { contactId: contact.id, label: contact.name, self: contact.self, available: true }
    : { contactId: association.contactId, label: 'Contact unavailable', available: false };
}
