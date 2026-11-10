import { SourceContactField } from '../source-contacts/SourceContactField';

import type { JSX } from 'react';

import type { SourceContactFieldLabels } from '../source-contacts/SourceContactField';
import type { EventPatch, EventWorkspaceProps, TripEvent } from './types';

const labels: SourceContactFieldLabels = {
  heading: 'Organisers',
  empty: 'No organisers recorded',
  choose: 'Add organiser',
  recover: 'Add selected organiser',
  replace: (position) => `Replace organiser ${position}`,
  remove: (position) => `Remove organiser ${position}`,
};
/** Select organisers through Contacts while retaining opaque source values and occurrence-specific removals. */
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
  return (
    <SourceContactField
      context={{
        sourceKey: [identity.tripId, 'event', identity.eventId, 'organiserLinks'],
        client: identity.client,
        contacts: identity.contacts,
      }}
      links={links}
      disabled={disabled}
      labels={labels}
      save={(organiserLinks) => commit({ organiserLinks })}
    />
  );
}
