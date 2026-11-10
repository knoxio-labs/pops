import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { ArrangementsWorkspace, formatTripDate } from '@pops/trips-workspace';
import { TRIPS_NAV } from '@pops/trips/nav';
import { ErrorState } from '@pops/ui';

import { useArrangementContacts } from './arrangements/use-arrangement-contacts';
import { useArrangementLabels } from './arrangements/use-arrangement-labels';
import { sourceId } from './source-id';

import type { RemotePageHostProps } from '@pops/pillar-sdk';

/** Mount the approved arrangement workspace with real owning identity and shell-selected language. */
export function ArrangementsPage({ contacts }: RemotePageHostProps) {
  const params = useParams();
  const tripId = sourceId(params.tripId);
  const contactPicker = useArrangementContacts(contacts, tripId);
  const labels = useArrangementLabels();
  const { t, i18n } = useTranslation('trips');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return tripId === undefined ? (
    <ErrorState
      error={{
        code: 'trips.identity.invalid',
        message: t('arrangements.invalidIdentity'),
        retryable: false,
      }}
    />
  ) : (
    <ArrangementsWorkspace
      tripId={tripId}
      labels={labels}
      {...contactPicker}
      contacts={contacts}
      formatDate={(value) => formatTripDate(value, locale)}
      backHref={TRIPS_NAV.basePath}
    />
  );
}
