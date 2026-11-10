import { SourceContactField } from '../source-contacts/SourceContactField';

import type { JSX } from 'react';

import type { SourceContactFieldLabels } from '../source-contacts/SourceContactField';
import type { Stay, StayPatch, StayWorkspaceProps } from './types';

const labels: SourceContactFieldLabels = {
  heading: 'Host',
  empty: 'No host selected',
  choose: 'Choose host',
  recover: 'Add selected host',
  replace: (position) => `Replace host ${position}`,
  remove: (position) => `Remove host link ${position}`,
};
/** Link the owner's issued Contact reference without changing stay addresses, provider facts or the Contact itself. */
export function StayHost({
  identity,
  links,
  disabled,
  commit,
}: {
  identity: Pick<StayWorkspaceProps, 'tripId' | 'stayId' | 'client' | 'contacts'>;
  links: Stay['hostLinks'];
  disabled: boolean;
  commit: (patch: StayPatch) => void;
}): JSX.Element {
  return (
    <SourceContactField
      context={{
        sourceKey: [identity.tripId, 'stay', identity.stayId, 'hostLinks'],
        client: identity.client,
        contacts: identity.contacts,
      }}
      links={links}
      disabled={disabled}
      labels={labels}
      save={(hostLinks) => commit({ hostLinks })}
    />
  );
}
