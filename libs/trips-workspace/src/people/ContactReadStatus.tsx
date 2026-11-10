import type { JSX } from 'react';

import type { MeetingContact, PeopleText } from './types';

/** Metadata failures retain proven canonical identity separately from the stored source URI. */
export function ContactReadStatus({
  contact,
  uri,
  text,
}: {
  contact: MeetingContact | undefined;
  uri: string | null;
  text: PeopleText;
}): JSX.Element | null {
  if (!contact || contact.status === 'available' || contact.status === 'unverified') return null;
  const reference = 'reference' in contact ? contact.reference : undefined;
  return (
    <>
      {reference && reference.uri !== uri && (
        <p className="break-all text-xs text-muted-foreground">
          {text('contactCanonical', { uri: reference.uri })}
        </p>
      )}
      {(contact.status === 'unavailable' || contact.status === 'readError') && (
        <p role="alert" className="text-sm text-destructive">
          <code>{`trips.contact.${contact.status}`}</code>
        </p>
      )}
    </>
  );
}
