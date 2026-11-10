import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@pops/ui';

import { referenceEntries } from '../reference-entries';
import { ContactReference } from '../source-contacts/ContactReference';
import { sourceContactSession } from '../source-contacts/session';
import { SourceContactChooser } from '../source-contacts/SourceContactChooser';

import type { JSX } from 'react';

import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';

/** Select organiser references through Contacts while retaining existing opaque source values and exact removals. */
export function EventOrganisers({
  identity,
  links,
  disabled,
  commit,
}: {
  identity: EventWorkspaceProps;
  links: TripEvent['organiserLinks'];
  disabled: boolean;
  commit: (patch: EventPatch) => void;
}): JSX.Element {
  const session = sourceContactSession(useQueryClient(), {
    sourceKey: [identity.tripId, 'event', identity.eventId, 'organiserLinks'],
    client: identity.client,
    contacts: identity.contacts,
  });
  return (
    <section aria-label="Organisers" className="space-y-3">
      <h3 className="text-sm font-medium">Organisers</h3>
      {links.length === 0 && (
        <p className="text-sm text-muted-foreground">No organisers recorded</p>
      )}
      {referenceEntries(links).map(({ link, index, key }) => (
        <div key={key} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <ContactReference session={session} uri={link.uri} />
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={disabled}
            onClick={() =>
              commit({ organiserLinks: links.filter((_, position) => position !== index) })
            }
            aria-label={`Remove organiser ${index + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <SourceContactChooser
        key={session.id}
        session={session}
        links={links}
        disabled={disabled}
        select={(uri) => commit({ organiserLinks: [...links, { uri }] })}
      />
    </section>
  );
}
