import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { CalendarWorkspace } from '@pops/trips-workspace';
import { ErrorState } from '@pops/ui';

import { sourceId } from './source-id';

/** Mount the trip-owned calendar and open exact independent source identities. */
export function CalendarPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation('trips');
  const tripId = sourceId(params.tripId);
  return tripId === undefined ? (
    <ErrorState
      error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
    />
  ) : (
    <CalendarWorkspace
      tripId={tripId}
      locale={i18n.resolvedLanguage ?? i18n.language}
      onOpenSource={({ kind, id }) => {
        const collection = { journey: 'journeys', stay: 'stays', event: 'events' }[kind];
        void navigate(`/trips/${tripId}/${collection}/${id}`);
      }}
    />
  );
}
