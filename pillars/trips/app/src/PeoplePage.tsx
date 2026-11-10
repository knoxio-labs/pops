import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { PeopleWorkspace } from '@pops/trips-workspace';

import { sourceId } from './source-id';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

/** Bind the people workspace to its owning trip and the shell-injected Contacts capability. */
export function PeoplePage({ contacts }: RemotePageHostProps) {
  const { t } = useTranslation('trips');
  const tripId = sourceId(useParams().tripId);
  if (tripId === undefined)
    return (
      <p role="alert">
        {t('people.invalid')} <code>trips.identity.invalid</code>
      </p>
    );
  return (
    <PeopleWorkspace
      tripId={tripId}
      contacts={contacts}
      text={(key, values) => t(`people.${key}`, values)}
    />
  );
}
